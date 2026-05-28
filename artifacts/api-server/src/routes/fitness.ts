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
import { logFitnessActivity } from "../services/fitnessLog";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth";

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
router.post("/fitness/log", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = LogActivityBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const result = await logFitnessActivity({
    playerId: body.data.playerId,
    type: body.data.type,
    value: body.data.value,
    note: body.data.note ?? null,
    isPassiveSync: false,
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

  res.status(201).json({
    activity: activityFormatted,
    fitnessXpEarned: result.fitnessXpEarned + groupBonusXp,
    eggsUpdated: result.eggsUpdated,
    player: result.updatedPlayer,
    groupBonusXp: groupBonusXp > 0 ? groupBonusXp : undefined,
    groupXpBonusPct: groupXpBonusPct > 0 ? groupXpBonusPct : undefined,
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
