import { schema, table, t } from "spacetimedb/server";

// --- Tables ---

const Player = table(
  { name: "player", public: true },
  {
    identity: t.identity().primaryKey(),
    username: t.string(),
    x: t.f64(),
    y: t.f64(),
  }
);

export const spacetimedb = schema(Player);

// --- Lifecycle ---

spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) return;

  ctx.db.player.insert({
    identity: ctx.sender,
    username: "",
    x: 0,
    y: 0,
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

spacetimedb.reducer(
  "update_position",
  { x: t.f64(), y: t.f64() },
  (ctx, { x, y }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) return;
    ctx.db.player.identity.update({ ...player, x, y });
  }
);
