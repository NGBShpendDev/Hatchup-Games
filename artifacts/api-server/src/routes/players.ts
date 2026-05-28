import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable, competitionsTable, liveEventsTable, eggsTable, fitnessActivitiesTable, playerBadgesTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  GetPlayerParams,
  UpdatePlayerParams,
  GetPlayerDashboardParams,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { BADGE_MAP, computeLevelProgress, getDailyReward } from "../services/badgeService";

const router = Router();

// GET /players/me — returns current player (JIT provision if first time)
router.get("/players/me", requireAuth, async (req, res) => {
  const clerkId = req.clerkUserId!;
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.clerkId, clerkId) });
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(player);
});

// POST /players/me — create profile for new user
router.post("/players/me", requireAuth, async (req, res) => {
  const clerkId = req.clerkUserId!;

  const existing = await db.query.playersTable.findFirst({ where: eq(playersTable.clerkId, clerkId) });
  if (existing) {
    res.json(existing);
    return;
  }

  const { username, displayName, avatarUrl } = req.body as { username?: string; displayName?: string; avatarUrl?: string };
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const taken = await db.query.playersTable.findFirst({ where: eq(playersTable.username, username) });
  if (taken) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const player = await db.insert(playersTable).values({
    clerkId,
    username,
    displayName: displayName ?? username,
    avatarUrl: avatarUrl ?? null,
  }).returning();

  res.status(201).json(player[0]);
});

router.post("/players", requireAuth, async (req, res) => {
  const body = CreatePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const player = await db
    .insert(playersTable)
    .values({ username: body.data.username, displayName: body.data.displayName, avatarUrl: body.data.avatarUrl, clerkId: req.clerkUserId! })
    .returning();
  res.status(201).json(player[0]);
});

router.get("/players/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetPlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(player);
});

router.patch("/players/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = UpdatePlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = UpdatePlayerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const updated = await db.update(playersTable).set(body.data).where(eq(playersTable.id, params.data.id)).returning();
  if (!updated.length) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(updated[0]);
});

router.get("/players/:id/dashboard", requireAuth, attachPlayer, async (req, res) => {
  const params = GetPlayerDashboardParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const [hatchlings, recentComps, activeEvents, activeEggs, recentActivities, earnedBadges] = await Promise.all([
    db.query.hatchlingsTable.findMany({ where: eq(hatchlingsTable.playerId, params.data.id) }),
    db.query.competitionsTable.findMany({
      where: eq(competitionsTable.playerId, params.data.id),
      orderBy: [desc(competitionsTable.createdAt)],
      limit: 5,
    }),
    db.query.liveEventsTable.findMany({
      where: eq(liveEventsTable.status, "active"),
      limit: 3,
    }),
    db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, params.data.id), eq(eggsTable.isHatched, false)),
    }),
    db.query.fitnessActivitiesTable.findMany({
      where: eq(fitnessActivitiesTable.playerId, params.data.id),
      orderBy: [desc(fitnessActivitiesTable.createdAt)],
      limit: 5,
    }),
    db.query.playerBadgesTable.findMany({
      where: eq(playerBadgesTable.playerId, params.data.id),
      orderBy: (t, { desc: d }) => [d(t.earnedAt)],
    }),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayActivities = recentActivities.filter(a => a.createdAt >= todayStart);
  const todaySteps = todayActivities.filter(a => a.type === "steps").reduce((s, a) => s + a.value, 0);
  const todayXp = todayActivities.reduce((s, a) => s + a.fitnessXpEarned, 0);
  const dailyStepGoal = player.dailyStepGoal ?? 8000;

  const topHatchling = hatchlings.sort((a, b) => b.level - a.level)[0] ?? null;
  const wins = recentComps.filter(c => c.rank === 1).length;
  const winRate = recentComps.length > 0 ? wins / recentComps.length : 0;

  const readyEggs = activeEggs.filter(e => e.stepsProgress >= e.stepsRequired);
  const eggsFormatted = activeEggs.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    hatchedAt: e.hatchedAt?.toISOString() ?? null,
    progressPct: Math.min(100, Math.round((e.stepsProgress / e.stepsRequired) * 100)),
    isReady: e.stepsProgress >= e.stepsRequired,
  }));

  // XP level progress
  const levelProgress = computeLevelProgress(player.xp);

  // Badge showcase
  const showcaseBadges = earnedBadges
    .filter(b => b.isShowcase)
    .map(b => ({ ...b, ...BADGE_MAP[b.badgeKey], earnedAt: b.earnedAt.toISOString() }));

  const recentBadges = earnedBadges.slice(0, 3).map(b => ({
    ...BADGE_MAP[b.badgeKey],
    earnedAt: b.earnedAt.toISOString(),
  }));

  // Daily reward status
  const now = new Date();
  const lastClaimed = player.lastRewardClaimedAt;
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dailyAlreadyClaimed = lastClaimed ? isSameDay(new Date(lastClaimed), now) : false;
  const nextRewardStreak = dailyAlreadyClaimed ? player.dailyRewardStreak : player.dailyRewardStreak + 1;
  const todayReward = getDailyReward(nextRewardStreak);

  res.json({
    player,
    hatchlingCount: hatchlings.length,
    totalWins: player.totalWins,
    winRate,
    topHatchling,
    recentCompetitions: recentComps.map(c => ({
      ...c,
      playerName: player.username,
      hatchlingName: hatchlings.find(h => h.id === c.hatchlingId)?.name ?? "Unknown",
    })),
    activeEvents: activeEvents.map(e => ({
      ...e,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
    })),
    // Fitness summary
    fitness: {
      currentStreak: player.currentStreak,
      fitnessXp: player.fitnessXp,
      totalSteps: player.totalSteps,
      todaySteps,
      todayXp,
      dailyStepGoal,
      stepGoalPct: Math.min(100, Math.round((todaySteps / dailyStepGoal) * 100)),
      fitnessRealm: player.fitnessRealm,
      waterCups: player.waterCups,
    },
    // Egg summary
    eggs: {
      active: eggsFormatted,
      readyCount: readyEggs.length,
      totalActive: activeEggs.length,
    },
    // Progression
    levelProgress,
    prestige: player.prestige ?? 0,
    title: player.title ?? null,
    streakFreezes: player.streakFreezes ?? 0,
    badgeCount: earnedBadges.length,
    showcaseBadges,
    recentBadges,
    dailyReward: {
      alreadyClaimed: dailyAlreadyClaimed,
      reward: todayReward,
      streak: player.dailyRewardStreak,
    },
  });
});

export default router;
