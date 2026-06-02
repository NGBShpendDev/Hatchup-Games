import type { DailyHealthSummary, DailyXp } from "./models";

export const XP_RULES = {
  stepsPerXp: 250,
  stepsMax: 40,
  activeCaloriesPerXp: 25,
  activeCaloriesMax: 20,
  workoutXp: 20,
  workoutsMax: 40,
  dailyMax: 100,
} as const;

export function calculateDailyXp(summary: DailyHealthSummary): DailyXp {
  const steps = Math.min(
    Math.floor(summary.steps / XP_RULES.stepsPerXp),
    XP_RULES.stepsMax,
  );
  const activeCalories = Math.min(
    Math.floor(summary.activeCalories / XP_RULES.activeCaloriesPerXp),
    XP_RULES.activeCaloriesMax,
  );
  const workouts = Math.min(
    summary.workouts * XP_RULES.workoutXp,
    XP_RULES.workoutsMax,
  );

  return {
    steps,
    activeCalories,
    workouts,
    total: Math.min(steps + activeCalories + workouts, XP_RULES.dailyMax),
  };
}

export function mergeDailyXp(previous: DailyXp | null, latest: DailyXp): DailyXp {
  if (!previous) return latest;

  const steps = Math.max(previous.steps, latest.steps);
  const activeCalories = Math.max(previous.activeCalories, latest.activeCalories);
  const workouts = Math.max(previous.workouts, latest.workouts);

  return {
    steps,
    activeCalories,
    workouts,
    total: Math.min(steps + activeCalories + workouts, XP_RULES.dailyMax),
  };
}
