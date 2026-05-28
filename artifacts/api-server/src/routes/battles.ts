import { Router } from "express";
import { db } from "@workspace/db";
import { battlesTable, hatchlingsTable, playersTable } from "@workspace/db";
import { eq, desc, or } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { attachEntitlement, enforceBattleDailyCap } from "../services/subscriptionGuards";
import { issueWsToken } from "../services/matchmakingQueue";

const router = Router();

// ── POST /battles/queue/join (REST fallback — primary join is via WS) ─────────
router.post("/battles/queue/join", requireAuth, attachPlayer, attachEntitlement, enforceBattleDailyCap, async (req, res) => {
  const body = z.object({ hatchlingId: z.number(), mode: z.enum(["casual", "ranked"]).default("casual") }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const playerId = req.playerId!;
  const { hatchlingId, mode } = body.data;

  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, hatchlingId) });
  if (!hatchling || hatchling.playerId !== playerId) { res.status(403).json({ error: "Invalid hatchling" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (mode === "ranked" && (player?.level ?? 0) < 10) {
    res.status(403).json({ error: "Ranked mode requires player level 10+" });
    return;
  }

  res.json({ ok: true, message: "Connect via WebSocket at /api/ws/battle?playerId=" + playerId });
});

// ── POST /battles/ws-token ────────────────────────────────────────────────────
// Issues a short-lived (60 s) one-time token tied to the authenticated player.
// Frontend uses this token as ?token=<uuid> on the WS handshake so the server
// can verify identity without trusting a client-supplied ?playerId= parameter.
router.post("/battles/ws-token", requireAuth, attachPlayer, (req, res) => {
  const token = issueWsToken(req.playerId!);
  res.json({ token });
});

// ── DELETE /battles/queue/leave ──────────────────────────────────────────────
router.delete("/battles/queue/leave", requireAuth, attachPlayer, async (req, res) => {
  res.json({ ok: true }); // actual queue removal is handled by WS close event
});

// ── GET /battles/history ─────────────────────────────────────────────────────
router.get("/battles/history", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const limit = Math.min(Number(req.query.limit ?? 10), 20);

  const battles = await db.query.battlesTable.findMany({
    where: or(eq(battlesTable.player1Id, playerId), eq(battlesTable.player2Id, playerId)),
    orderBy: [desc(battlesTable.createdAt)],
    limit,
  });

  const allPlayerIds = [...new Set(battles.flatMap(b => [b.player1Id, b.player2Id].filter(Boolean) as number[]))];
  const allHatchlingIds = [...new Set(battles.flatMap(b => [b.hatchling1Id, b.hatchling2Id].filter(Boolean) as number[]))];

  const [players, hatchlings] = await Promise.all([
    allPlayerIds.length ? db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, allPlayerIds) }) : Promise.resolve([]),
    allHatchlingIds.length ? db.query.hatchlingsTable.findMany({ where: (t, { inArray }) => inArray(t.id, allHatchlingIds) }) : Promise.resolve([]),
  ]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));
  const hatchlingMap = Object.fromEntries(hatchlings.map(h => [h.id, h]));

  res.json(battles.map(b => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    isViewer1: b.player1Id === playerId,
    viewerWon: b.winnerId === playerId,
    opponent: b.player1Id === playerId
      ? (b.player2Id ? playerMap[b.player2Id]?.username ?? "Bot" : "Bot")
      : (playerMap[b.player1Id]?.username ?? "Unknown"),
    opponentPlayerId: b.player1Id === playerId
      ? (b.player2Id ?? null)
      : (b.player1Id ?? null),
    myHatchling: b.player1Id === playerId
      ? (b.hatchling1Id ? hatchlingMap[b.hatchling1Id]?.name : null)
      : (b.hatchling2Id ? hatchlingMap[b.hatchling2Id]?.name : null),
    opponentHatchling: b.player1Id === playerId
      ? (b.hatchling2Id ? hatchlingMap[b.hatchling2Id]?.name ?? "Bot" : "Bot")
      : (b.hatchling1Id ? hatchlingMap[b.hatchling1Id]?.name : null),
  })));
});

// ── GET /battles/:id ─────────────────────────────────────────────────────────
router.get("/battles/:id", requireAuth, attachPlayer, async (req, res) => {
  const battleId = Number(req.params.id);
  const battle = await db.query.battlesTable.findFirst({ where: eq(battlesTable.id, battleId) });
  if (!battle) { res.status(404).json({ error: "Battle not found" }); return; }

  const playerId = req.playerId!;
  if (battle.player1Id !== playerId && battle.player2Id !== playerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  res.json({ ...battle, createdAt: battle.createdAt.toISOString() });
});

// ── GET /leaderboards/battle-elo ─────────────────────────────────────────────
router.get("/leaderboards/battle-elo", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 100);
  const players = await db.query.playersTable.findMany({
    orderBy: [desc(playersTable.battleElo)],
    limit,
  });

  res.json(players.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    username: p.username,
    displayName: p.displayName,
    battleElo: p.battleElo,
    totalBattleWins: p.totalBattleWins,
    level: p.level,
  })));
});

export default router;
