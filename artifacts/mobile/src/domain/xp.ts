import type { DailyHealthSummary, DailyXp } from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  type ProgressionProfile,
} from "./progressionConfig";
import { getCompletedQuestCount } from "./quests";

export const XP_RULES = ACTIVE_PROGRESSION_PROFILE.xp;

interface CalculateDailyXpOptions {
  firstSyncOfDay?: boolean;
  profile?: ProgressionProfile;
}

export function calculateDailyXp(
  summary: DailyHealthSummary,
  options: CalculateDailyXpOptions = {},
): DailyXp {
  const profile = options.profile ?? ACTIVE_PROGRESSION_PROFILE;
  const rules = profile.xp;
  const steps = Math.min(
    Math.floor(summary.steps / rules.stepsPerXp),
    rules.stepsMax,
  );
  const activeCalories = Math.min(
    Math.floor(summary.activeCalories / rules.activeCaloriesPerXp),
    rules.activeCaloriesMax,
  );
  const workouts = Math.min(
    summary.workouts * rules.workoutXp,
    rules.workoutsMax,
  );
  const quests = getCompletedQuestCount(summary, profile) * rules.questXp;
  const firstSync = options.firstSyncOfDay ? rules.firstSyncXp : 0;

  return {
    steps,
    activeCalories,
    workouts,
    quests,
    firstSync,
    total: Math.min(
      steps + activeCalories + workouts + quests + firstSync,
      rules.dailyMax,
    ),
  };
}

export function mergeDailyXp(
  previous: DailyXp | null,
  latest: DailyXp,
): DailyXp {
  if (!previous) return latest;

  const steps = Math.max(previous.steps, latest.steps);
  const activeCalories = Math.max(
    previous.activeCalories,
    latest.activeCalories,
  );
  const workouts = Math.max(previous.workouts, latest.workouts);
  const quests = Math.max(previous.quests, latest.quests);
  const firstSync = Math.max(previous.firstSync, latest.firstSync);

  return {
    steps,
    activeCalories,
    workouts,
    quests,
    firstSync,
    total: Math.min(
      steps + activeCalories + workouts + quests + firstSync,
      XP_RULES.dailyMax,
    ),
  };
}

export function getXpGains(previous: DailyXp | null, latest: DailyXp): DailyXp {
  return {
    steps: Math.max(latest.steps - (previous?.steps ?? 0), 0),
    activeCalories: Math.max(
      latest.activeCalories - (previous?.activeCalories ?? 0),
      0,
    ),
    workouts: Math.max(latest.workouts - (previous?.workouts ?? 0), 0),
    quests: Math.max(latest.quests - (previous?.quests ?? 0), 0),
    firstSync: Math.max(latest.firstSync - (previous?.firstSync ?? 0), 0),
    total: Math.max(latest.total - (previous?.total ?? 0), 0),
  };
}
