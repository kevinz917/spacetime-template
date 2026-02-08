import { useState, useEffect, useRef, useCallback } from "react";
import { tables, reducers } from "./module_bindings";
import { useTable, useReducer } from "spacetimedb/react";

const SPEED = 350;
const PLAYER_RADIUS = 18;
const LERP_FACTOR = 0.12;
const SYNC_INTERVAL = 50;
const WORLD_W = 2000;
const WORLD_H = 1200;
const BULLET_SPEED = 800;
const BULLET_RADIUS = 4;

function App() {
  // Username prompt state
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("username"));
  const [usernameInput, setUsernameInput] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const localPosRef = useRef<{ x: number; y: number } | null>(null);
  const displayPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const remoteDeathsRef = useRef<Map<string, number>>(new Map());
  const npcDisplayPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const bulletDisplayRef = useRef<Map<string, { x: number; y: number; dirX: number; dirY: number }>>(new Map());
  const npcBulletDisplayRef = useRef<Map<string, { x: number; y: number; dirX: number; dirY: number }>>(new Map());
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastSyncRef = useRef(0);
  const lastFrameRef = useRef(0);
  const rafRef = useRef(0);
  const initializedRef = useRef(false);
  const deathCountRef = useRef(0);
  const toastRef = useRef<{ msg: string; until: number } | null>(null);

  const [players] = useTable(tables.player);
  const [bullets] = useTable(tables.bullet);
  const [npcs] = useTable(tables.npc);
  const [npcBullets] = useTable(tables.npcBullet);
  const updatePosition = useReducer(reducers.updatePosition);
  const shoot = useReducer(reducers.shoot);
  const setUsernameFn = useReducer(reducers.setUsername);

  // Stable refs
  const playersRef = useRef(players);
  playersRef.current = players;
  const bulletsRef = useRef(bullets);
  bulletsRef.current = bullets;
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;
  const npcBulletsRef = useRef(npcBullets);
  npcBulletsRef.current = npcBullets;
  const updatePositionRef = useRef(updatePosition);
  updatePositionRef.current = updatePosition;
  const shootRef = useRef(shoot);
  shootRef.current = shoot;

  // Handle username submission
  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = usernameInput.trim().slice(0, 16);
    if (!trimmed) return;
    localStorage.setItem("username", trimmed);
    setUsername(trimmed);
    setUsernameFn({ username: trimmed });
  };

  // Key listeners
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        keysRef.current.add(k);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    const onClick = (_e: MouseEvent) => {
      const local = localPosRef.current;
      if (!local) return;
      const c = canvasRef.current;
      if (!c) return;
      const camX = local.x - c.width / 2;
      const camY = local.y - c.height / 2;
      const worldX = mouseRef.current.x + camX;
      const worldY = mouseRef.current.y + camY;
      const dx = worldX - local.x;
      const dy = worldY - local.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      shootRef.current({ dirX: dx / len, dirY: dy / len });
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const gameLoop = useCallback((now: number) => {
    rafRef.current = requestAnimationFrame(gameLoop);

    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0;
    lastFrameRef.current = now;
    if (dt > 0.1) return;

    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const myIdentity = window.__my_identity;
    const myHex = myIdentity?.toHexString();
    const allPlayers = playersRef.current;
    const allBullets = bulletsRef.current;
    const allNpcs = npcsRef.current;
    const allNpcBullets = npcBulletsRef.current;

    // Initialize local position
    if (!initializedRef.current && myHex && allPlayers.length > 0) {
      const me = allPlayers.find((p) => p.identity.toHexString() === myHex);
      if (me) {
        localPosRef.current = { x: me.x, y: me.y };
        deathCountRef.current = me.deaths;
        initializedRef.current = true;
      }
    }

    // Detect death
    if (initializedRef.current && myHex) {
      const me = allPlayers.find((p) => p.identity.toHexString() === myHex);
      if (me && me.deaths > deathCountRef.current) {
        deathCountRef.current = me.deaths;
        localPosRef.current = { x: me.x, y: me.y };
        toastRef.current = { msg: "You died!", until: now + 2000 };
      }
    }

    // Move local player
    const keys = keysRef.current;
    const local = localPosRef.current;
    if (local) {
      let dx = 0;
      let dy = 0;
      if (keys.has("a")) dx -= 1;
      if (keys.has("d")) dx += 1;
      if (keys.has("w")) dy -= 1;
      if (keys.has("s")) dy += 1;
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }
      local.x += dx * SPEED * dt;
      local.y += dy * SPEED * dt;
      local.x = Math.max(PLAYER_RADIUS, Math.min(WORLD_W - PLAYER_RADIUS, local.x));
      local.y = Math.max(PLAYER_RADIUS, Math.min(WORLD_H - PLAYER_RADIUS, local.y));

      if (now - lastSyncRef.current > SYNC_INTERVAL) {
        lastSyncRef.current = now;
        updatePositionRef.current({ x: local.x, y: local.y });
      }
    }

    // Camera
    const camX = local ? local.x - c.width / 2 : WORLD_W / 2 - c.width / 2;
    const camY = local ? local.y - c.height / 2 : WORLD_H / 2 - c.height / 2;

    // Clear
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, c.width, c.height);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const gridSize = 60;
    const startX = -(camX % gridSize);
    const startY = -(camY % gridSize);
    for (let gx = startX; gx < c.width; gx += gridSize) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, c.height);
      ctx.stroke();
    }
    for (let gy = startY; gy < c.height; gy += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(c.width, gy);
      ctx.stroke();
    }

    // World border
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-camX, -camY, WORLD_W, WORLD_H);

    // --- Helper: draw bullet ---
    const drawBullet = (
      dispMap: Map<string, { x: number; y: number; dirX: number; dirY: number }>,
      bid: string,
      bx: number, by: number, bdirX: number, bdirY: number,
      hue: number
    ) => {
      let bd = dispMap.get(bid);
      if (!bd) {
        bd = { x: bx, y: by, dirX: bdirX, dirY: bdirY };
        dispMap.set(bid, bd);
      } else {
        bd.dirX = bdirX;
        bd.dirY = bdirY;
        bd.x += bd.dirX * BULLET_SPEED * dt;
        bd.y += bd.dirY * BULLET_SPEED * dt;
        bd.x += (bx - bd.x) * 0.15;
        bd.y += (by - bd.y) * 0.15;
      }
      const sx = bd.x - camX;
      const sy = bd.y - camY;

      ctx.shadowColor = `hsl(${hue}, 90%, 70%)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sx, sy, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 90%, 80%)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      const trailLen = 14;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - bd.dirX * trailLen, sy - bd.dirY * trailLen);
      ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.4)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    // --- Draw player bullets ---
    const bDisp = bulletDisplayRef.current;
    const activeBulletIds = new Set<string>();
    for (const b of allBullets) {
      const bid = b.id.toString();
      activeBulletIds.add(bid);
      const ownerHex = b.ownerId.toHexString();
      const owner = allPlayers.find((p) => p.identity.toHexString() === ownerHex);
      drawBullet(bDisp, bid, b.x, b.y, b.dirX, b.dirY, owner ? owner.hue : 50);
    }
    for (const key of bDisp.keys()) {
      if (!activeBulletIds.has(key)) bDisp.delete(key);
    }

    // --- Draw NPC bullets ---
    const nbDisp = npcBulletDisplayRef.current;
    const activeNpcBulletIds = new Set<string>();
    for (const nb of allNpcBullets) {
      const bid = nb.id.toString();
      activeNpcBulletIds.add(bid);
      const ownerNpc = allNpcs.find((n) => n.id === nb.npcOwnerId);
      drawBullet(nbDisp, bid, nb.x, nb.y, nb.dirX, nb.dirY, ownerNpc ? ownerNpc.hue : 0);
    }
    for (const key of nbDisp.keys()) {
      if (!activeNpcBulletIds.has(key)) nbDisp.delete(key);
    }

    // --- Helper: draw circle entity ---
    const drawCircle = (
      drawX: number, drawY: number, hue: number,
      label: string, isMe: boolean
    ) => {
      ctx.shadowColor = `hsl(${hue}, 80%, 60%)`;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(drawX, drawY, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `hsl(${hue}, 90%, 75%)`;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, drawX, drawY - PLAYER_RADIUS - 8);

      if (isMe) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText("you", drawX, drawY + 4);
      }
    };

    // --- Draw NPCs ---
    const npcDPos = npcDisplayPosRef.current;
    for (const npc of allNpcs) {
      const nid = npc.id.toString();
      let dp = npcDPos.get(nid);
      if (!dp) {
        dp = { x: npc.x, y: npc.y };
        npcDPos.set(nid, dp);
      }
      // Snap on large position jump (teleport/respawn)
      const njdx = npc.x - dp.x;
      const njdy = npc.y - dp.y;
      if (njdx * njdx + njdy * njdy > 100 * 100) {
        dp.x = npc.x;
        dp.y = npc.y;
      } else {
        dp.x += (npc.x - dp.x) * LERP_FACTOR;
        dp.y += (npc.y - dp.y) * LERP_FACTOR;
      }
      const drawX = dp.x - camX;
      const drawY = dp.y - camY;

      drawCircle(drawX, drawY, npc.hue, "BOT", false);

      const dirLen = PLAYER_RADIUS + 10;
      ctx.beginPath();
      ctx.moveTo(drawX + npc.dirX * (PLAYER_RADIUS + 3), drawY + npc.dirY * (PLAYER_RADIUS + 3));
      ctx.lineTo(drawX + npc.dirX * dirLen, drawY + npc.dirY * dirLen);
      ctx.strokeStyle = `hsla(${npc.hue}, 70%, 65%, 0.5)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // --- Draw players ---
    const dPos = displayPosRef.current;
    for (const p of allPlayers) {
      const hex = p.identity.toHexString();
      const isMe = hex === myHex;

      let drawX: number;
      let drawY: number;

      if (isMe && local) {
        drawX = local.x - camX;
        drawY = local.y - camY;
      } else {
        let dp = dPos.get(hex);
        const prevDeaths = remoteDeathsRef.current.get(hex) ?? 0;
        const died = p.deaths > prevDeaths;
        remoteDeathsRef.current.set(hex, p.deaths);

        if (!dp) {
          dp = { x: p.x, y: p.y };
          dPos.set(hex, dp);
        }

        // Snap on death or large position jump (teleport)
        const jumpDx = p.x - dp.x;
        const jumpDy = p.y - dp.y;
        const jumpDist = jumpDx * jumpDx + jumpDy * jumpDy;
        if (died || jumpDist > 100 * 100) {
          dp.x = p.x;
          dp.y = p.y;
        } else {
          dp.x += (p.x - dp.x) * LERP_FACTOR;
          dp.y += (p.y - dp.y) * LERP_FACTOR;
        }
        drawX = dp.x - camX;
        drawY = dp.y - camY;
      }

      // Use username if set, otherwise hex prefix
      const label = p.username || hex.slice(0, 8);
      drawCircle(drawX, drawY, p.hue, label, isMe);

      // Aim indicator for local player
      if (isMe && local) {
        const mouse = mouseRef.current;
        const aimAngle = Math.atan2(mouse.y - drawY, mouse.x - drawX);
        const aimStartR = PLAYER_RADIUS + 4;
        const aimEndR = PLAYER_RADIUS + 22;

        ctx.beginPath();
        ctx.moveTo(
          drawX + Math.cos(aimAngle) * aimStartR,
          drawY + Math.sin(aimAngle) * aimStartR
        );
        ctx.lineTo(
          drawX + Math.cos(aimAngle) * aimEndR,
          drawY + Math.sin(aimAngle) * aimEndR
        );
        ctx.strokeStyle = `hsla(${p.hue}, 80%, 75%, 0.7)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // --- Crosshair ---
    if (local) {
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx - 8, my); ctx.lineTo(mx + 8, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my - 8); ctx.lineTo(mx, my + 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();
    }

    // --- Leaderboard (top-left) ---
    const sorted = [...allPlayers].sort((a, b) => b.kills - a.kills);
    const lbX = 16;
    const lbY = 16;
    const lbW = 180;
    const rowH = 24;
    const headerH = 32;
    const maxRows = Math.min(sorted.length, 8);
    const lbH = headerH + maxRows * rowH + 8;

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.roundRect(lbX, lbY, lbW, lbH, 10);
    ctx.fill();

    // Header
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Leaderboard", lbX + 12, lbY + 22);

    // Rows
    for (let i = 0; i < maxRows; i++) {
      const p = sorted[i];
      const pHex = p.identity.toHexString();
      const isMe = pHex === myHex;
      const rowY = lbY + headerH + i * rowH;
      const name = p.username || pHex.slice(0, 8);

      // Highlight self
      if (isMe) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(lbX + 4, rowY, lbW - 8, rowH - 2, 4);
        ctx.fill();
      }

      // Color dot
      ctx.beginPath();
      ctx.arc(lbX + 18, rowY + rowH / 2 - 1, 4, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${p.hue}, 70%, 55%)`;
      ctx.fill();

      // Name
      ctx.fillStyle = isMe ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)";
      ctx.font = `${isMe ? "bold " : ""}12px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(name.slice(0, 12), lbX + 28, rowY + rowH / 2 + 3);

      // Kills
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${p.kills}`, lbX + lbW - 12, rowY + rowH / 2 + 3);
    }

    // --- Toast ---
    const toast = toastRef.current;
    if (toast && now < toast.until) {
      const remaining = toast.until - now;
      const alpha = Math.min(1, remaining / 500);

      const tw = 200;
      const th = 44;
      const tx = c.width / 2 - tw / 2;
      const ty = 60;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = "rgba(220, 40, 40, 0.9)";
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, th, 12);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(toast.msg, c.width / 2, ty + th / 2 + 6);
      ctx.globalAlpha = 1;
    } else if (toast && now >= toast.until) {
      toastRef.current = null;
    }
  }, []);

  // Start game loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameLoop]);

  if (username === null) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "#0f0f0f",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <form onSubmit={handleUsernameSubmit} style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, padding: "40px 48px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <h2 style={{
            color: "#fff", margin: 0,
            fontSize: 22, fontWeight: 600,
            fontFamily: "system-ui, sans-serif",
          }}>Enter your name</h2>
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            maxLength={16}
            autoFocus
            placeholder="Username"
            style={{
              background: "#111",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "10px 16px",
              color: "#fff", fontSize: 16,
              fontFamily: "system-ui, sans-serif",
              outline: "none", width: 220, textAlign: "center",
            }}
          />
          <button type="submit" style={{
            background: "#fff", color: "#0f0f0f",
            border: "none", borderRadius: 8,
            padding: "10px 32px", fontSize: 15, fontWeight: 600,
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
          }}>Play</button>
        </form>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#0f0f0f",
        cursor: "none",
      }}
    />
  );
}

export default App;
