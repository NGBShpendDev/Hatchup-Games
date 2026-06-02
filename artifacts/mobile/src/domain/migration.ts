import {
  initialHatchUpData,
  type DailyAward,
  type DailyXp,
  type HatchUpData,
  type IncubatorEgg,
} from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
} from "./progressionConfig";

export const DATA_SCHEMA_VERSION = 2;

function normalizeXp(xp: Partial<DailyXp> | undefined): DailyXp {
  return {
    steps: xp?.steps ?? 0,
    activeCalories: xp?.activeCalories ?? 0,
    workouts: xp?.workouts ?? 0,
    quests: xp?.quests ?? 0,
    firstSync: xp?.firstSync ?? 0,
    total: xp?.total ?? 0,
  };
}

function normalizeAward(award: DailyAward): DailyAward {
  return {
    ...award,
    xp: normalizeXp(award.xp),
  };
}

function normalizeEgg(egg: IncubatorEgg | undefined): IncubatorEgg {
  const next = { ...initialHatchUpData.activeEgg, ...egg };
  const stepsRequired = getEggStepsRequired(next.rarity);

  return {
    ...next,
    stepsRequired,
    stepsWalked: Math.min(Math.max(next.stepsWalked, 0), stepsRequired),
  };
}

export function migrateHatchUpData(
  stored: Partial<HatchUpData> | null | undefined,
): HatchUpData {
  if (!stored) return initialHatchUpData;

  return {
    ...initialHatchUpData,
    ...stored,
    schemaVersion: DATA_SCHEMA_VERSION,
    progressionProfile: ACTIVE_PROGRESSION_PROFILE.id,
    activeEgg: normalizeEgg(stored.activeEgg),
    dailyAward: stored.dailyAward ? normalizeAward(stored.dailyAward) : null,
    activityHistory: (stored.activityHistory ?? []).map(normalizeAward),
    collection: stored.collection ?? [],
  };
}
