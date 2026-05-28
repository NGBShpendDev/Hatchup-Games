import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import { db } from "@workspace/db";
import {
  battlesTable,
  hatchlingsTable,
  playersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  buildFighter,
  buildBotFighter,
  chooseBotMove,
  applyMove,
  computeEloChange,
  computeRewards,
  type BattleState,
  type MoveType,
} from "./battleService";
import { loadActiveLoadoutModifiers, awardArtifactBattleXp } from "./artifactLoadoutService";
import { checkAndConsumeBattleCap } from "./subscriptionGuards";
import { logger } from "../lib/logger";

// ── In-memory state ──────────────────────────────────────────────────────────
interface QueueEntry {
  playerId: number;
  hatchlingId: number;
  hatchlingLevel: number;
  mode: "casual" | "ranked";
  ws: WebSocket;
  joinedAt: number;
  artifactPowerScore: number;  // used for matchmaking tier balance
}

interface ActiveBattle {
  state: BattleState;
  ws1: WebSocket | null;
  ws2: WebSocket | null;  // null = bot
  botTimerId?: ReturnType<typeof setTimeout>;
}

const queue: QueueEntry[] = [];
const queuedPlayers = new Set<number>();          // prevents duplicate queue entries
const activeBattles = new Map<number, ActiveBattle>();
// playerId → battleId (for reconnection)
const playerInBattle = new Map<number, number>();

// ── WS token registry (one-time, 60 s TTL) ───────────────────────────────────
interface WsTokenEntry { playerId: number; expires: number }
const wsTokens = new Map<string, WsTokenEntry>();

export function issueWsToken(playerId: number): string {
  // Purge stale tokens
  const now = Date.now();
  for (const [k, v] of wsTokens) {
    if (v.expires < now) wsTokens.delete(k);
  }
  const token = randomUUID();
  wsTokens.set(token, { playerId, expires: now + 60_000 });
  return token;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function send(ws: WebSocket | null, payload: unknown) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(battle: ActiveBattle, payload: unknown) {
  send(battle.ws1, payload);
  send(battle.ws2, payload);
}

// ── Bot turn scheduling ──────────────────────────────────────────────────────
function scheduleBotTurn(battleId: number) {
  const battle = activeBattles.get(battleId);
  if (!battle || battle.state.phase !== "active") return;
  if (battle.state.currentSlot !== 2 || !battle.state.fighter2.isBot) return;

  const delay = 1200 + Math.random() * 800;
  battle.botTimerId = setTimeout(() => {
    const b = activeBattles.get(battleId);
    if (!b || b.state.phase !== "active") return;
    const move = chooseBotMove(b.state.fighter2);
    executeTurn(battleId, 2, move, null);
  }, delay);
}

// ── Core turn execution ──────────────────────────────────────────────────────
async function executeTurn(
  battleId: number,
  slot: 1 | 2,
  move: MoveType,
  _ws: WebSocket | null,
) {
  const battle = activeBattles.get(battleId);
  if (!battle) return;

  // Load the real player for whichever slot is acting (null only for bot)
  const actingFighter = slot === 1 ? battle.state.fighter1 : battle.state.fighter2;
  const actingPlayer = actingFighter.isBot || actingFighter.playerId === 0
    ? null
    : await db.query.playersTable.findFirst({ where: eq(playersTable.id, actingFighter.playerId) }).catch(() => null);

  const result = applyMove(battle.state, slot, move, actingPlayer ?? null);
  if ("error" in result) {
    send(slot === 1 ? battle.ws1 : battle.ws2, { type: "error", message: result.error });
    return;
  }

  battle.state = result;
  broadcast(battle, { type: "battle_state", battleId, state: sanitizeState(result) });

  if (result.phase === "ended") {
    await finalizeBattle(battleId);
    return;
  }

  // Schedule bot turn if it's fighter2's turn and fighter2 is bot
  if (result.currentSlot === 2 && result.fighter2.isBot) {
    scheduleBotTurn(battleId);
  }
}

// ── Battle finalization ──────────────────────────────────────────────────────
async function finalizeBattle(battleId: number) {
  const battle = activeBattles.get(battleId);
  if (!battle) return;

  const { state } = battle;
  const isRanked = state.mode === "ranked";
  let eloChange = 0;

  try {
    const [p1, p2] = await Promise.all([
      db.query.playersTable.findFirst({ where: eq(playersTable.id, state.fighter1.playerId) }),
      state.fighter2.playerId
        ? db.query.playersTable.findFirst({ where: eq(playersTable.id, state.fighter2.playerId) })
        : Promise.resolve(null),
    ]);

    const p1Won = state.winner === 1;
    const p2Won = state.winner === 2;

    // Draws (winner === 0) produce no ELO change
    if (isRanked && p1 && p2 && state.winner !== 0) {
      const change = computeEloChange(
        p1Won ? p1.battleElo : p2!.battleElo,
        p1Won ? p2!.battleElo : p1.battleElo,
      );
      eloChange = p1Won ? change : -change;
      await db.update(playersTable).set({ battleElo: p1.battleElo + eloChange }).where(eq(playersTable.id, p1.id));
      await db.update(playersTable).set({ battleElo: p2!.battleElo - eloChange }).where(eq(playersTable.id, p2!.id));
    }

    // Award XP + coins + wins
    const r1 = computeRewards(state, 1);
    if (p1) {
      await db.update(playersTable).set({
        xp: p1.xp + r1.xp,
        coins: p1.coins + r1.coins,
        totalBattleWins: p1Won ? p1.totalBattleWins + 1 : p1.totalBattleWins,
      }).where(eq(playersTable.id, p1.id));
    }
    if (p2 && !state.fighter2.isBot) {
      const r2 = computeRewards(state, 2);
      await db.update(playersTable).set({
        xp: p2.xp + r2.xp,
        coins: p2.coins + r2.coins,
        totalBattleWins: p2Won ? p2.totalBattleWins + 1 : p2.totalBattleWins,
      }).where(eq(playersTable.id, p2.id));
    }

    // Award artifact battle XP to both fighters' equipped artifacts
    const [artifactXpP1, artifactXpP2] = await Promise.all([
      awardArtifactBattleXp(state.fighter1.playerId, state.fighter1.hatchlingId, p1Won),
      state.fighter2.playerId && !state.fighter2.isBot
        ? awardArtifactBattleXp(state.fighter2.playerId, state.fighter2.hatchlingId, p2Won)
        : Promise.resolve([]),
    ]);

    // Persist battle record
    await db.update(battlesTable).set({
      winnerId: state.winner === 1 ? state.fighter1.playerId : (state.winner === 2 ? (state.fighter2.playerId || 0) : null),
      turnsJson: state.turns as unknown[],
      xpAwarded: computeRewards(state, 1).xp,
      coinsAwarded: computeRewards(state, 1).coins,
      eloChange,
    }).where(eq(battlesTable.id, battleId));

    const r1Final = computeRewards(state, 1);
    send(battle.ws1, {
      type: "battle_end",
      battleId,
      winner: state.winner,
      rewards: r1Final,
      eloChange,
      artifactXp: artifactXpP1,
      state: sanitizeState(state),
    });

    if (battle.ws2 && !state.fighter2.isBot) {
      const r2 = computeRewards(state, 2);
      send(battle.ws2, {
        type: "battle_end",
        battleId,
        winner: state.winner,
        rewards: r2,
        eloChange: -eloChange,
        artifactXp: artifactXpP2,
        state: sanitizeState(state),
      });
    }
  } catch (err) {
    logger.error({ err, battleId }, "Error finalizing battle");
  } finally {
    playerInBattle.delete(state.fighter1.playerId);
    if (state.fighter2.playerId) playerInBattle.delete(state.fighter2.playerId);
    // Keep state in memory 60s for reconnect
    setTimeout(() => activeBattles.delete(battleId), 60_000);
  }
}

// ── Remove sensitive info from state before sending to clients ───────────────
function sanitizeState(state: BattleState) {
  return state; // all fields are safe to share in 1v1
}

// Power-score tolerance for matchmaking (points). Expands over time (up to 2x after 60s).
const BASE_POWER_TOLERANCE = 60;

// ── Matchmaking: try to pair two queue entries ────────────────────────────────
async function tryMatch() {
  if (queue.length < 2) return;

  const now = Date.now();

  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i]!;
      const b = queue[j]!;
      if (a.mode !== b.mode) continue;
      if (Math.abs(a.hatchlingLevel - b.hatchlingLevel) > 20) continue;

      // Power-score tier balancing — tolerance expands after 30s in queue
      const waitedSecs = (now - Math.max(a.joinedAt, b.joinedAt)) / 1000;
      const tolerance  = BASE_POWER_TOLERANCE * (waitedSecs > 30 ? 2 : 1);
      if (Math.abs(a.artifactPowerScore - b.artifactPowerScore) > tolerance) continue;

      // Found a match
      queue.splice(j, 1);
      queue.splice(i, 1);
      queuedPlayers.delete(a.playerId);
      queuedPlayers.delete(b.playerId);
      await startBattle(a, b);
      return;
    }
  }
}

async function startBattle(a: QueueEntry, b: QueueEntry, botFight = false) {
  try {
    const [ha, hb, pa, pb] = await Promise.all([
      db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, a.hatchlingId) }),
      botFight ? Promise.resolve(null) : db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, b.hatchlingId) }),
      db.query.playersTable.findFirst({ where: eq(playersTable.id, a.playerId) }),
      botFight ? Promise.resolve(null) : db.query.playersTable.findFirst({ where: eq(playersTable.id, b.playerId) }),
    ]);

    if (!ha || !pa) {
      send(a.ws, { type: "error", message: "Failed to load hatchling" });
      return;
    }

    // Load artifact loadouts for both fighters
    const [modsA, modsB] = await Promise.all([
      loadActiveLoadoutModifiers(a.playerId, a.hatchlingId),
      botFight || !hb || !pb ? Promise.resolve(undefined) : loadActiveLoadoutModifiers(b.playerId, b.hatchlingId),
    ]);

    const f1 = buildFighter(pa, ha, false, modsA);
    const f2 = botFight
      ? buildBotFighter(a.hatchlingLevel)
      : (hb && pb ? buildFighter(pb, hb, false, modsB ?? undefined) : buildBotFighter(a.hatchlingLevel));

    // f2 isBot flag already set by buildBotFighter
    const f2IsBot = botFight || !hb || !pb;

    // Determine who goes first by speed
    const firstSlot: 1 | 2 = f1.speed >= f2.speed ? 1 : 2;

    // Create DB record
    const [record] = await db.insert(battlesTable).values({
      player1Id: a.playerId,
      player2Id: f2IsBot ? null : b.playerId,
      hatchling1Id: a.hatchlingId,
      hatchling2Id: f2IsBot ? null : b.hatchlingId,
      battleMode: a.mode,
    }).returning();

    const battleId = record!.id;

    const state: BattleState = {
      battleId,
      mode: a.mode,
      fighter1: { ...f1, isBot: false },
      fighter2: { ...f2, isBot: f2IsBot },
      currentSlot: firstSlot,
      turnNumber: 0,
      phase: "active",
      winner: null,
      turns: [],
    };

    const activeBattle: ActiveBattle = {
      state,
      ws1: a.ws,
      ws2: f2IsBot ? null : b.ws,
    };
    activeBattles.set(battleId, activeBattle);
    playerInBattle.set(a.playerId, battleId);
    if (!f2IsBot) playerInBattle.set(b.playerId, battleId);

    const startMsg = { type: "battle_start", battleId, slot1PlayerId: a.playerId, slot2PlayerId: f2IsBot ? 0 : b.playerId, state: sanitizeState(state) };
    send(a.ws, { ...startMsg, yourSlot: 1 });
    if (!f2IsBot) send(b.ws, { ...startMsg, yourSlot: 2 });

    // If bot goes first
    if (firstSlot === 2 && f2IsBot) scheduleBotTurn(battleId);
  } catch (err) {
    logger.error({ err }, "Error starting battle");
  }
}

// ── Bot fallback after 30s ────────────────────────────────────────────────────
const botTimers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleBotFallback(entry: QueueEntry) {
  const timer = setTimeout(async () => {
    const idx = queue.findIndex(q => q.playerId === entry.playerId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      queuedPlayers.delete(entry.playerId);
      const botEntry: QueueEntry = {
        playerId: 0,
        hatchlingId: 0,
        hatchlingLevel: entry.hatchlingLevel,
        mode: entry.mode,
        ws: entry.ws, // unused for bot
        joinedAt: Date.now(),
        artifactPowerScore: 0,
      };
      await startBattle(entry, botEntry, true);
    }
    botTimers.delete(entry.playerId);
  }, 30_000);
  botTimers.set(entry.playerId, timer);
}

// ── Message handler ──────────────────────────────────────────────────────────
async function handleMessage(ws: WebSocket, playerId: number, raw: string) {
  let msg: { type: string; [k: string]: unknown };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  if (msg.type === "join_queue") {
    if (playerInBattle.has(playerId)) {
      send(ws, { type: "error", message: "Already in a battle" });
      return;
    }
    if (queuedPlayers.has(playerId)) {
      send(ws, { type: "error", message: "Already in queue" });
      return;
    }
    const hatchlingId = Number(msg.hatchlingId);
    const mode = (msg.mode === "ranked" ? "ranked" : "casual") as "casual" | "ranked";

    const [hatchling, player] = await Promise.all([
      db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, hatchlingId) }),
      db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
    ]);

    if (!hatchling || hatchling.playerId !== playerId) {
      send(ws, { type: "error", message: "Invalid hatchling" });
      return;
    }

    // Ranked gate: player must be level 10+ (enforced on the WS path, the real path)
    if (mode === "ranked" && (player?.level ?? 0) < 10) {
      send(ws, { type: "error", message: "Ranked mode requires player level 10+" });
      return;
    }

    // Free-tier daily battle cap (mirrors REST POST /battles/queue/join).
    const capCheck = await checkAndConsumeBattleCap(playerId);
    if (!capCheck.ok) {
      send(ws, { type: "error", error: capCheck.error, message: capCheck.message, cap: capCheck.cap });
      return;
    }

    // Load artifact power score for matchmaking balancing
    const loadoutMods = await loadActiveLoadoutModifiers(playerId, hatchlingId).catch(() => null);
    const artifactPowerScore = loadoutMods?.powerScore ?? 0;

    const entry: QueueEntry = { playerId, hatchlingId, hatchlingLevel: hatchling.level, mode, ws, joinedAt: Date.now(), artifactPowerScore };
    queue.push(entry);
    queuedPlayers.add(playerId);
    send(ws, { type: "queue_joined", position: queue.length, mode });
    scheduleBotFallback(entry);
    await tryMatch();
    return;
  }

  if (msg.type === "leave_queue") {
    const idx = queue.findIndex(q => q.playerId === playerId);
    if (idx !== -1) { queue.splice(idx, 1); queuedPlayers.delete(playerId); }
    const timer = botTimers.get(playerId);
    if (timer) { clearTimeout(timer); botTimers.delete(playerId); }
    send(ws, { type: "queue_left" });
    return;
  }

  if (msg.type === "player_move") {
    const battleId = Number(msg.battleId);
    const move = String(msg.move) as MoveType;
    const battle = activeBattles.get(battleId);
    if (!battle) { send(ws, { type: "error", message: "Battle not found" }); return; }

    // Strict participant authorization: playerId must be fighter1 OR fighter2
    const isF1 = battle.state.fighter1.playerId === playerId;
    const isF2 = !battle.state.fighter2.isBot && battle.state.fighter2.playerId === playerId;
    if (!isF1 && !isF2) {
      send(ws, { type: "error", message: "Not a participant in this battle" });
      return;
    }
    const slot: 1 | 2 = isF1 ? 1 : 2;
    await executeTurn(battleId, slot, move, ws);
    return;
  }

  if (msg.type === "reconnect") {
    const battleId = playerInBattle.get(playerId);
    if (!battleId) { send(ws, { type: "error", message: "No active battle" }); return; }
    const battle = activeBattles.get(battleId);
    if (!battle) { send(ws, { type: "error", message: "Battle expired" }); return; }
    const slot: 1 | 2 = battle.state.fighter1.playerId === playerId ? 1 : 2;
    if (slot === 1) battle.ws1 = ws;
    else battle.ws2 = ws;
    send(ws, { type: "reconnected", battleId, yourSlot: slot, state: sanitizeState(battle.state) });
    return;
  }
}

// ── WebSocket server setup ────────────────────────────────────────────────────
export function attachBattleWss(server: import("http").Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws/battle" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate via one-time server-issued token (?token=<uuid>)
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const tokenEntry = wsTokens.get(token);
    if (!tokenEntry || tokenEntry.expires < Date.now()) {
      ws.close(1008, "Invalid or expired WS token");
      return;
    }
    wsTokens.delete(token); // one-time use
    const playerId = tokenEntry.playerId;

    ws.on("message", (raw) => {
      handleMessage(ws, playerId, raw.toString()).catch(err => {
        logger.error({ err }, "WS message error");
      });
    });

    ws.on("close", () => {
      // Remove from queue on disconnect
      const idx = queue.findIndex(q => q.playerId === playerId);
      if (idx !== -1) { queue.splice(idx, 1); queuedPlayers.delete(playerId); }
      const timer = botTimers.get(playerId);
      if (timer) { clearTimeout(timer); botTimers.delete(playerId); }
    });

    send(ws, { type: "connected", playerId });
  });

  logger.info("Battle WebSocket server attached at /api/ws/battle");
  return wss;
}

// ── HTTP helpers for REST routes ─────────────────────────────────────────────
export { playerInBattle, activeBattles };
