import { Router } from "express";
import { db } from "@workspace/db";
import { fitnessActivitiesTable, fitnessQuestsTable, playersTable, eggsTable, groupsTable, groupMembersTable } from "@workspace/db";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import {
  GetFitnessStatsParams,
  LogActivityBody,
  ListFitnessActivitiesQueryParams,
  GetActiveQuestsParams,
  CompleteQuestParams,
  ListRealmsQueryParams,
} from "@workspace/api-zod";
import { logFitnessActivity, ACTIVITY_CONFIG } from "../services/fitnessLog.ts";
import { validateStepDelta } from "../services/antiCheat.ts";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth.ts";
import { fitnessLogLimiter } from "../middlewares/rateLimiters.ts";

function getGroupXpBonus(memberCount: number): number {
  if (memberCount >= 6) return 0.5;
  if (memberCount >= 4) return 0.25;
  if (memberCount >= 2) return 0.1;
  return 0;
}

const router = Router();


const REALMS = [
  {
    id: "strength",
    name: "Strength Realm",
    description: "Power through iron and discipline. Weightlifting and resistance training unlock armored titan creatures.",
    color: "#ef4444",
    icon: "Dumbbell",
    fitnessTypes: ["weightlifting"],
    evolutionBonus: "Unlocks armored titan evolutions with massive defense stats",
  },
  {
    id: "cardio",
    name: "Cardio Realm",
    description: "Run, cycle, and fly. Speed and endurance activities unlock swift aerial creatures.",
    color: "#3b82f6",
    icon: "Wind",
    fitnessTypes: ["running", "walking", "cycling", "steps"],
    evolutionBonus: "Unlocks speed and flying evolutions with high agility",
  },
  {
    id: "balance",
    name: "Balance Realm",
    description: "Sleep, hydration, and mindfulness. Recovery activities unlock mystical healer creatures.",
    color: "#8b5cf6",
    icon: "Moon",
    fitnessTypes: ["yoga", "meditation", "sleep", "hydration", "stretching"],
    evolutionBonus: "Unlocks mystic healer evolutions with aura powers",
  },
  {
    id: "beast",
    name: "Beast Realm",
    description: "HIIT, swimming, and hardcore training. Intense workouts unlock rage and combat creatures.",
    color: "#f97316",
    icon: "Flame",
    fitnessTypes: ["hiit", "swimming"],
    evolutionBonus: "Unlocks rage and combat evolutions with high attack power",
  },
  {
    id: "mythic",
    name: "Mythic Realm",
    description: "Master all realms to unlock legendary hidden evolutions. Only the most dedicated trainers reach this tier.",
    color: "#fbbf24",
    icon: "Star",
    fitnessTypes: [],
    evolutionBonus: "Unlocks legendary and prestige evolutions — the rarest creatures in existence",
  },
];

function getTodayStart(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function getTomorrowStart(): Date {
  const d = getTodayStart();
  d.setDate(d.getDate() + 1);
  return d;
}

function generateDailyQuests(playerId: number): Array<{
  playerId: number; title: string; description: string; type: string;
  targetValue: number; xpReward: number; coinReward: number; realm: string; expiresAt: Date;
}> {
  const tomorrow = getTomorrowStart();
  return [
    {
      playerId, title: "Morning Mover", description: "Log 5,000 steps today", type: "steps",
      targetValue: 5000, xpReward: 150, coinReward: 75, realm: "cardio", expiresAt: tomorrow,
    },
    {
      playerId, title: "Power Hour", description: "Complete 30 minutes of strength training", type: "weightlifting",
      targetValue: 30, xpReward: 200, coinReward: 100, realm: "strength", expiresAt: tomorrow,
    },
    {
      playerId, title: "Hydration Hero", description: "Drink 8 cups of water", type: "hydration",
      targetValue: 8, xpReward: 100, coinReward: 50, realm: "balance", expiresAt: tomorrow,
    },
    {
      playerId, title: "Rest & Recover", description: "Get 7 hours of sleep", type: "sleep",
      targetValue: 7, xpReward: 120, coinReward: 60, realm: "balance", expiresAt: tomorrow,
    },
    {
      playerId, title: "Beast Mode", description: "Complete a 20-minute HIIT session", type: "hiit",
      targetValue: 20, xpReward: 250, coinReward: 125, realm: "beast", expiresAt: tomorrow,
    },
  ];
}

// GET /fitness/stats/:playerId
router.get("/fitness/stats/:playerId", requireAuth, attachPlayer, async (req, res) => {
  const params = GetFitnessStatsParams.safeParse({ playerId: Number(req.params.playerId) });
  if (!params.success) { res.status(400).json({ error: "Invalid playerId" }); return; }
  if (params.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const todayStart = getTodayStart();
  const todayActivities = await db.query.fitnessActivitiesTable.findMany({
    where: and(
      eq(fitnessActivitiesTable.playerId, params.data.playerId),
      gte(fitnessActivitiesTable.createdAt, todayStart),
    ),
    orderBy: [desc(fitnessActivitiesTable.createdAt)],
  });

  const todaySteps = todayActivities
    .filter(a => a.type === "steps")
    .reduce((sum, a) => sum + a.value, 0);
  const todayXp = todayActivities.reduce((sum, a) => sum + a.fitnessXpEarned, 0);

  const recentActivities = await db.query.fitnessActivitiesTable.findMany({
    where: eq(fitnessActivitiesTable.playerId, params.data.playerId),
    orderBy: [desc(fitnessActivitiesTable.createdAt)],
    limit: 10,
  });

  const recentFormatted = recentActivities.map(a => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  const dailyStepGoal = player.dailyStepGoal ?? 8000;
  const stepGoalPct = Math.min(100, Math.round((todaySteps / dailyStepGoal) * 100));

  res.json({
    playerId: player.id,
    totalSteps: player.totalSteps,
    totalWorkouts: player.totalWorkouts,
    fitnessXp: player.fitnessXp,
    currentStreak: player.currentStreak,
    longestStreak: player.longestStreak,
    fitnessRealm: player.fitnessRealm,
    waterCups: player.waterCups,
    todaySteps,
    todayXp,
    dailyStepGoal,
    stepGoalPct,
    recentActivities: recentFormatted,
  });
});

// POST /fitness/log
router.post("/fitness/log", fitnessLogLimiter, requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = LogActivityBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  // Reject non-positive duration when distance is provided — guards pace/speed PR math from Infinity.
  if (body.data.value <= 0) {
    res.status(400).json({ error: "Duration (value) must be positive" });
    return;
  }
  if (body.data.distanceMiles != null && body.data.distanceMiles <= 0) {
    res.status(400).json({ error: "Distance must be positive when provided" });
    return;
  }

  // ── Anti-cheat: reject impossible pace and unrealistic durations ───────────
  // `value` is polymorphic across activity types (minutes / steps / reps / cups / hours / kcal),
  // so duration/pace checks only apply to duration-based cardio activities where the unit is
  // minutes (running, walking, cycling, etc.). Distance-based activities additionally get a pace check.
  const cfg = ACTIVITY_CONFIG[body.data.type];
  const isDurationMinutes = cfg?.unit === "minutes";

  // World-record marathon pace is ~4:30/mile. Anything sub-3:00/mile is clearly spoofed.
  if (isDurationMinutes && body.data.distanceMiles != null && body.data.value > 0) {
    const minutesPerMile = body.data.value / body.data.distanceMiles;
    if (minutesPerMile < 3) {
      req.log?.warn?.({ playerId: body.data.playerId, minutesPerMile, distanceMiles: body.data.distanceMiles, value: body.data.value }, "Fitness log rejected: impossible pace");
      res.status(400).json({ error: "fitness_anti_cheat_reject", reason: "impossible_pace" });
      return;
    }
  }
  // 24h+ single duration log is implausible — likely a stuck timer or spoof.
  // Only applied to minute-unit activities, not step/rep/cup/kcal logs.
  if (isDurationMinutes && body.data.value > 1440) {
    res.status(400).json({ error: "fitness_anti_cheat_reject", reason: "duration_too_long" });
    return;
  }

  // ── Anti-cheat: step-rate spoof detection ────────────────────────────────
  // For step ingestion, compare against the most-recent prior steps log to
  // bound the cadence. Rejects impossible step rates (>400/min).
  if (body.data.type === "steps") {
    const lastSteps = await db.query.fitnessActivitiesTable.findFirst({
      where: and(
        eq(fitnessActivitiesTable.playerId, body.data.playerId),
        eq(fitnessActivitiesTable.type, "steps"),
      ),
      orderBy: [desc(fitnessActivitiesTable.createdAt)],
    });
    if (lastSteps) {
      const secondsElapsed = Math.max(1, Math.floor((Date.now() - lastSteps.createdAt.getTime()) / 1000));
      const stepVerdict = validateStepDelta({ stepsAdded: body.data.value, secondsElapsed });
      if (stepVerdict.verdict === "reject") {
        req.log?.warn?.({ playerId: body.data.playerId, reason: stepVerdict.reason, details: stepVerdict.details }, "Step log rejected by anti-cheat");
        res.status(400).json({ error: "fitness_anti_cheat_reject", reason: stepVerdict.reason });
        return;
      }
      if (stepVerdict.verdict === "suspicious") {
        req.log?.info?.({ playerId: body.data.playerId, reason: stepVerdict.reason, details: stepVerdict.details }, "Step log flagged suspicious");
      }
    }
  }

  const result = await logFitnessActivity({
    playerId: body.data.playerId,
    type: body.data.type,
    value: body.data.value,
    note: body.data.note ?? null,
    isPassiveSync: false,
    distanceMiles: body.data.distanceMiles ?? null,
  });

  if (!result.updatedPlayer) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  let groupBonusXp = 0;
  let groupXpBonusPct = 0;

  if (body.data.groupId) {
    const member = await db.query.groupMembersTable.findFirst({
      where: and(
        eq(groupMembersTable.groupId, body.data.groupId),
        eq(groupMembersTable.playerId, body.data.playerId)
      ),
    });
    if (member) {
      const members = await db.query.groupMembersTable.findMany({
        where: eq(groupMembersTable.groupId, body.data.groupId),
      });
      const bonusPct = getGroupXpBonus(members.length);
      groupBonusXp = Math.round(result.fitnessXpEarned * bonusPct);
      groupXpBonusPct = Math.round(bonusPct * 100);

      if (groupBonusXp > 0) {
        await db.update(playersTable)
          .set({ fitnessXp: sql`${playersTable.fitnessXp} + ${groupBonusXp}` })
          .where(eq(playersTable.id, body.data.playerId));

        const energyGained = Math.round(body.data.value * 0.1) + 10;
        await db.update(groupsTable)
          .set({
            teamEnergy: sql`${groupsTable.teamEnergy} + ${energyGained}`,
            totalTeamEnergy: sql`${groupsTable.totalTeamEnergy} + ${energyGained}`,
          })
          .where(eq(groupsTable.id, body.data.groupId));
      }
    }
  }

  const activityFormatted = result.activity
    ? { ...result.activity, createdAt: result.activity.createdAt.toISOString() }
    : null;

  // ── Cross-feature reward fan-out ──────────────────────────────────────────
  // The client renders a unified RewardSummaryModal, but the *source of truth*
  // for what ripple-effects fired is the server. We synthesize a structured
  // list of every cross-feature reward this activity triggered so any future
  // surface (mobile, web, AI assistant recap) can reflect the same outcome
  // without re-deriving it from the raw response shape.
  type RewardEntry =
    | { kind: "xp"; label: string; value: number; detail?: string }
    | { kind: "hatchling"; label: string; value: number; detail?: string }
    | { kind: "streak"; label: string; value: number; detail?: string }
    | { kind: "leaderboard"; label: string; value?: string; detail?: string }
    | { kind: "artifact"; label: string; value?: string; detail?: string }
    | { kind: "challenge"; label: string; value?: string; detail?: string };
  const rewardSummary: RewardEntry[] = [];
  if (result.fitnessXpEarned > 0) {
    rewardSummary.push({
      kind: "xp",
      label: "Fitness XP",
      value: result.fitnessXpEarned,
      detail: "Granted to your active Hatchling.",
    });
  }
  if (groupBonusXp > 0) {
    rewardSummary.push({
      kind: "xp",
      label: `Group bonus (+${groupXpBonusPct}%)`,
      value: groupBonusXp,
      detail: "Team energy increased.",
    });
  }
  if ((result.eggsUpdated ?? 0) > 0) {
    rewardSummary.push({
      kind: "hatchling",
      label: "Egg progress",
      value: result.eggsUpdated,
      detail: "Your incubator advanced toward hatching.",
    });
  }
  const streakAfter = result.updatedPlayer.currentStreak ?? 0;
  if (streakAfter > 0) {
    rewardSummary.push({
      kind: "streak",
      label: `${streakAfter}-day streak`,
      value: streakAfter,
      detail: "Keep the chain alive tomorrow.",
    });
  }
  if (result.prResult?.isNew) {
    rewardSummary.push({
      kind: "leaderboard",
      label: "New Personal Record",
      value: String(result.prResult.value ?? ""),
      detail: `${result.prResult.activityType} — leaderboard standing improved.`,
    });
  }
  for (const a of result.newArtifacts ?? []) {
    rewardSummary.push({
      kind: "artifact",
      label: a.name,
      value: a.rarity,
      detail: "Minted to your Museum.",
    });
  }
  for (const b of result.newBadges ?? []) {
    rewardSummary.push({
      kind: "challenge",
      label: `Badge: ${b.name ?? "Achievement"}`,
    });
  }

  res.status(201).json({
    activity: activityFormatted,
    fitnessXpEarned: result.fitnessXpEarned + groupBonusXp,
    eggsUpdated: result.eggsUpdated,
    player: result.updatedPlayer,
    groupBonusXp: groupBonusXp > 0 ? groupBonusXp : undefined,
    groupXpBonusPct: groupXpBonusPct > 0 ? groupXpBonusPct : undefined,
    prResult: result.prResult ?? null,
    newArtifacts: result.newArtifacts ?? [],
    newBadges: result.newBadges ?? [],
    rewardSummary,
  });
});

// GET /fitness/activities
router.get("/fitness/activities", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = ListFitnessActivitiesQueryParams.safeParse({
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
  });
  if (!query.success || !query.data.playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const activities = await db.query.fitnessActivitiesTable.findMany({
    where: eq(fitnessActivitiesTable.playerId, query.data.playerId),
    orderBy: [desc(fitnessActivitiesTable.createdAt)],
    limit: query.data.limit ?? 20,
  });

  res.json(activities.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// GET /fitness/quests/:playerId
router.get("/fitness/quests/:playerId", requireAuth, attachPlayer, async (req, res) => {
  const params = GetActiveQuestsParams.safeParse({ playerId: Number(req.params.playerId) });
  if (!params.success) { res.status(400).json({ error: "Invalid playerId" }); return; }
  if (params.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const todayStart = getTodayStart();
  const quests = await db.query.fitnessQuestsTable.findMany({
    where: and(
      eq(fitnessQuestsTable.playerId, params.data.playerId),
      gte(fitnessQuestsTable.expiresAt, todayStart),
    ),
    orderBy: [desc(fitnessQuestsTable.createdAt)],
  });

  // Auto-generate quests if none exist for today
  if (quests.length === 0) {
    const newQuests = generateDailyQuests(params.data.playerId);
    const inserted = await db.insert(fitnessQuestsTable).values(newQuests).returning();
    res.json(inserted.map(q => ({
      ...q,
      expiresAt: q.expiresAt.toISOString(),
      createdAt: q.createdAt.toISOString(),
      progressPct: 0,
    })));
    return;
  }

  res.json(quests.map(q => ({
    ...q,
    expiresAt: q.expiresAt.toISOString(),
    createdAt: q.createdAt.toISOString(),
    progressPct: Math.min(100, Math.round((q.currentValue / q.targetValue) * 100)),
  })));
});

// POST /fitness/quests/:id/complete
router.post("/fitness/quests/:id/complete", requireAuth, attachPlayer, async (req, res) => {
  const params = CompleteQuestParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const quest = await db.query.fitnessQuestsTable.findFirst({ where: eq(fitnessQuestsTable.id, params.data.id) });
  if (!quest) { res.status(404).json({ error: "Quest not found" }); return; }
  if (quest.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (quest.isCompleted) { res.status(400).json({ error: "Quest already completed" }); return; }

  const updated = await db.update(fitnessQuestsTable)
    .set({ isCompleted: true, currentValue: quest.targetValue })
    .where(eq(fitnessQuestsTable.id, params.data.id))
    .returning();

  // Award player XP and coins
  await db.update(playersTable)
    .set({
      xp: sql`xp + ${quest.xpReward}`,
      coins: sql`coins + ${quest.coinReward}`,
      fitnessXp: sql`fitness_xp + ${quest.xpReward}`,
    })
    .where(eq(playersTable.id, quest.playerId));

  const q = updated[0];
  res.json({
    ...q,
    expiresAt: q.expiresAt.toISOString(),
    createdAt: q.createdAt.toISOString(),
    progressPct: 100,
  });
});

// GET /fitness/realms
router.get("/fitness/realms", requireAuth, attachPlayer, async (req, res) => {
  const query = ListRealmsQueryParams.safeParse({
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
  });

  if (query.success && query.data.playerId) {
    if (query.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
    const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
    const playerRealm = player?.fitnessRealm ?? "strength";
    const realmXp = player?.fitnessXp ?? 0;

    const realms = REALMS.map(r => ({
      ...r,
      playerXp: r.id === playerRealm ? realmXp : null,
      isUnlocked: r.id !== "mythic" || realmXp >= 10000,
    }));
    res.json(realms);
    return;
  }

  res.json(REALMS.map(r => ({ ...r, playerXp: null, isUnlocked: r.id !== "mythic" })));
});

export default router;
