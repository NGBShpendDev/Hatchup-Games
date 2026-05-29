import { db } from "@workspace/db";
import {
  fitnessActivitiesTable,
  fitnessQuestsTable,
  playersTable,
  hatchlingsTable,
  eggsTable,
  personalRecordsTable,
} from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { checkAndAwardBadges, type BadgeDefinition } from "./badgeService.ts";
import { awardFitnessBarXp, checkAndAwardArtifacts } from "./artifactService.ts";
import { applyHatchlingXp, getActivePalId, type HatchlingXpResult } from "./hatchlingXp.ts";
import { resolveActivePartner } from "./activePartner.ts";
import { logger } from "../lib/logger.ts";

export const STRENGTH_TYPES = new Set(["pushups", "burpees", "squats", "pullups", "planks", "situps"]);

export const ACTIVITY_CONFIG: Record<
  string,
  { unit: string; xpPer: number; realm: string; stepsEquiv: number }
> = {
  steps:          { unit: "steps",   xpPer: 0.05, realm: "cardio",   stepsEquiv: 1 },
  running:        { unit: "minutes", xpPer: 8,    realm: "cardio",   stepsEquiv: 150 },
  walking:        { unit: "minutes", xpPer: 4,    realm: "cardio",   stepsEquiv: 100 },
  cycling:        { unit: "minutes", xpPer: 6,    realm: "cardio",   stepsEquiv: 80 },
  weightlifting:  { unit: "minutes", xpPer: 7,    realm: "strength", stepsEquiv: 60 },
  hiit:           { unit: "minutes", xpPer: 10,   realm: "beast",    stepsEquiv: 200 },
  yoga:           { unit: "minutes", xpPer: 4,    realm: "balance",  stepsEquiv: 40 },
  meditation:     { unit: "minutes", xpPer: 3,    realm: "balance",  stepsEquiv: 30 },
  sleep:          { unit: "hours",   xpPer: 15,   realm: "balance",  stepsEquiv: 200 },
  hydration:      { unit: "cups",    xpPer: 5,    realm: "balance",  stepsEquiv: 25 },
  stretching:     { unit: "minutes", xpPer: 3,    realm: "balance",  stepsEquiv: 30 },
  swimming:       { unit: "minutes", xpPer: 7,    realm: "beast",    stepsEquiv: 120 },
  active_minutes: { unit: "minutes", xpPer: 3,    realm: "cardio",   stepsEquiv: 80 },
  calories:       { unit: "kcal",    xpPer: 0.01, realm: "cardio",   stepsEquiv: 0.1 },
  // Strength rep challenges — 1 rep = 1 XP
  pushups:        { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 2 },
  burpees:        { unit: "reps",    xpPer: 1,    realm: "beast",    stepsEquiv: 5 },
  squats:         { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 2 },
  pullups:        { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 3 },
  planks:            { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 1 },
  situps:            { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 2 },
  lunges:            { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 2 },
  jumping_jacks:     { unit: "reps",    xpPer: 0.5,  realm: "cardio",   stepsEquiv: 3 },
  mountain_climbers: { unit: "reps",    xpPer: 1,    realm: "beast",    stepsEquiv: 4 },
  dips:              { unit: "reps",    xpPer: 1,    realm: "strength", stepsEquiv: 2 },
};

// Approximate miles per minute for running (avg 10 min/mile pace → 0.1 mi/min)
const RUNNING_MILES_PER_MINUTE = 0.1;
// Approximate miles per minute for cycling (avg ~15 mph → 0.25 mi/min)
const CYCLING_MILES_PER_MINUTE = 0.25;

export type LogActivityParams = {
  playerId: number;
  type: string;
  value: number;
  note?: string | null;
  externalId?: string | null;
  isPassiveSync?: boolean;
  distanceMiles?: number | null;
  verificationLevel?: string | null;
};

/** XP and egg-progress multiplier per verification level.
 *  bronze = manual tracking (1×), silver = voice (1.5×),
 *  gold = smartwatch (2×), diamond = AI camera (3×). */
export const VERIFICATION_MULTIPLIER: Record<string, number> = {
  bronze: 1.0,
  silver: 1.5,
  gold:   2.0,
  diamond: 3.0,
};

export type PrResult = {
  activityType: string;
  metric: string;
  value: number;
  isNew: boolean;
};

export type LogActivityResult = {
  fitnessXpEarned: number;
  eggsUpdated: number;
  isNew: boolean;
  updatedPlayer: typeof playersTable.$inferSelect;
  activity: typeof fitnessActivitiesTable.$inferSelect | null;
  newBadges?: BadgeDefinition[];
  prResult?: PrResult;
  newArtifacts?: Array<{ id: number; name: string; rarity: string; lore: string; imageSlug: string }>;
  palXpResult?: HatchlingXpResult | null;
  verificationLevel?: string | null;
  xpMultiplier?: number;
};

/** Upsert a personal record. Returns whether it is a new/improved PR. */
async function detectAndSavePr(
  playerId: number,
  activityType: string,
  metric: string,
  value: number,
  higherIsBetter: boolean,
): Promise<PrResult> {
  const existing = await db.query.personalRecordsTable.findFirst({
    where: and(
      eq(personalRecordsTable.playerId, playerId),
      eq(personalRecordsTable.activityType, activityType),
      eq(personalRecordsTable.metric, metric),
    ),
  });

  const isNew = !existing || (higherIsBetter ? value > existing.value : value < existing.value);

  if (isNew) {
    await db
      .insert(personalRecordsTable)
      .values({ playerId, activityType, metric, value })
      .onConflictDoUpdate({
        target: [
          personalRecordsTable.playerId,
          personalRecordsTable.activityType,
          personalRecordsTable.metric,
        ],
        set: { value, achievedAt: new Date() },
      });
  }

  return { activityType, metric, value, isNew };
}

/** Compute cumulative running miles for a player from all activity logs.
 *  Prefers persisted distance_miles when provided; falls back to a minute
 *  proxy only for legacy rows that pre-date the distance column. */
async function getCumulativeRunMiles(playerId: number): Promise<number> {
  const rows = await db.query.fitnessActivitiesTable.findMany({
    where: and(
      eq(fitnessActivitiesTable.playerId, playerId),
      eq(fitnessActivitiesTable.type, "running"),
    ),
  });
  return rows.reduce(
    (s, r) => s + (r.distanceMiles ?? r.value * RUNNING_MILES_PER_MINUTE),
    0,
  );
}

/** Compute monthly running miles for a player (current calendar month).
 *  Same fallback semantics as getCumulativeRunMiles. */
async function getMonthlyRunMiles(playerId: number): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const rows = await db.query.fitnessActivitiesTable.findMany({
    where: and(
      eq(fitnessActivitiesTable.playerId, playerId),
      eq(fitnessActivitiesTable.type, "running"),
      gte(fitnessActivitiesTable.createdAt, monthStart),
    ),
  });
  return rows.reduce(
    (s, r) => s + (r.distanceMiles ?? r.value * RUNNING_MILES_PER_MINUTE),
    0,
  );
}

export async function logFitnessActivity(
  params: LogActivityParams,
): Promise<LogActivityResult> {
  const { playerId, type, value, note, externalId, isPassiveSync, distanceMiles, verificationLevel } = params;

  if (externalId) {
    const existing = await db.query.fitnessActivitiesTable.findFirst({
      where: and(
        eq(fitnessActivitiesTable.playerId, playerId),
        eq(fitnessActivitiesTable.externalId, externalId),
      ),
    });
    if (existing) {
      const player = await db.query.playersTable.findFirst({
        where: eq(playersTable.id, playerId),
      });
      return {
        fitnessXpEarned: 0,
        eggsUpdated: 0,
        isNew: false,
        updatedPlayer: player!,
        activity: existing,
      };
    }
  }

  const config = ACTIVITY_CONFIG[type] ?? { unit: "reps", xpPer: 1, realm: "strength", stepsEquiv: 0 };
  const xpMultiplier = VERIFICATION_MULTIPLIER[verificationLevel ?? ""] ?? 1.0;
  const fitnessXpEarned = Math.round(value * config.xpPer * xpMultiplier);
  const stepsEquiv = Math.round(value * config.stepsEquiv * xpMultiplier);
  const isStrength = STRENGTH_TYPES.has(type);

  const insertedRows = await db
    .insert(fitnessActivitiesTable)
    .values({
      playerId,
      type,
      value,
      unit: config.unit,
      fitnessXpEarned,
      realm: config.realm,
      note: note ?? null,
      externalId: externalId ?? null,
      distanceMiles: distanceMiles ?? null,
    })
    .returning();

  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
  });
  if (!player) throw new Error(`Player ${playerId} not found`);

  const today = new Date().toISOString().split("T")[0];
  const lastActive = player.lastActiveDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = player.currentStreak;
  if (lastActive !== today) {
    newStreak = lastActive === yesterdayStr ? player.currentStreak + 1 : 1;
  }

  const isWorkout =
    type !== "steps" &&
    type !== "hydration" &&
    type !== "sleep" &&
    type !== "calories" &&
    type !== "active_minutes";

  const updateFields: Partial<typeof playersTable.$inferInsert> & Record<string, unknown> = {
    fitnessXp: player.fitnessXp + fitnessXpEarned,
    totalSteps: player.totalSteps + stepsEquiv,
    totalWorkouts: isWorkout ? player.totalWorkouts + 1 : player.totalWorkouts,
    currentStreak: newStreak,
    longestStreak: Math.max(player.longestStreak ?? 0, newStreak),
    waterCups: type === "hydration" ? player.waterCups + value : player.waterCups,
    lastActiveDate: today,
  };

  // Update per-exercise lifetime counts for strength activities
  if (isStrength) {
    updateFields.totalReps = (player.totalReps ?? 0) + value;
    if (type === "pushups") updateFields.lifetimePushups = (player.lifetimePushups ?? 0) + value;
    if (type === "squats")  updateFields.lifetimeSquats  = (player.lifetimeSquats  ?? 0) + value;
    if (type === "burpees") updateFields.lifetimeBurpees = (player.lifetimeBurpees ?? 0) + value;
    if (type === "pullups") updateFields.lifetimePullups = (player.lifetimePullups ?? 0) + value;
    if (type === "planks")  updateFields.lifetimePlanks  = (player.lifetimePlanks  ?? 0) + value;
    if (type === "situps")  updateFields.lifetimeSitups  = (player.lifetimeSitups  ?? 0) + value;
  }

  if (isPassiveSync) {
    updateFields.passiveXpSinceLastVisit = (player.passiveXpSinceLastVisit ?? 0) + fitnessXpEarned;
  }

  const updatedRows = await db
    .update(playersTable)
    .set(updateFields)
    .where(eq(playersTable.id, playerId))
    .returning();

  // ── Active partner stat bump ─────────────────────────────────────────────
  // Happiness, energy, friendship, mood, and lastWorkoutAt flow to the active
  // partner on every workout/strength activity. XP and level advancement are
  // handled separately below via applyHatchlingXp so we don't double-count.
  if (isWorkout || isStrength) {
    const partner = await resolveActivePartner(playerId);
    if (partner) {
      const newHappiness   = Math.min(100, partner.happiness + 2);
      const newEnergy      = Math.max(0,   partner.energy    - 1);
      const newFriendship  = Math.min(100, partner.friendshipLevel + 5);
      const newLoyalty     = Math.min(100, (partner.loyaltyScore ?? 50) + 2);
      const newMotivation  = Math.min(100, (partner.motivationScore ?? 50) + 8);
      await db.update(hatchlingsTable).set({
        happiness: newHappiness,
        energy: newEnergy,
        friendshipLevel: newFriendship,
        moodState: "celebrating",
        lastWorkoutAt: new Date(),
        loyaltyScore: newLoyalty,
        motivationScore: newMotivation,
      }).where(eq(hatchlingsTable.id, partner.id));
    }
  }

  let eggsUpdated = 0;
  if (stepsEquiv > 0) {
    const activeEggs = await db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, playerId), eq(eggsTable.isHatched, false)),
    });
    for (const egg of activeEggs) {
      const newProgress = Math.min(egg.stepsRequired, egg.stepsProgress + stepsEquiv);
      await db
        .update(eggsTable)
        .set({ stepsProgress: newProgress })
        .where(eq(eggsTable.id, egg.id));
      eggsUpdated++;
    }
  }

  const activeQuests = await db.query.fitnessQuestsTable.findMany({
    where: and(
      eq(fitnessQuestsTable.playerId, playerId),
      eq(fitnessQuestsTable.isCompleted, false),
      eq(fitnessQuestsTable.type, type),
    ),
  });
  for (const quest of activeQuests) {
    const newValue = Math.min(quest.targetValue, quest.currentValue + value);
    await db
      .update(fitnessQuestsTable)
      .set({ currentValue: newValue, isCompleted: newValue >= quest.targetValue })
      .where(eq(fitnessQuestsTable.id, quest.id));
  }

  // --- PR Detection ---
  const updatedPlayer = updatedRows[0]!;
  let prResult: PrResult | undefined;

  if (isStrength) {
    // Track best reps in a single session per exercise
    prResult = await detectAndSavePr(playerId, type, "reps", value, true);
  } else if (type === "running" && distanceMiles && distanceMiles > 0 && value > 0) {
    // Pace PR in seconds per mile (lower = faster = better PR)
    // Guard: value (minutes) must be positive — otherwise division produces Infinity.
    const paceSecondsPerMile = Math.round((value * 60) / distanceMiles);
    const pacePr = await detectAndSavePr(playerId, "running", "pace_seconds_per_mile", paceSecondsPerMile, false);
    // Longest single-run distance PR (stored as miles × 100 for integer precision)
    const distanceX100 = Math.round(distanceMiles * 100);
    const distPr = await detectAndSavePr(playerId, "running", "longest_distance_miles_x100", distanceX100, true);
    // Prefer surfacing whichever PR was newly set
    prResult = distPr.isNew ? distPr : pacePr;
  } else if (type === "cycling" && distanceMiles && distanceMiles > 0 && value > 0) {
    // Speed PR in mph × 10 (higher = faster = better PR)
    // Guard: value (minutes) must be positive — otherwise division produces Infinity
    // which would fail the integer column write on personal_records.value.
    const speedMphX10 = Math.round((distanceMiles / value) * 60 * 10);
    prResult = await detectAndSavePr(playerId, "cycling", "speed_mph_x10", speedMphX10, true);
  }

  // Compute cumulative and monthly running miles for badge checks
  let cumulativeRunMiles: number | undefined;
  let monthlyRunMiles: number | undefined;
  let paceSecsPerMile: number | undefined;
  if (type === "running") {
    cumulativeRunMiles = await getCumulativeRunMiles(playerId);
    monthlyRunMiles = await getMonthlyRunMiles(playerId);
    // Only award pace badges when actual distance was provided
    if (distanceMiles && distanceMiles > 0) {
      paceSecsPerMile = Math.round((value * 60) / distanceMiles);
    }
  }

  // Check and award badges
  const activityHour = new Date().getHours();
  const newBadges = await checkAndAwardBadges(playerId, {
    totalSteps: updatedPlayer.totalSteps,
    currentStreak: updatedPlayer.currentStreak,
    totalWorkouts: updatedPlayer.totalWorkouts,
    activityHour,
    totalReps: updatedPlayer.totalReps ?? 0,
    lifetimePushups: updatedPlayer.lifetimePushups ?? 0,
    lifetimeSquats: updatedPlayer.lifetimeSquats ?? 0,
    sessionReps: isStrength ? value : 0,
    activityType: type,
    cumulativeRunMiles,
    monthlyRunMiles,
    paceSecsPerMile,
  });

  // Award fitness bar XP and check artifact milestones
  await awardFitnessBarXp(playerId, type, value).catch(err => {
    logger.error({ err, playerId, type, value }, "awardFitnessBarXp failed");
  });
  const newArtifacts = await checkAndAwardArtifacts(playerId, updatedPlayer.username).catch(err => {
    logger.error({ err, playerId }, "checkAndAwardArtifacts failed");
    return [];
  });

  // Flow fitness XP into the active Pal so level-ups can cross evolution
  // thresholds (5 and 15) and surface the share prompt on the next refetch.
  let palXpResult: HatchlingXpResult | null = null;
  if (fitnessXpEarned > 0) {
    const palId = await getActivePalId(playerId).catch(() => null);
    if (palId) {
      palXpResult = await applyHatchlingXp(palId, fitnessXpEarned).catch(err => {
        logger.error({ err, playerId, palId }, "applyHatchlingXp (fitness) failed");
        return null;
      });
    }
  }

  return {
    fitnessXpEarned,
    eggsUpdated,
    isNew: true,
    updatedPlayer,
    activity: insertedRows[0]!,
    newBadges,
    prResult,
    newArtifacts: newArtifacts.map(a => ({ id: a.id, name: a.name, rarity: a.rarity, lore: a.lore, imageSlug: a.imageSlug })),
    palXpResult,
    verificationLevel: verificationLevel ?? null,
    xpMultiplier,
  };
}
