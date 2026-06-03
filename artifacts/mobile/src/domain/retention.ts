import { getActivitySummary } from "./history";
import type { HatchUpData } from "./models";

export interface RetentionPlan {
  label: string;
  message: string;
  progress: number;
  stepsRemaining: number;
  weeklyGoalSteps: number;
  weeklySteps: number;
}

export function getRetentionPlan(data: HatchUpData, today: string): RetentionPlan {
  const activity = getActivitySummary(data.activityHistory, today, 7);
  const weeklyGoalSteps = Math.max(data.weeklyGoalSteps, 1);
  const stepsRemaining = Math.max(weeklyGoalSteps - activity.steps, 0);
  const progress = Math.min(activity.steps / weeklyGoalSteps, 1);

  if (stepsRemaining === 0) {
    return {
      label: "Weekly goal complete",
      message: "Your eggs felt that. Keep moving to climb rankings or bank extra hatch progress.",
      progress,
      stepsRemaining,
      weeklyGoalSteps,
      weeklySteps: activity.steps,
    };
  }

  if (data.currentStreak === 0 && data.lastSyncedDate) {
    return {
      label: "Comeback window",
      message: `${stepsRemaining.toLocaleString()} steps left this week. One sync today restarts your momentum.`,
      progress,
      stepsRemaining,
      weeklyGoalSteps,
      weeklySteps: activity.steps,
    };
  }

  return {
    label: "Weekly hatch goal",
    message: `${stepsRemaining.toLocaleString()} steps left to hit your weekly movement target.`,
    progress,
    stepsRemaining,
    weeklyGoalSteps,
    weeklySteps: activity.steps,
  };
}
