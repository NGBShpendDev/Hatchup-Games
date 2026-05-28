import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable, fitnessActivitiesTable, personalRecordsTable } from "@workspace/db";
import { desc, eq, notInArray, gte, and } from "drizzle-orm";
import { GetGlobalLeaderboardQueryParams, GetModeLeaderboardQueryParams } from "@workspace/api-zod";
import { getHiddenPlayerIds } from "./safety";
import { requireAuth, attachPlayer } from "../middlewares/auth";

const router = Router();

const RANK_COLORS: Record<string, string> = {
  Bronze:    "#CD7F32",
  Silver:    "#C0C0C0",
  Gold:      "#FFD700",
  Diamond:   "#B9F2FF",
  Master:    "#9B59B6",
  Cosmic:    "#00FFFF",
  Legendary: "#FF6B35",
};

router.get("/leaderboards/global", requireAuth, attachPlayer, async (req, res) => {
  const query = GetGlobalLeaderboardQueryParams.safeParse({
    limit: req.query.limit ? Number(req.query.limit) : 50,
  });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players =
    hiddenIds.length > 0
      ? await db
          .select()
          .from(playersTable)
          .where(notInArray(playersTable.id, hiddenIds))
          .orderBy(desc(playersTable.rankScore), desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50)
      : await db
          .select()
          .from(playersTable)
          .orderBy(desc(playersTable.rankScore), desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50);

  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = players.map((p, i) => {
    const topHatchling = hatchlings
      .filter(h => h.playerId === p.id)
      .sort((a, b) => b.level - a.level)[0];
    return {
      position: i + 1,
      playerId: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      rank: p.rank,
      score: p.rankScore,
      wins: p.totalWins,
      hatchlingName: topHatchling?.name ?? "None",
      hatchlingCategory: topHatchling?.category ?? null,
    };
  });

  res.json(result);
});

router.get("/leaderboards/by-mode", requireAuth, attachPlayer, async (req, res) => {
  const query = GetModeLeaderboardQueryParams.safeParse({
    mode: req.query.mode as string,
    limit: req.query.limit ? Number(req.query.limit) : 50,
  });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players =
    hiddenIds.length > 0
      ? await db
          .select()
          .from(playersTable)
          .where(notInArray(playersTable.id, hiddenIds))
          .orderBy(desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50)
      : await db
          .select()
          .from(playersTable)
          .orderBy(desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50);

  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = players.map((p, i) => {
    const topHatchling = hatchlings
      .filter(h => h.playerId === p.id)
      .sort((a, b) => b.level - a.level)[0];
    return {
      position: i + 1,
      playerId: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      rank: p.rank,
      score: p.rankScore,
      wins: p.totalWins,
      hatchlingName: topHatchling?.name ?? "None",
      hatchlingCategory: topHatchling?.category ?? null,
    };
  });

  res.json(result);
});

router.get("/leaderboards/rank-distribution", async (req, res) => {
  const players = await db.query.playersTable.findMany();
  const rankMap: Record<string, number> = {};
  for (const p of players) {
    rankMap[p.rank] = (rankMap[p.rank] ?? 0) + 1;
  }

  const ranks = ["Bronze", "Silver", "Gold", "Diamond", "Master", "Cosmic", "Legendary"];
  const result = ranks.map(rank => ({
    rank,
    count: rankMap[rank] ?? 0,
    percentage:
      players.length > 0 ? ((rankMap[rank] ?? 0) / players.length) * 100 : 0,
    color: RANK_COLORS[rank] ?? "#888888",
  }));

  res.json(result);
});

// GET /leaderboards/speed?mode=steps|runs — fitness performance leaderboards
// mode=steps  → top daily step counts (from today's activity logs)
// mode=runs   → top best single running session (from personal_records)
router.get("/leaderboards/speed", requireAuth, attachPlayer, async (req, res) => {
  const mode = (req.query.mode as string) ?? "steps";
  const limit = Math.min(50, Number(req.query.limit ?? 25));
  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  if (mode === "pace") {
    // Best single running session ranked by session_minutes PR (longer = better endurance)
    const runPrs = await db.query.personalRecordsTable.findMany({
      where: and(
        eq(personalRecordsTable.activityType, "running"),
        eq(personalRecordsTable.metric, "session_minutes"),
      ),
    });

    // Sort and limit
    const sorted = runPrs
      .sort((a, b) => b.value - a.value)
      .slice(0, limit * 2); // fetch extras to account for blocked players

    const playerIds = sorted.map(r => r.playerId);
    const players = await db.query.playersTable.findMany();
    const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

    const result = sorted
      .filter(r => !hiddenIds.includes(r.playerId))
      .slice(0, limit)
      .map((r, i) => {
        const p = playerMap[r.playerId];
        return {
          position: i + 1,
          playerId: r.playerId,
          username: p?.username ?? "Unknown",
          displayName: p?.displayName ?? null,
          avatarUrl: p?.avatarUrl ?? null,
          rank: p?.rank ?? "Bronze",
          metricValue: r.value,
          metricLabel: `${r.value} min run`,
          achievedAt: r.achievedAt.toISOString(),
          currentStreak: p?.currentStreak ?? 0,
        };
      });

    res.json(result);
    return;
  }

  // Default: mode=steps → top daily steps (today's logged step activities)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayStepActivities = await db.query.fitnessActivitiesTable.findMany({
    where: and(
      eq(fitnessActivitiesTable.type, "steps"),
      gte(fitnessActivitiesTable.createdAt, todayStart),
    ),
  });

  // Aggregate steps per player
  const stepsByPlayer: Record<number, number> = {};
  for (const a of todayStepActivities) {
    if (!hiddenIds.includes(a.playerId)) {
      stepsByPlayer[a.playerId] = (stepsByPlayer[a.playerId] ?? 0) + a.value;
    }
  }

  // If no one logged steps today, fall back to all-time steps ranking
  const players = await db.query.playersTable.findMany();
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  let sorted: { playerId: number; steps: number }[];
  if (Object.keys(stepsByPlayer).length === 0) {
    sorted = players
      .filter(p => !hiddenIds.includes(p.id))
      .sort((a, b) => b.totalSteps - a.totalSteps)
      .slice(0, limit)
      .map(p => ({ playerId: p.id, steps: p.totalSteps }));
  } else {
    sorted = Object.entries(stepsByPlayer)
      .map(([id, steps]) => ({ playerId: Number(id), steps }))
      .sort((a, b) => b.steps - a.steps)
      .slice(0, limit);
  }

  const result = sorted.map((entry, i) => {
    const p = playerMap[entry.playerId];
    return {
      position: i + 1,
      playerId: entry.playerId,
      username: p?.username ?? "Unknown",
      displayName: p?.displayName ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      rank: p?.rank ?? "Bronze",
      metricValue: entry.steps,
      metricLabel: entry.steps.toLocaleString() + " steps",
      achievedAt: new Date().toISOString(),
      currentStreak: p?.currentStreak ?? 0,
    };
  });

  res.json(result);
});

export default router;
