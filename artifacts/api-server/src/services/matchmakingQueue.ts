import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import { db } from "@workspace/db";
import {
  battlesTable,
  hatchlingsTable,
  notificationsTable,
  playersTable,
  rematchInvitesTable,
} from "@workspace/db";
import { and, eq, lt, or } from "drizzle-orm";
import {
  buildFighter,
  buildBotFighter,
  chooseBotMove,
  applyMove,
  computeEloChange,
  computeRewards,
  type BattleState,
  type MoveType,
} from "./battleService.ts";
import { loadActiveLoadoutModifiers, awardArtifactBattleXp } from "./artifactLoadoutService.ts";
import { checkAndConsumeBattleCap } from "./subscriptionGuards.ts";
import { applyHatchlingXp } from "./hatchlingXp.ts";
import { logger } from "../lib/logger.ts";
import { BattleWsClientMessageSchema, BattleWsServerMessageSchema } from "@workspace/api-zod";

// Validate outbound payloads against the shared OpenAPI-derived schema in
// non-production so any drift between the server and the documented
// `BattleWsServerMessage` envelope fails loud in logs instead of silently
// breaking the frontend (which `safeParse`s and drops unknown shapes).
// Production opts out for the per-frame perf cost on `battle_state`.
const VALIDATE_OUTBOUND_WS = process.env.NODE_ENV !== "production";

// ── In-memory state ──────────────────────────────────────────────────────────
interface QueueEntry {
  playerId: number;
  hatchlingId: number;
  hatchlingLevel: number;
  mode: "casual" | "ranked";
  ws: WebSocket;
  joinedAt: number;
  artifactPowerScore: number;  // used for matchmaking tier balance
  rematchInviteId?: string;    // when set, only pairs with the other party of the same invite
}

// ── Rematch invites (in-memory, 5 min TTL) ───────────────────────────────────
export interface RematchInvite {
  id: string;
  fromPlayerId: number;
  toPlayerId: number;
  mode: "casual" | "ranked";
  fromHatchlingId: number;
  fromHatchlingName: string;
  fromBattleId: number;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "accepted" | "declined" | "consumed" | "expired";
}

const REMATCH_TTL_MS = 5 * 60 * 1000;
// Drop terminal/expired rows from the table this long after they expire.
const REMATCH_CLEANUP_GRACE_MS = 60_000;
// When a recipient accepts, push expiresAt out by this much so the pair has
// time to actually meet in the matchmaking queue without the row being
// hard-deleted by `purgeExpiredRematches` mid-handshake. (Task #355)
export const REMATCH_ACCEPT_EXTENSION_MS = 5 * 60 * 1000;
// Additional refresh when either party joins the WS queue with an accepted
// invite — gives the partner a fresh window to also join.
export const REMATCH_QUEUE_JOIN_EXTENSION_MS = 2 * 60 * 1000;

function rowToInvite(row: typeof rematchInvitesTable.$inferSelect): RematchInvite {
  return {
    id: row.id,
    fromPlayerId: row.fromPlayerId,
    toPlayerId: row.toPlayerId,
    mode: row.mode === "ranked" ? "ranked" : "casual",
    fromHatchlingId: row.fromHatchlingId,
    fromHatchlingName: row.fromHatchlingName,
    fromBattleId: row.fromBattleId,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    status: row.status as RematchInvite["status"],
  };
}

async function purgeExpiredRematches() {
  const now = new Date();
  try {
    // Mark pending invites past their expiry as "expired".
    await db.update(rematchInvitesTable)
      .set({ status: "expired" })
      .where(and(eq(rematchInvitesTable.status, "pending"), lt(rematchInvitesTable.expiresAt, now)));
    // Hard-delete rows that have been expired/consumed/declined long enough.
    const grace = new Date(now.getTime() - REMATCH_CLEANUP_GRACE_MS);
    await db.delete(rematchInvitesTable)
      .where(lt(rematchInvitesTable.expiresAt, grace));
  } catch (err) {
    logger.warn({ err }, "purgeExpiredRematches failed");
  }
}

// Periodically clean up expired rows so old invites don't linger forever.
setInterval(() => { void purgeExpiredRematches(); }, 60_000).unref?.();

export async function createRematchInvite(input: {
  fromPlayerId: number;
  toPlayerId: number;
  mode: "casual" | "ranked";
  fromHatchlingId: number;
  fromHatchlingName: string;
  fromBattleId: number;
}): Promise<RematchInvite> {
  await purgeExpiredRematches();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REMATCH_TTL_MS);
  const id = randomUUID();
  const [row] = await db.insert(rematchInvitesTable).values({
    id,
    fromPlayerId: input.fromPlayerId,
    toPlayerId: input.toPlayerId,
    mode: input.mode,
    fromHatchlingId: input.fromHatchlingId,
    fromHatchlingName: input.fromHatchlingName,
    fromBattleId: input.fromBattleId,
    status: "pending",
    createdAt: now,
    expiresAt,
  }).returning();
  return rowToInvite(row!);
}

export async function getRematchInvite(id: string): Promise<RematchInvite | null> {
  if (!id) return null;
  const row = await db.query.rematchInvitesTable.findFirst({
    where: eq(rematchInvitesTable.id, id),
  });
  if (!row) return null;
  // Lazily flip stale pending invites to "expired" so callers see the right status.
  if (row.status === "pending" && row.expiresAt.getTime() < Date.now()) {
    await db.update(rematchInvitesTable)
      .set({ status: "expired" })
      .where(eq(rematchInvitesTable.id, id));
    return rowToInvite({ ...row, status: "expired" });
  }
  return rowToInvite(row);
}

export async function listPendingRematchInvitesFor(playerId: number): Promise<RematchInvite[]> {
  await purgeExpiredRematches();
  const rows = await db.query.rematchInvitesTable.findMany({
    where: and(
      or(eq(rematchInvitesTable.toPlayerId, playerId), eq(rematchInvitesTable.fromPlayerId, playerId)),
      or(eq(rematchInvitesTable.status, "pending"), eq(rematchInvitesTable.status, "accepted")),
    ),
  });
  return rows.map(rowToInvite);
}

export async function setRematchInviteStatus(
  id: string,
  status: RematchInvite["status"],
  options?: { extendExpiresByMs?: number },
): Promise<RematchInvite | null> {
  const updates: Partial<typeof rematchInvitesTable.$inferInsert> = { status };
  if (options?.extendExpiresByMs && options.extendExpiresByMs > 0) {
    updates.expiresAt = new Date(Date.now() + options.extendExpiresByMs);
  }
  const [row] = await db.update(rematchInvitesTable)
    .set(updates)
    .where(eq(rematchInvitesTable.id, id))
    .returning();
  return row ? rowToInvite(row) : null;
}

// Push out an invite's expiresAt without touching its status. Used by the
// WS join_queue path so an accepted invite isn't hard-deleted while the
// pair is still trying to meet in the matchmaking queue. (Task #355)
export async function extendRematchInviteExpiry(
  id: string,
  extensionMs: number,
): Promise<RematchInvite | null> {
  if (!id || extensionMs <= 0) return null;
  const newExpiresAt = new Date(Date.now() + extensionMs);
  const [row] = await db.update(rematchInvitesTable)
    .set({ expiresAt: newExpiresAt })
    .where(eq(rematchInvitesTable.id, id))
    .returning();
  return row ? rowToInvite(row) : null;
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
  if (!ws || ws.readyState !== 1 /* OPEN */) return;
  if (VALIDATE_OUTBOUND_WS) {
    const parsed = BattleWsServerMessageSchema.safeParse(payload);
    if (!parsed.success) {
      // Log loudly with the offending payload + zod issues, but still send
      // so an unexpected schema gap doesn't crash an in-flight battle.
      logger.error(
        {
          payload,
          issues: parsed.error.issues,
          payloadType:
            payload && typeof payload === "object" && "type" in payload
              ? (payload as { type?: unknown }).type
              : undefined,
        },
        "Outbound battle WS payload failed BattleWsServerMessageSchema validation",
      );
    }
  }
  ws.send(JSON.stringify(payload));
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

// ── Hatchling XP award (exported for unit testing) ───────────────────────────
/**
 * Award XP to both fighters' hatchlings after a battle ends.
 * The winner earns more XP than the loser; the exact amounts come from
 * `computeRewards`. Exported so tests can verify the XP wiring without
 * spinning up a full WebSocket battle session.
 */
export async function awardBattleHatchlingXp(state: BattleState): Promise<{
  fighter1Xp: number;
  fighter2Xp: number | null;
  palXp1: Awaited<ReturnType<typeof applyHatchlingXp>>;
  palXp2: Awaited<ReturnType<typeof applyHatchlingXp>>;
}> {
  const r1 = computeRewards(state, 1);
  const r2 = computeRewards(state, 2);
  const [palXp1, palXp2] = await Promise.all([
    applyHatchlingXp(state.fighter1.hatchlingId, r1.xp).catch(() => null),
    state.fighter2.hatchlingId && !state.fighter2.isBot
      ? applyHatchlingXp(state.fighter2.hatchlingId, r2.xp).catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    fighter1Xp: r1.xp,
    fighter2Xp: state.fighter2.hatchlingId && !state.fighter2.isBot ? r2.xp : null,
    palXp1,
    palXp2,
  };
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

    // Award XP to the participating hatchlings so level-ups can cross the
    // evolution thresholds (5 and 15) that trigger the share prompt.
    const { palXp1, palXp2 } = await awardBattleHatchlingXp(state);

    // Confidence & loyalty boost on battle win — winner's Pal gets a morale bump
    const winnerHatchlingId = p1Won ? state.fighter1.hatchlingId : (p2Won ? state.fighter2.hatchlingId : null);
    if (winnerHatchlingId) {
      const winnerPal = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, winnerHatchlingId) });
      if (winnerPal) {
        await db.update(hatchlingsTable).set({
          happiness:       Math.min(100, winnerPal.happiness + 10),
          loyaltyScore:    Math.min(100, (winnerPal.loyaltyScore ?? 50) + 5),
          motivationScore: Math.min(100, (winnerPal.motivationScore ?? 50) + 5),
          confidenceScore: Math.min(100, (winnerPal.confidenceScore ?? 50) + 8),
          battleWins:      (winnerPal.battleWins ?? 0) + 1,
          moodState:       "celebrating",
        }).where(eq(hatchlingsTable.id, winnerHatchlingId));
      }
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

    // Compute winner's remaining HP fraction for close-match detection on the client.
    // Only meaningful when there is a clear winner (slot 1 or 2).
    const winnerHpPct: number | undefined = (() => {
      if (state.winner === 1) {
        return state.fighter1.maxHp > 0 ? state.fighter1.currentHp / state.fighter1.maxHp : undefined;
      }
      if (state.winner === 2) {
        return state.fighter2.maxHp > 0 ? state.fighter2.currentHp / state.fighter2.maxHp : undefined;
      }
      return undefined;
    })();

    const r1Final = computeRewards(state, 1);
    send(battle.ws1, {
      type: "battle_end",
      battleId,
      winner: state.winner,
      rewards: r1Final,
      eloChange,
      artifactXp: artifactXpP1,
      state: sanitizeState(state),
      ...(winnerHpPct !== undefined ? { winnerHpPct } : {}),
      ...(palXp1 ? { hatchlingXp: { xpDelta: palXp1.xpDelta, prevLevel: palXp1.prevLevel, newLevel: palXp1.newLevel, newXp: palXp1.newXp } } : {}),
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
        ...(winnerHpPct !== undefined ? { winnerHpPct } : {}),
        ...(palXp2 ? { hatchlingXp: { xpDelta: palXp2.xpDelta, prevLevel: palXp2.prevLevel, newLevel: palXp2.newLevel, newXp: palXp2.newXp } } : {}),
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

  // First pass: pair rematch-invite buddies regardless of power/level checks
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    if (!a.rematchInviteId) continue;
    for (let j = i + 1; j < queue.length; j++) {
      const b = queue[j]!;
      if (a.rematchInviteId !== b.rematchInviteId) continue;
      if (a.mode !== b.mode) continue;
      const inv = await getRematchInvite(a.rematchInviteId);
      if (!inv) continue;
      const validPair =
        (inv.fromPlayerId === a.playerId && inv.toPlayerId === b.playerId) ||
        (inv.fromPlayerId === b.playerId && inv.toPlayerId === a.playerId);
      if (!validPair) continue;
      queue.splice(j, 1);
      queue.splice(i, 1);
      queuedPlayers.delete(a.playerId);
      queuedPlayers.delete(b.playerId);
      await setRematchInviteStatus(inv.id, "consumed");
      await startBattle(a, b);
      return;
    }
  }

  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i]!;
      const b = queue[j]!;
      // Skip rematch-tagged entries from generic matchmaking — they only pair
      // with the specific opponent of their invite.
      if (a.rematchInviteId || b.rematchInviteId) continue;
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
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  // Validate against the shared OpenAPI-derived schema so the on-the-wire
  // envelope matches the documented `BattleWsClientMessage` discriminated
  // union exactly. Unknown `type` values and malformed payloads are rejected
  // here instead of being silently coerced below.
  const parsed = BattleWsClientMessageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    send(ws, { type: "error", message: "Invalid battle WS message" });
    return;
  }
  const msg = parsed.data;

  if (msg.type === "join_queue") {
    if (playerInBattle.has(playerId)) {
      send(ws, { type: "error", message: "Already in a battle" });
      return;
    }
    if (queuedPlayers.has(playerId)) {
      send(ws, { type: "error", message: "Already in queue" });
      return;
    }
    const hatchlingId = msg.hatchlingId;
    const rawMode = msg.mode;
    const rematchInviteId = msg.rematchInviteId;

    // Validate rematch invite if supplied: caller must be a participant and
    // status must still be pending/accepted (not consumed/declined/expired).
    let invite: RematchInvite | null = null;
    if (rematchInviteId) {
      invite = await getRematchInvite(rematchInviteId);
      if (!invite) {
        send(ws, { type: "error", message: "Rematch invite not found or expired" });
        return;
      }
      if (invite.fromPlayerId !== playerId && invite.toPlayerId !== playerId) {
        send(ws, { type: "error", message: "Not a participant in this rematch invite" });
        return;
      }
      if (invite.status !== "pending" && invite.status !== "accepted") {
        send(ws, { type: "error", message: "Rematch invite is no longer active" });
        return;
      }
      // Refresh expiry so the partner still has time to also join the
      // queue. Without this, an invite accepted just before its TTL
      // elapsed could be hard-deleted between the two parties joining,
      // leaving the second one with "not found or expired". (Task #355)
      const refreshed = await extendRematchInviteExpiry(invite.id, REMATCH_QUEUE_JOIN_EXTENSION_MS);
      if (refreshed) invite = refreshed;
    }
    const mode = (invite?.mode ?? rawMode) as "casual" | "ranked";

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

    const entry: QueueEntry = {
      playerId, hatchlingId, hatchlingLevel: hatchling.level, mode, ws,
      joinedAt: Date.now(), artifactPowerScore,
      ...(rematchInviteId ? { rematchInviteId } : {}),
    };
    queue.push(entry);
    queuedPlayers.add(playerId);
    send(ws, { type: "queue_joined", position: queue.length, mode, rematchInviteId: rematchInviteId ?? null });
    // Skip generic-bot fallback for rematch entries — they wait for the
    // specific invite partner instead.
    if (!rematchInviteId) scheduleBotFallback(entry);
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
    const battleId = msg.battleId;
    const move = msg.move as MoveType;
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

    // Intentionally no greeting frame here — the documented
    // `BattleWsServerMessage` envelope has no "connected" variant, and the
    // frontend doesn't react to one. Sending it would fail outbound
    // validation and the client's `safeParse` would drop it anyway.
  });

  logger.info("Battle WebSocket server attached at /api/ws/battle");
  return wss;
}

// ── HTTP helpers for REST routes ─────────────────────────────────────────────
export { playerInBattle, activeBattles };
