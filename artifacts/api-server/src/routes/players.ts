import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable, competitionsTable, liveEventsTable, eggsTable, fitnessActivitiesTable, playerBadgesTable, playerArtifactsTable, artifactsTable } from "@workspace/db";
import { eq, desc, and, gte, or, ilike, ne } from "drizzle-orm";
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

  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const player = await db.insert(playersTable).values({
    clerkId,
    username,
    displayName: displayName ?? username,
    avatarUrl: avatarUrl ?? null,
    subscriptionTier: "premium",
    subscriptionSource: "trial",
    trialEndsAt: trialEnd,
  }).returning();

  res.status(201).json(player[0]);
});

router.post("/players", requireAuth, async (req, res) => {
  const body = CreatePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const player = await db
    .insert(playersTable)
    .values({
      username: body.data.username,
      displayName: body.data.displayName,
      avatarUrl: body.data.avatarUrl,
      clerkId: req.clerkUserId!,
      subscriptionTier: "premium",
      subscriptionSource: "trial",
      trialEndsAt: trialEnd,
    })
    .returning();
  res.status(201).json(player[0]);
});

// GET /players/search — search by username or displayName (case-insensitive)
router.get("/players/search", requireAuth, attachPlayer, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json([]);
    return;
  }
  const rawLimit = Number(req.query.limit);
  const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20));
  const needle = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const viewerId = req.playerId;
  const whereExpr = viewerId
    ? and(
        or(ilike(playersTable.username, needle), ilike(playersTable.displayName, needle)),
        ne(playersTable.id, viewerId),
      )
    : or(ilike(playersTable.username, needle), ilike(playersTable.displayName, needle));

  const rows = await db.query.playersTable.findMany({
    where: whereExpr,
    limit,
    orderBy: (t, { asc }) => [asc(t.username)],
  });

  res.json(rows.map(p => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    creatorBadge: p.creatorBadge ?? null,
  })));
});

router.get("/players/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetPlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(player);
});

// GET /players/:id/profile — public profile with artifact showcase (top 3 featured/equipped)
router.get("/players/:id/profile", requireAuth, async (req, res) => {
  const playerId = Number(req.params.id);
  if (isNaN(playerId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [player, ownedArtifacts] = await Promise.all([
    db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
    db.query.playerArtifactsTable.findMany({
      where: eq(playerArtifactsTable.playerId, playerId),
      orderBy: (t, { desc: d }) => [d(t.isFeatured), d(t.isEquipped), d(t.earnedAt)],
    }),
  ]);

  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  // Fetch top 3 featured/equipped artifacts for the public showcase strip
  const showcaseOwned = ownedArtifacts.slice(0, 3);
  let showcaseArtifacts: Array<{ id: number; name: string; rarity: string; imageSlug: string; isFeatured: boolean; isEquipped: boolean }> = [];

  if (showcaseOwned.length > 0) {
    const artifactIds = showcaseOwned.map(o => o.artifactId);
    const artifacts = await db.query.artifactsTable.findMany({
      where: (t, { inArray }) => inArray(t.id, artifactIds),
    });
    const artifactMap = new Map(artifacts.map(a => [a.id, a]));
    showcaseArtifacts = showcaseOwned.map(o => {
      const a = artifactMap.get(o.artifactId);
      if (!a) return null;
      return { id: a.id, name: a.name, rarity: a.rarity, imageSlug: a.imageSlug, isFeatured: o.isFeatured, isEquipped: o.isEquipped };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }

  res.json({
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    rank: player.rank,
    level: player.level,
    currentStreak: player.currentStreak,
    totalWorkouts: player.totalWorkouts,
    isVerified: player.isVerified,
    artifactShowcase: showcaseArtifacts,
    artifactCount: ownedArtifacts.length,
  });
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
  let player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  // ── No-shame streak recovery logic ───────────────────────────────────────
  if (player.lastActiveDate) {
    const lastActive = new Date(player.lastActiveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1 && !player.streakAtRisk) {
      // One day missed → mark streak at risk (soft pause, not reset)
      const [updated] = await db.update(playersTable)
        .set({ streakAtRisk: true })
        .where(eq(playersTable.id, params.data.id))
        .returning();
      player = updated;
    } else if (diffDays >= 2 && player.currentStreak > 0) {
      // Two+ days missed → reset streak but preserve all XP, add encouraging recovery message
      const [updated] = await db.update(playersTable)
        .set({
          currentStreak: 0,
          streakAtRisk: false,
          recoveryMessage: "Welcome back! Your XP and progress are safe — let's get moving again. Every step forward counts. 💪",
        })
        .where(eq(playersTable.id, params.data.id))
        .returning();
      player = updated;
    }
  }

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
