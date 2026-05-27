import { Router } from "express";
import { db } from "@workspace/db";
import { fitnessActivitiesTable, fitnessQuestsTable, playersTable, eggsTable } from "@workspace/db";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import {
  GetFitnessStatsParams,
  LogActivityBody,
  ListFitnessActivitiesQueryParams,
  GetActiveQuestsParams,
  CompleteQuestParams,
  ListRealmsQueryParams,
} from "@workspace/api-zod";

const router = Router();

// XP formulas per activity type
const ACTIVITY_CONFIG: Record<string, { unit: string; xpPer: number; realm: string; stepsEquiv: number }> = {
  steps:       { unit: "steps",   xpPer: 0.05,  realm: "cardio",   stepsEquiv: 1 },
  running:     { unit: "minutes", xpPer: 8,     realm: "cardio",   stepsEquiv: 150 },
  walking:     { unit: "minutes", xpPer: 4,     realm: "cardio",   stepsEquiv: 100 },
  cycling:     { unit: "minutes", xpPer: 6,     realm: "cardio",   stepsEquiv: 80 },
  weightlifting: { unit: "minutes", xpPer: 7,  realm: "strength", stepsEquiv: 60 },
  hiit:        { unit: "minutes", xpPer: 10,    realm: "beast",    stepsEquiv: 200 },
  yoga:        { unit: "minutes", xpPer: 4,     realm: "balance",  stepsEquiv: 40 },
  meditation:  { unit: "minutes", xpPer: 3,     realm: "balance",  stepsEquiv: 30 },
  sleep:       { unit: "hours",   xpPer: 15,    realm: "balance",  stepsEquiv: 200 },
  hydration:   { unit: "cups",    xpPer: 5,     realm: "balance",  stepsEquiv: 25 },
  stretching:  { unit: "minutes", xpPer: 3,     realm: "balance",  stepsEquiv: 30 },
  swimming:    { unit: "minutes", xpPer: 7,     realm: "beast",    stepsEquiv: 120 },
};

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
router.get("/fitness/stats/:playerId", async (req, res) => {
  const params = GetFitnessStatsParams.safeParse({ playerId: Number(req.params.playerId) });
  if (!params.success) { res.status(400).json({ error: "Invalid playerId" }); return; }

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
router.post("/fitness/log", async (req, res) => {
  const body = LogActivityBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const config = ACTIVITY_CONFIG[body.data.type] ?? { unit: "reps", xpPer: 1, realm: "strength", stepsEquiv: 0 };
  const fitnessXpEarned = Math.round(body.data.value * config.xpPer);
  const stepsEquiv = Math.round(body.data.value * config.stepsEquiv);

  const activity = await db.insert(fitnessActivitiesTable).values({
    playerId: body.data.playerId,
    type: body.data.type,
    value: body.data.value,
    unit: config.unit,
    fitnessXpEarned,
    realm: config.realm,
    note: body.data.note ?? null,
  }).returning();

  // Update player stats
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, body.data.playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const today = new Date().toISOString().split("T")[0];
  const lastActive = player.lastActiveDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = player.currentStreak;
  if (lastActive !== today) {
    newStreak = lastActive === yesterdayStr ? player.currentStreak + 1 : 1;
  }

  const isWorkout = body.data.type !== "steps" && body.data.type !== "hydration" && body.data.type !== "sleep";
  const updatedPlayers = await db.update(playersTable)
    .set({
      fitnessXp: player.fitnessXp + fitnessXpEarned,
      totalSteps: player.totalSteps + stepsEquiv,
      totalWorkouts: isWorkout ? player.totalWorkouts + 1 : player.totalWorkouts,
      currentStreak: newStreak,
      longestStreak: Math.max(player.longestStreak, newStreak),
      waterCups: body.data.type === "hydration" ? player.waterCups + body.data.value : player.waterCups,
      lastActiveDate: today,
    })
    .where(eq(playersTable.id, body.data.playerId))
    .returning();

  // Update egg progress with steps equivalent
  let eggsUpdated = 0;
  if (stepsEquiv > 0) {
    const activeEggs = await db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, body.data.playerId), eq(eggsTable.isHatched, false)),
    });
    for (const egg of activeEggs) {
      const newProgress = Math.min(egg.stepsRequired, egg.stepsProgress + stepsEquiv);
      await db.update(eggsTable)
        .set({ stepsProgress: newProgress })
        .where(eq(eggsTable.id, egg.id));
      eggsUpdated++;
    }
  }

  // Update quest progress
  const activeQuests = await db.query.fitnessQuestsTable.findMany({
    where: and(
      eq(fitnessQuestsTable.playerId, body.data.playerId),
      eq(fitnessQuestsTable.isCompleted, false),
      eq(fitnessQuestsTable.type, body.data.type),
    ),
  });
  for (const quest of activeQuests) {
    const newValue = Math.min(quest.targetValue, quest.currentValue + body.data.value);
    await db.update(fitnessQuestsTable)
      .set({ currentValue: newValue, isCompleted: newValue >= quest.targetValue })
      .where(eq(fitnessQuestsTable.id, quest.id));
  }

  const activityFormatted = { ...activity[0], createdAt: activity[0].createdAt.toISOString() };

  res.status(201).json({
    activity: activityFormatted,
    fitnessXpEarned,
    eggsUpdated,
    player: updatedPlayers[0],
  });
});

// GET /fitness/activities
router.get("/fitness/activities", async (req, res) => {
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
router.get("/fitness/quests/:playerId", async (req, res) => {
  const params = GetActiveQuestsParams.safeParse({ playerId: Number(req.params.playerId) });
  if (!params.success) { res.status(400).json({ error: "Invalid playerId" }); return; }

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
    return res.json(inserted.map(q => ({
      ...q,
      expiresAt: q.expiresAt.toISOString(),
      createdAt: q.createdAt.toISOString(),
      progressPct: 0,
    })));
  }

  res.json(quests.map(q => ({
    ...q,
    expiresAt: q.expiresAt.toISOString(),
    createdAt: q.createdAt.toISOString(),
    progressPct: Math.min(100, Math.round((q.currentValue / q.targetValue) * 100)),
  })));
});

// POST /fitness/quests/:id/complete
router.post("/fitness/quests/:id/complete", async (req, res) => {
  const params = CompleteQuestParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const quest = await db.query.fitnessQuestsTable.findFirst({ where: eq(fitnessQuestsTable.id, params.data.id) });
  if (!quest) { res.status(404).json({ error: "Quest not found" }); return; }
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
router.get("/fitness/realms", async (req, res) => {
  const query = ListRealmsQueryParams.safeParse({
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
  });

  if (query.success && query.data.playerId) {
    const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, query.data.playerId) });
    const playerRealm = player?.fitnessRealm ?? "strength";
    const realmXp = player?.fitnessXp ?? 0;

    const realms = REALMS.map(r => ({
      ...r,
      playerXp: r.id === playerRealm ? realmXp : null,
      isUnlocked: r.id !== "mythic" || realmXp >= 10000,
    }));
    return res.json(realms);
  }

  res.json(REALMS.map(r => ({ ...r, playerXp: null, isUnlocked: r.id !== "mythic" })));
});

export default router;
