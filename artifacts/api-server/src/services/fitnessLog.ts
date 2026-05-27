import { db } from "@workspace/db";
import {
  fitnessActivitiesTable,
  fitnessQuestsTable,
  playersTable,
  eggsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const ACTIVITY_CONFIG: Record<
  string,
  { unit: string; xpPer: number; realm: string; stepsEquiv: number }
> = {
  steps:         { unit: "steps",   xpPer: 0.05, realm: "cardio",   stepsEquiv: 1 },
  running:       { unit: "minutes", xpPer: 8,    realm: "cardio",   stepsEquiv: 150 },
  walking:       { unit: "minutes", xpPer: 4,    realm: "cardio",   stepsEquiv: 100 },
  cycling:       { unit: "minutes", xpPer: 6,    realm: "cardio",   stepsEquiv: 80 },
  weightlifting: { unit: "minutes", xpPer: 7,    realm: "strength", stepsEquiv: 60 },
  hiit:          { unit: "minutes", xpPer: 10,   realm: "beast",    stepsEquiv: 200 },
  yoga:          { unit: "minutes", xpPer: 4,    realm: "balance",  stepsEquiv: 40 },
  meditation:    { unit: "minutes", xpPer: 3,    realm: "balance",  stepsEquiv: 30 },
  sleep:         { unit: "hours",   xpPer: 15,   realm: "balance",  stepsEquiv: 200 },
  hydration:     { unit: "cups",    xpPer: 5,    realm: "balance",  stepsEquiv: 25 },
  stretching:    { unit: "minutes", xpPer: 3,    realm: "balance",  stepsEquiv: 30 },
  swimming:      { unit: "minutes", xpPer: 7,    realm: "beast",    stepsEquiv: 120 },
  active_minutes: { unit: "minutes", xpPer: 3,   realm: "cardio",   stepsEquiv: 80 },
  calories:      { unit: "kcal",   xpPer: 0.01, realm: "cardio",   stepsEquiv: 0.1 },
};

export type LogActivityParams = {
  playerId: number;
  type: string;
  value: number;
  note?: string | null;
  externalId?: string | null;
  isPassiveSync?: boolean;
};

export type LogActivityResult = {
  fitnessXpEarned: number;
  eggsUpdated: number;
  isNew: boolean;
  updatedPlayer: typeof playersTable.$inferSelect;
  activity: typeof fitnessActivitiesTable.$inferSelect | null;
};

export async function logFitnessActivity(
  params: LogActivityParams,
): Promise<LogActivityResult> {
  const { playerId, type, value, note, externalId, isPassiveSync } = params;

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
  const fitnessXpEarned = Math.round(value * config.xpPer);
  const stepsEquiv = Math.round(value * config.stepsEquiv);

  const insertedRows = await db.insert(fitnessActivitiesTable).values({
    playerId,
    type,
    value,
    unit: config.unit,
    fitnessXpEarned,
    realm: config.realm,
    note: note ?? null,
    externalId: externalId ?? null,
  }).returning();

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

  const isWorkout = type !== "steps" && type !== "hydration" && type !== "sleep" && type !== "calories" && type !== "active_minutes";

  const updateFields: Partial<typeof playersTable.$inferInsert> & Record<string, unknown> = {
    fitnessXp: player.fitnessXp + fitnessXpEarned,
    totalSteps: player.totalSteps + stepsEquiv,
    totalWorkouts: isWorkout ? player.totalWorkouts + 1 : player.totalWorkouts,
    currentStreak: newStreak,
    longestStreak: Math.max(player.longestStreak ?? 0, newStreak),
    waterCups: type === "hydration" ? player.waterCups + value : player.waterCups,
    lastActiveDate: today,
  };

  if (isPassiveSync) {
    updateFields.passiveXpSinceLastVisit = (player.passiveXpSinceLastVisit ?? 0) + fitnessXpEarned;
  }

  const updatedRows = await db.update(playersTable)
    .set(updateFields)
    .where(eq(playersTable.id, playerId))
    .returning();

  let eggsUpdated = 0;
  if (stepsEquiv > 0) {
    const activeEggs = await db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, playerId), eq(eggsTable.isHatched, false)),
    });
    for (const egg of activeEggs) {
      const newProgress = Math.min(egg.stepsRequired, egg.stepsProgress + stepsEquiv);
      await db.update(eggsTable)
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
    await db.update(fitnessQuestsTable)
      .set({ currentValue: newValue, isCompleted: newValue >= quest.targetValue })
      .where(eq(fitnessQuestsTable.id, quest.id));
  }

  return { fitnessXpEarned, eggsUpdated, isNew: true, updatedPlayer: updatedRows[0]!, activity: insertedRows[0]! };
}
