import { schema, table, t } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

// Constants
const BULLET_SPEED = 800;
const NPC_SPEED = 120;
const TICK_DT = 0.05; // 50ms
const TICK_MICROS = 50_000n;
const PLAYER_RADIUS = 18;
const HIT_RADIUS = 22;
const WORLD_W = 2000;
const WORLD_H = 1200;
const NPC_COUNT = 5;

// Deterministic PRNG (integer LCG)
function rng(timestamp: bigint, salt: number): number {
  let s = (Number(timestamp % 2147483647n) ^ ((salt * 2654435761) & 0x7fffffff)) & 0x7fffffff;
  s = ((s * 1103515245 + 12345) & 0x7fffffff);
  return s / 0x7fffffff; // 0..1
}

function respawnPos(timestamp: bigint, salt: number): { x: number; y: number } {
  const x = rng(timestamp, salt) * (WORLD_W - 200) + 100;
  const y = rng(timestamp, salt + 7777) * (WORLD_H - 200) + 100;
  return { x, y };
}

// --- Tables ---

const Player = table(
  { name: "player", public: true },
  {
    identity: t.identity().primaryKey(),
    x: t.f64(),
    y: t.f64(),
    hue: t.u32(),
    deaths: t.u32(),
    kills: t.u32(),
    username: t.string(),
  }
);

const Bullet = table(
  {
    name: "bullet",
    public: true,
    indexes: [{ name: "by_owner", algorithm: "btree" as const, columns: ["ownerId"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerId: t.identity(),
    x: t.f64(),
    y: t.f64(),
    dirX: t.f64(),
    dirY: t.f64(),
  }
);

const Npc = table(
  { name: "npc", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    x: t.f64(),
    y: t.f64(),
    hue: t.u32(),
    dirX: t.f64(),
    dirY: t.f64(),
  }
);

const NpcBullet = table(
  { name: "npc_bullet", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    npcOwnerId: t.u64(),
    x: t.f64(),
    y: t.f64(),
    dirX: t.f64(),
    dirY: t.f64(),
  }
);

const GameLoop = table(
  { name: "game_loop", scheduled: "game_tick" },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const spacetimedb = schema(Player, Bullet, Npc, NpcBullet, GameLoop);

// --- Lifecycle ---

spacetimedb.init((ctx) => {
  // Schedule the first game tick
  ctx.db.gameLoop.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + TICK_MICROS),
  });

  // Spawn NPCs
  const ts = ctx.timestamp.microsSinceUnixEpoch;
  for (let i = 0; i < NPC_COUNT; i++) {
    const pos = respawnPos(ts, i * 100);
    const angle = rng(ts, i * 100 + 50) * Math.PI * 2;
    ctx.db.npc.insert({
      id: 0n,
      x: pos.x,
      y: pos.y,
      hue: Math.floor(rng(ts, i * 100 + 99) * 360),
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
    });
  }
});

spacetimedb.clientConnected((ctx) => {
  // If player already exists (reconnect), skip insert
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) return;

  const micro = Number(ctx.timestamp.microsSinceUnixEpoch % 1000000n);
  const x = ((micro % 1000) / 1000) * 1600 + 200;
  const y = (((micro / 1000) | 0) % 1000) / 1000 * 800 + 100;
  const hue = micro % 360;

  ctx.db.player.insert({
    identity: ctx.sender,
    x,
    y,
    hue,
    deaths: 0,
    kills: 0,
    username: "",
  });
});

spacetimedb.clientDisconnected((ctx) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player) {
    ctx.db.player.identity.delete(ctx.sender);
  }
});

// --- Reducers ---

spacetimedb.reducer(
  "update_position",
  { x: t.f64(), y: t.f64() },
  (ctx, { x, y }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) return;
    ctx.db.player.identity.update({ ...player, x, y });
  }
);

spacetimedb.reducer(
  "shoot",
  { dirX: t.f64(), dirY: t.f64() },
  (ctx, { dirX, dirY }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) return;

    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) return;
    const ndx = dirX / len;
    const ndy = dirY / len;

    ctx.db.bullet.insert({
      id: 0n,
      ownerId: ctx.sender,
      x: player.x + ndx * PLAYER_RADIUS,
      y: player.y + ndy * PLAYER_RADIUS,
      dirX: ndx,
      dirY: ndy,
    });
  }
);

spacetimedb.reducer(
  "set_username",
  { username: t.string() },
  (ctx, { username }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) return;
    const trimmed = username.slice(0, 16).trim();
    if (trimmed.length === 0) return;
    ctx.db.player.identity.update({ ...player, username: trimmed });
  }
);

// --- Game Tick (scheduled) ---

spacetimedb.reducer("game_tick", { arg: GameLoop.rowType }, (ctx, { arg }) => {
  const ts = ctx.timestamp.microsSinceUnixEpoch;
  const tickSeed = Number(ts % 2147483647n);

  // Collect all entities
  const bullets = [...ctx.db.bullet.iter()];
  const npcBullets = [...ctx.db.npcBullet.iter()];
  const players = [...ctx.db.player.iter()];
  const npcs = [...ctx.db.npc.iter()];

  // --- 1. Move NPCs ---
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    const nid = Number(npc.id);

    // Small chance to change direction
    if (rng(ts, nid * 31 + 1) < 0.05) {
      const angle = rng(ts, nid * 31 + 2) * Math.PI * 2;
      npc.dirX = Math.cos(angle);
      npc.dirY = Math.sin(angle);
    }

    npc.x += npc.dirX * NPC_SPEED * TICK_DT;
    npc.y += npc.dirY * NPC_SPEED * TICK_DT;

    // Wall bounce
    if (npc.x < PLAYER_RADIUS) { npc.x = PLAYER_RADIUS; npc.dirX = Math.abs(npc.dirX); }
    if (npc.x > WORLD_W - PLAYER_RADIUS) { npc.x = WORLD_W - PLAYER_RADIUS; npc.dirX = -Math.abs(npc.dirX); }
    if (npc.y < PLAYER_RADIUS) { npc.y = PLAYER_RADIUS; npc.dirY = Math.abs(npc.dirY); }
    if (npc.y > WORLD_H - PLAYER_RADIUS) { npc.y = WORLD_H - PLAYER_RADIUS; npc.dirY = -Math.abs(npc.dirY); }

    ctx.db.npc.id.update(npc);
  }

  // --- 2. NPC shooting ---
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    const nid = Number(npc.id);

    if (rng(ts, nid * 53 + 10) < 0.03 && players.length > 0) {
      // Find nearest player
      let nearest = players[0];
      let bestDist = Infinity;
      for (const p of players) {
        const dx = p.x - npc.x;
        const dy = p.y - npc.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; nearest = p; }
      }

      const dx = nearest.x - npc.x;
      const dy = nearest.y - npc.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        // Add slight random jitter to aim
        const jitter = (rng(ts, nid * 53 + 20) - 0.5) * 0.3;
        const angle = Math.atan2(dy, dx) + jitter;
        const ndx = Math.cos(angle);
        const ndy = Math.sin(angle);

        ctx.db.npcBullet.insert({
          id: 0n,
          npcOwnerId: npc.id,
          x: npc.x + ndx * PLAYER_RADIUS,
          y: npc.y + ndy * PLAYER_RADIUS,
          dirX: ndx,
          dirY: ndy,
        });
      }
    }
  }

  // --- 3. Advance player bullets ---
  for (const bullet of bullets) {
    const nx = bullet.x + bullet.dirX * BULLET_SPEED * TICK_DT;
    const ny = bullet.y + bullet.dirY * BULLET_SPEED * TICK_DT;

    if (nx < -50 || nx > WORLD_W + 50 || ny < -50 || ny > WORLD_H + 50) {
      ctx.db.bullet.id.delete(bullet.id);
      continue;
    }

    let hit = false;
    const ownerHex = bullet.ownerId.toHexString();

    // Check collision vs players
    for (const player of players) {
      if (player.identity.toHexString() === ownerHex) continue;
      const dx = player.x - nx;
      const dy = player.y - ny;
      if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
        // Respawn victim
        const pos = respawnPos(ts, tickSeed ^ Number(bullet.id));
        ctx.db.player.identity.update({ ...player, x: pos.x, y: pos.y, deaths: player.deaths + 1 });
        // Credit kill to bullet owner
        const owner = ctx.db.player.identity.find(bullet.ownerId);
        if (owner) {
          ctx.db.player.identity.update({ ...owner, kills: owner.kills + 1 });
        }
        ctx.db.bullet.id.delete(bullet.id);
        hit = true;
        break;
      }
    }

    // Check collision vs NPCs
    if (!hit) {
      for (const npc of npcs) {
        const dx = npc.x - nx;
        const dy = npc.y - ny;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          // Respawn NPC
          const pos = respawnPos(ts, tickSeed ^ (Number(npc.id) + 5000));
          ctx.db.npc.id.update({ ...npc, x: pos.x, y: pos.y });
          // Credit kill to bullet owner
          const owner = ctx.db.player.identity.find(bullet.ownerId);
          if (owner) {
            ctx.db.player.identity.update({ ...owner, kills: owner.kills + 1 });
          }
          ctx.db.bullet.id.delete(bullet.id);
          hit = true;
          break;
        }
      }
    }

    if (!hit) {
      ctx.db.bullet.id.update({ ...bullet, x: nx, y: ny });
    }
  }

  // --- 4. Advance NPC bullets ---
  for (const nb of npcBullets) {
    const nx = nb.x + nb.dirX * BULLET_SPEED * TICK_DT;
    const ny = nb.y + nb.dirY * BULLET_SPEED * TICK_DT;

    if (nx < -50 || nx > WORLD_W + 50 || ny < -50 || ny > WORLD_H + 50) {
      ctx.db.npcBullet.id.delete(nb.id);
      continue;
    }

    let hit = false;
    for (const player of players) {
      const dx = player.x - nx;
      const dy = player.y - ny;
      if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
        // Respawn player
        const pos = respawnPos(ts, tickSeed ^ (Number(nb.id) + 9000));
        ctx.db.player.identity.update({ ...player, x: pos.x, y: pos.y, deaths: player.deaths + 1 });
        ctx.db.npcBullet.id.delete(nb.id);
        hit = true;
        break;
      }
    }

    if (!hit) {
      ctx.db.npcBullet.id.update({ ...nb, x: nx, y: ny });
    }
  }

  // --- 5. Reschedule ---
  ctx.db.gameLoop.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ts + TICK_MICROS),
  });
});
