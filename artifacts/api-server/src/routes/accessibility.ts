import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, familyGroupsTable, fitnessActivitiesTable } from "@workspace/db";
import { eq, gte, and, desc } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import crypto from "crypto";

const router = Router();

// ── Fitness Identity Path config ─────────────────────────────────────────────
const IDENTITY_PATHS: Record<string, { label: string; icon: string; description: string; evolutionTheme: string }> = {
  casual_explorer:  { label: "Casual Explorer",  icon: "🌿", description: "Move at your own pace. Every step counts.", evolutionTheme: "Tranquil" },
  warrior:          { label: "Warrior",           icon: "⚔️", description: "Push hard, train harder. Built for battle.", evolutionTheme: "Fierce" },
  athlete:          { label: "Athlete",           icon: "🏅", description: "Performance-focused, always improving PR.", evolutionTheme: "Swift" },
  recovery_master:  { label: "Recovery Master",   icon: "🌸", description: "Rest, restore, and rise stronger.", evolutionTheme: "Serene" },
  wellness_mystic:  { label: "Wellness Mystic",   icon: "✨", description: "Mindful movement and holistic balance.", evolutionTheme: "Radiant" },
  family_champion:  { label: "Family Champion",   icon: "👨‍👩‍👧‍👦", description: "Moving together as a unit.", evolutionTheme: "Warm" },
};

// ── Goal scaling by fitness level ─────────────────────────────────────────────
const BASE_GOALS: Record<string, { steps: number; workouts: number; durationMin: number; xpMultiplier: number }> = {
  beginner:     { steps: 3000,  workouts: 1, durationMin: 10, xpMultiplier: 1.0 },
  intermediate: { steps: 6000,  workouts: 2, durationMin: 20, xpMultiplier: 1.2 },
  advanced:     { steps: 10000, workouts: 3, durationMin: 30, xpMultiplier: 1.5 },
  elite:        { steps: 15000, workouts: 5, durationMin: 45, xpMultiplier: 2.0 },
};

// ── POST /onboarding ──────────────────────────────────────────────────────────
router.post("/onboarding", requireAuth, attachPlayer, async (req, res) => {
  const { ageRange, fitnessLevel, accessibilityMode, identityPath } = req.body as {
    ageRange?: string;
    fitnessLevel?: string;
    accessibilityMode?: string;
    identityPath?: string;
  };

  const validAgeRanges     = ["under13", "teen", "adult", "senior"];
  const validFitnessLevels = ["beginner", "intermediate", "advanced", "elite"];
  const validModes         = ["none", "child", "senior", "low_impact"];
  const validPaths         = Object.keys(IDENTITY_PATHS);

  const updates: Partial<typeof playersTable.$inferInsert> = {};

  if (ageRange && validAgeRanges.includes(ageRange)) {
    updates.ageRange = ageRange;
    if (ageRange === "under13") {
      updates.isMinor = true;
      updates.accessibilityMode = "child";
    }
    if (ageRange === "senior") {
      updates.accessibilityMode = "senior";
    }
  }
  if (fitnessLevel && validFitnessLevels.includes(fitnessLevel)) {
    updates.fitnessLevel = fitnessLevel;
    const goal = BASE_GOALS[fitnessLevel];
    updates.dailyStepGoal = goal.steps;
  }
  if (accessibilityMode && validModes.includes(accessibilityMode)) {
    updates.accessibilityMode = accessibilityMode;
  }
  if (identityPath && validPaths.includes(identityPath)) {
    updates.identityPath = identityPath;
  }

  updates.onboardingComplete = true;

  const [updated] = await db
    .update(playersTable)
    .set(updates)
    .where(eq(playersTable.id, req.playerId!))
    .returning();

  const pathMeta = updated.identityPath ? IDENTITY_PATHS[updated.identityPath] : null;

  res.json({ player: updated, identityPathMeta: pathMeta });
});

// ── GET /goals/today ──────────────────────────────────────────────────────────
router.get("/goals/today", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, req.playerId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentActivities = await db.query.fitnessActivitiesTable.findMany({
    where: and(
      eq(fitnessActivitiesTable.playerId, req.playerId!),
      gte(fitnessActivitiesTable.createdAt, sevenDaysAgo)
    ),
    orderBy: [desc(fitnessActivitiesTable.createdAt)],
  });

  const base = BASE_GOALS[player.fitnessLevel ?? "beginner"] ?? BASE_GOALS.beginner;

  const avgDailySteps = recentActivities
    .filter(a => a.type === "steps")
    .reduce((s, a) => s + a.value, 0) / 7;

  const adaptiveSteps = avgDailySteps > 0
    ? Math.round(Math.min(base.steps * 1.3, Math.max(base.steps * 0.7, avgDailySteps * 1.05)))
    : base.steps;

  const activityDays = new Set(
    recentActivities.map(a => new Date(a.createdAt).toDateString())
  ).size;
  const adaptiveWorkouts = activityDays >= 5 ? base.workouts + 1 : base.workouts;

  const accessMode = player.accessibilityMode ?? "none";
  let lowImpactFirst = false;
  if (accessMode === "senior" || accessMode === "low_impact") {
    lowImpactFirst = true;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayActivities = recentActivities.filter(a => new Date(a.createdAt) >= todayStart);
  const todaySteps = todayActivities.filter(a => a.type === "steps").reduce((s, a) => s + a.value, 0);
  const todayWorkouts = new Set(
    todayActivities.filter(a => a.type !== "steps").map(a => new Date(a.createdAt).toDateString())
  ).size;

  const suggestedActivities = lowImpactFirst
    ? ["stretching", "mobility", "balance", "breathing", "seated_workout", "walking"]
    : ["steps", "running", "weightlifting", "yoga", "cycling"];

  const recoveryMessage = player.recoveryMessage ?? null;

  res.json({
    goals: {
      steps:       adaptiveSteps,
      workouts:    Math.min(adaptiveWorkouts, 7),
      durationMin: base.durationMin,
    },
    progress: {
      steps:    todaySteps,
      workouts: todayWorkouts,
      stepsPercent:    Math.min(100, Math.round((todaySteps / adaptiveSteps) * 100)),
      workoutsPercent: Math.min(100, Math.round((todayWorkouts / Math.min(adaptiveWorkouts, 7)) * 100)),
    },
    fitnessLevel:     player.fitnessLevel ?? "beginner",
    accessibilityMode: accessMode,
    identityPath:     player.identityPath ?? null,
    identityPathMeta: player.identityPath ? IDENTITY_PATHS[player.identityPath] : null,
    suggestedActivities,
    xpMultiplier:  base.xpMultiplier,
    streakAtRisk:  player.streakAtRisk,
    recoveryMessage,
    lowImpactFirst,
  });
});

// ── GET /identity-paths ───────────────────────────────────────────────────────
router.get("/identity-paths", async (_req, res) => {
  res.json(IDENTITY_PATHS);
});

// ── POST /streak/recover ──────────────────────────────────────────────────────
router.post("/streak/recover", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, req.playerId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  await db
    .update(playersTable)
    .set({ streakAtRisk: false, recoveryMessage: null })
    .where(eq(playersTable.id, req.playerId!));

  res.json({ acknowledged: true, streak: player.currentStreak, xp: player.xp });
});

// ── POST /family-groups ───────────────────────────────────────────────────────
router.post("/family-groups", requireAuth, attachPlayer, async (req, res) => {
  const { name, parentalPin } = req.body as { name?: string; parentalPin?: string };
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: "name is required (min 2 chars)" });
    return;
  }

  const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  const hashedPin  = parentalPin ? crypto.createHash("sha256").update(parentalPin).digest("hex") : null;

  const [group] = await db.insert(familyGroupsTable).values({
    name:       name.trim(),
    creatorId:  req.playerId!,
    parentalPin: hashedPin,
    inviteCode,
  }).returning();

  await db
    .update(playersTable)
    .set({ familyGroupId: group.id })
    .where(eq(playersTable.id, req.playerId!));

  const members = await db.query.playersTable.findMany({
    where: eq(playersTable.familyGroupId, group.id),
    columns: { id: true, username: true, displayName: true, avatarUrl: true, level: true, currentStreak: true, totalSteps: true },
  });

  res.status(201).json({
    ...group,
    createdAt: group.createdAt.toISOString(),
    parentalPin: undefined,
    members,
  });
});

// ── GET /family-groups/:id ────────────────────────────────────────────────────
router.get("/family-groups/:id", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const group = await db.query.familyGroupsTable.findFirst({
    where: eq(familyGroupsTable.id, id),
  });
  if (!group) { res.status(404).json({ error: "Family group not found" }); return; }

  const callerId = req.playerId!;
  const callerRow = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, callerId),
    columns: { familyGroupId: true },
  });
  const isMember  = callerRow?.familyGroupId === id;
  const isCreator = group.creatorId === callerId;
  if (!isMember && !isCreator) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const members = await db.query.playersTable.findMany({
    where: eq(playersTable.familyGroupId, id),
    columns: { id: true, username: true, displayName: true, avatarUrl: true, level: true, currentStreak: true, totalSteps: true, fitnessLevel: true, identityPath: true },
  });

  const memberIds = members.map(m => m.id);
  let weeklyActivityMap: Record<number, number> = {};
  for (const memberId of memberIds) {
    const acts = await db.query.fitnessActivitiesTable.findMany({
      where: and(
        eq(fitnessActivitiesTable.playerId, memberId),
        gte(fitnessActivitiesTable.createdAt, sevenDaysAgo)
      ),
    });
    weeklyActivityMap[memberId] = acts.filter(a => a.type === "steps").reduce((s, a) => s + a.value, 0);
  }

  const membersWithActivity = members.map(m => ({
    ...m,
    weeklySteps: weeklyActivityMap[m.id] ?? 0,
  })).sort((a, b) => b.weeklySteps - a.weeklySteps);

  res.json({
    id:         group.id,
    name:       group.name,
    creatorId:  group.creatorId,
    inviteCode: group.inviteCode,
    createdAt:  group.createdAt.toISOString(),
    members:    membersWithActivity,
    hasParentalPin: !!group.parentalPin,
  });
});

// ── POST /family-groups/join ──────────────────────────────────────────────────
router.post("/family-groups/join", requireAuth, attachPlayer, async (req, res) => {
  const { inviteCode, parentalPin } = req.body as { inviteCode?: string; parentalPin?: string };
  if (!inviteCode) {
    res.status(400).json({ error: "inviteCode is required" });
    return;
  }

  const group = await db.query.familyGroupsTable.findFirst({
    where: eq(familyGroupsTable.inviteCode, inviteCode.trim().toUpperCase()),
  });
  if (!group) { res.status(404).json({ error: "Invite code not found" }); return; }

  if (group.parentalPin) {
    if (!parentalPin) {
      res.status(403).json({ error: "This group requires a parental PIN" });
      return;
    }
    const hashed = crypto.createHash("sha256").update(parentalPin).digest("hex");
    if (hashed !== group.parentalPin) {
      res.status(403).json({ error: "Incorrect PIN" });
      return;
    }
  }

  await db
    .update(playersTable)
    .set({ familyGroupId: group.id })
    .where(eq(playersTable.id, req.playerId!));

  res.json({ joined: true, groupId: group.id, groupName: group.name });
});

// ── POST /family-groups/:id/leave ─────────────────────────────────────────────
router.post("/family-groups/:id/leave", requireAuth, attachPlayer, async (req, res) => {
  await db
    .update(playersTable)
    .set({ familyGroupId: null })
    .where(eq(playersTable.id, req.playerId!));

  res.json({ left: true });
});

export default router;
