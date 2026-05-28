import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable, hatchlingsTable, fitnessActivitiesTable,
  personalRecordsTable, playerLocationTable,
} from "@workspace/db";
import { desc, eq, notInArray, gte, and, ne, inArray } from "drizzle-orm";
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

// Metric column lookup
type MetricKey = "steps" | "workouts" | "battle_wins" | "streaks" | "xp" | "artifacts";

function getMetricValue(player: typeof playersTable.$inferSelect, metric: MetricKey): number {
  switch (metric) {
    case "steps":       return player.totalSteps;
    case "workouts":    return player.totalWorkouts;
    case "battle_wins": return player.totalBattleWins;
    case "streaks":     return player.currentStreak;
    case "artifacts":   return player.xp; // proxied by XP; artifacts count added per-player where needed
    default:            return player.xp;
  }
}

function metricLabel(metric: MetricKey, value: number): string {
  switch (metric) {
    case "steps":       return value.toLocaleString() + " steps";
    case "workouts":    return value.toLocaleString() + " workouts";
    case "battle_wins": return value.toLocaleString() + " wins";
    case "streaks":     return value + " day streak";
    case "xp":          return value.toLocaleString() + " XP";
    case "artifacts":   return value.toLocaleString() + " XP";
  }
}

// ── GET /leaderboards/global ──────────────────────────────────────────────────
router.get("/leaderboards/global", requireAuth, attachPlayer, async (req, res) => {
  const query = GetGlobalLeaderboardQueryParams.safeParse({
    limit: req.query.limit ? Number(req.query.limit) : 50,
  });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players =
    hiddenIds.length > 0
      ? await db.select().from(playersTable)
          .where(notInArray(playersTable.id, hiddenIds))
          .orderBy(desc(playersTable.rankScore), desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50)
      : await db.select().from(playersTable)
          .orderBy(desc(playersTable.rankScore), desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50);

  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = players.map((p, i) => {
    const topHatchling = hatchlings
      .filter(h => h.playerId === p.id)
      .sort((a, b) => b.level - a.level)[0];
    return {
      position:         i + 1,
      playerId:         p.id,
      username:         p.username,
      displayName:      p.displayName,
      avatarUrl:        p.avatarUrl,
      rank:             p.rank,
      score:            p.rankScore,
      wins:             p.totalWins,
      hatchlingName:    topHatchling?.name ?? "None",
      hatchlingCategory: topHatchling?.category ?? null,
      isMe:             p.id === req.playerId,
    };
  });

  res.json(result);
});

// ── GET /leaderboards/scoped — location-aware multi-scope leaderboard ─────────
router.get("/leaderboards/scoped", requireAuth, attachPlayer, async (req, res) => {
  const scope    = ((req.query.scope  as string) ?? "world") as "world" | "country" | "state" | "county" | "city";
  const metric   = ((req.query.metric as string) ?? "xp")    as MetricKey;
  const limit    = Math.min(50, Number(req.query.limit ?? 20));
  const validScopes  = ["world", "country", "state", "county", "city"];
  const validMetrics = ["steps", "workouts", "battle_wins", "streaks", "xp", "artifacts"];

  if (!validScopes.includes(scope) || !validMetrics.includes(metric)) {
    res.status(400).json({ error: "Invalid scope or metric" });
    return;
  }

  // Get the requesting player's location
  const myLocation = req.playerId
    ? await db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, req.playerId) })
    : null;

  // If non-world scope requested but no location set
  if (scope !== "world" && !myLocation) {
    res.json({ entries: [], myEntry: null, scope, metric, locationRequired: true });
    return;
  }

  // Find players eligible for this scope
  let eligiblePlayerIds: number[] | null = null;

  if (scope !== "world") {
    // Build scope filter on player_location
    const conditions: ReturnType<typeof eq>[] = [
      ne(playerLocationTable.visibility, "hidden") as ReturnType<typeof eq>,
    ];

    if (scope === "country" && myLocation?.country)
      conditions.push(eq(playerLocationTable.country, myLocation.country) as ReturnType<typeof eq>);
    if (scope === "state" && myLocation?.state)
      conditions.push(eq(playerLocationTable.state, myLocation.state) as ReturnType<typeof eq>);
    if (scope === "county" && myLocation?.county)
      conditions.push(eq(playerLocationTable.county, myLocation.county) as ReturnType<typeof eq>);
    if (scope === "city" && myLocation?.city)
      conditions.push(eq(playerLocationTable.city, myLocation.city) as ReturnType<typeof eq>);

    const locs = await db.query.playerLocationTable.findMany({
      where: and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
    });
    eligiblePlayerIds = locs.map(l => l.playerId);

    if (eligiblePlayerIds.length === 0) {
      res.json({ entries: [], myEntry: null, scope, metric, locationRequired: false });
      return;
    }
  }

  // Sorting is done in-memory below after fetching players
  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  let players: (typeof playersTable.$inferSelect)[];

  if (eligiblePlayerIds) {
    players = await db.query.playersTable.findMany({
      where: (t, { inArray: iA, notInArray: niA }) =>
        hiddenIds.length > 0
          ? and(iA(t.id, eligiblePlayerIds!), niA(t.id, hiddenIds))
          : iA(t.id, eligiblePlayerIds!),
    });
  } else {
    // world scope — all players who haven't hidden location
    const visibleLocs = await db.query.playerLocationTable.findMany({
      where: ne(playerLocationTable.visibility, "hidden"),
    });
    const visibleIds = visibleLocs.map(l => l.playerId);

    // Include players without location (they default to global)
    players = await db.query.playersTable.findMany({
      where: hiddenIds.length > 0 ? notInArray(playersTable.id, hiddenIds) : undefined,
    });
    // De-duplicate and keep players who have set location as visible or have no location at all
    const hiddenLocIds = new Set(
      (await db.query.playerLocationTable.findMany({ where: eq(playerLocationTable.visibility, "hidden") }))
        .map(l => l.playerId)
    );
    players = players.filter(p => !hiddenLocIds.has(p.id));
  }

  // Sort by metric descending
  players.sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric));

  const top = players.slice(0, limit);
  const myRankIndex = players.findIndex(p => p.id === req.playerId);

  const entries = top.map((p, i) => ({
    position:     i + 1,
    playerId:     p.id,
    username:     p.username,
    displayName:  p.displayName,
    avatarUrl:    p.avatarUrl,
    rank:         p.rank,
    metricValue:  getMetricValue(p, metric),
    metricLabel:  metricLabel(metric, getMetricValue(p, metric)),
    isMe:         p.id === req.playerId,
    currentStreak: p.currentStreak,
  }));

  // My entry (may be outside top N)
  let myEntry = entries.find(e => e.isMe) ?? null;
  if (!myEntry && myRankIndex >= 0) {
    const mp = players[myRankIndex];
    myEntry = {
      position:     myRankIndex + 1,
      playerId:     mp.id,
      username:     mp.username,
      displayName:  mp.displayName,
      avatarUrl:    mp.avatarUrl,
      rank:         mp.rank,
      metricValue:  getMetricValue(mp, metric),
      metricLabel:  metricLabel(metric, getMetricValue(mp, metric)),
      isMe:         true,
      currentStreak: mp.currentStreak,
    };
  }

  res.json({
    entries,
    myEntry,
    scope,
    metric,
    totalInScope: players.length,
    locationRequired: false,
    locationContext: myLocation
      ? { city: myLocation.city, state: myLocation.state, country: myLocation.country }
      : null,
  });
});

// ── GET /leaderboards/by-mode ─────────────────────────────────────────────────
router.get("/leaderboards/by-mode", requireAuth, attachPlayer, async (req, res) => {
  const query = GetModeLeaderboardQueryParams.safeParse({
    mode: req.query.mode as string,
    limit: req.query.limit ? Number(req.query.limit) : 50,
  });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players =
    hiddenIds.length > 0
      ? await db.select().from(playersTable)
          .where(notInArray(playersTable.id, hiddenIds))
          .orderBy(desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50)
      : await db.select().from(playersTable)
          .orderBy(desc(playersTable.totalWins))
          .limit(query.data.limit ?? 50);

  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = players.map((p, i) => {
    const topHatchling = hatchlings
      .filter(h => h.playerId === p.id)
      .sort((a, b) => b.level - a.level)[0];
    return {
      position:          i + 1,
      playerId:          p.id,
      username:          p.username,
      displayName:       p.displayName,
      avatarUrl:         p.avatarUrl,
      rank:              p.rank,
      score:             p.rankScore,
      wins:              p.totalWins,
      hatchlingName:     topHatchling?.name ?? "None",
      hatchlingCategory: topHatchling?.category ?? null,
    };
  });

  res.json(result);
});

// ── GET /leaderboards/rank-distribution ──────────────────────────────────────
router.get("/leaderboards/rank-distribution", async (_req, res) => {
  const players = await db.query.playersTable.findMany();
  const rankMap: Record<string, number> = {};
  for (const p of players) {
    rankMap[p.rank] = (rankMap[p.rank] ?? 0) + 1;
  }
  const ranks = ["Bronze", "Silver", "Gold", "Diamond", "Master", "Cosmic", "Legendary"];
  const result = ranks.map(rank => ({
    rank,
    count:      rankMap[rank] ?? 0,
    percentage: players.length > 0 ? ((rankMap[rank] ?? 0) / players.length) * 100 : 0,
    color:      RANK_COLORS[rank] ?? "#888888",
  }));
  res.json(result);
});

// ── GET /leaderboards/battle-elo ──────────────────────────────────────────────
router.get("/leaderboards/battle-elo", requireAuth, attachPlayer, async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit ?? 50));
  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  const players =
    hiddenIds.length > 0
      ? await db.select().from(playersTable)
          .where(notInArray(playersTable.id, hiddenIds))
          .orderBy(desc(playersTable.battleElo))
          .limit(limit)
      : await db.select().from(playersTable)
          .orderBy(desc(playersTable.battleElo))
          .limit(limit);

  res.json(players.map((p, i) => ({
    rank:           i + 1,
    playerId:       p.id,
    username:       p.username,
    displayName:    p.displayName,
    avatarUrl:      p.avatarUrl,
    battleElo:      p.battleElo,
    totalBattleWins: p.totalBattleWins,
    level:          p.level,
    isMe:           p.id === req.playerId,
  })));
});

// ── GET /leaderboards/speed ───────────────────────────────────────────────────
router.get("/leaderboards/speed", requireAuth, attachPlayer, async (req, res) => {
  const mode  = (req.query.mode as string) ?? "steps";
  const limit = Math.min(50, Number(req.query.limit ?? 25));
  const hiddenIds = req.playerId ? await getHiddenPlayerIds(req.playerId) : [];

  if (mode === "pace") {
    const runPrs = await db.query.personalRecordsTable.findMany({
      where: and(
        eq(personalRecordsTable.activityType, "running"),
        eq(personalRecordsTable.metric, "pace_seconds_per_mile"),
      ),
    });
    const players = await db.query.playersTable.findMany();
    const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

    const sorted = runPrs
      .filter(r => !hiddenIds.includes(r.playerId))
      .sort((a, b) => a.value - b.value)
      .slice(0, limit);

    if (sorted.length === 0) {
      const fallback = players
        .filter(p => !hiddenIds.includes(p.id))
        .sort((a, b) => b.totalSteps - a.totalSteps)
        .slice(0, limit)
        .map((p, i) => ({
          position: i + 1, playerId: p.id, username: p.username,
          displayName: p.displayName, avatarUrl: p.avatarUrl, rank: p.rank,
          metricValue: p.totalSteps, metricLabel: "No pace data yet",
          achievedAt: new Date().toISOString(), currentStreak: p.currentStreak,
        }));
      res.json(fallback);
      return;
    }

    res.json(sorted.map((r, i) => {
      const p = playerMap[r.playerId];
      const mins = Math.floor(r.value / 60);
      const secs = r.value % 60;
      return {
        position: i + 1, playerId: r.playerId,
        username: p?.username ?? "Unknown", displayName: p?.displayName ?? null,
        avatarUrl: p?.avatarUrl ?? null, rank: p?.rank ?? "Bronze",
        metricValue: r.value, metricLabel: `${mins}:${String(secs).padStart(2, "0")} /mi`,
        achievedAt: r.achievedAt.toISOString(), currentStreak: p?.currentStreak ?? 0,
      };
    }));
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayStepActivities = await db.query.fitnessActivitiesTable.findMany({
    where: and(eq(fitnessActivitiesTable.type, "steps"), gte(fitnessActivitiesTable.createdAt, todayStart)),
  });

  const stepsByPlayer: Record<number, number> = {};
  for (const a of todayStepActivities) {
    if (!hiddenIds.includes(a.playerId)) {
      stepsByPlayer[a.playerId] = (stepsByPlayer[a.playerId] ?? 0) + a.value;
    }
  }

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

  res.json(sorted.map((entry, i) => {
    const p = playerMap[entry.playerId];
    return {
      position: i + 1, playerId: entry.playerId,
      username: p?.username ?? "Unknown", displayName: p?.displayName ?? null,
      avatarUrl: p?.avatarUrl ?? null, rank: p?.rank ?? "Bronze",
      metricValue: entry.steps, metricLabel: entry.steps.toLocaleString() + " steps",
      achievedAt: new Date().toISOString(), currentStreak: p?.currentStreak ?? 0,
    };
  }));
});

export default router;
