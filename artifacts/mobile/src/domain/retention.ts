import { getActivitySummary } from "./history";
import type { HatchUpData } from "./models";
import { getUnlockedBadgeCount } from "./badges";

export interface RetentionPlan {
  label: string;
  message: string;
  progress: number;
  stepsRemaining: number;
  weeklyGoalSteps: number;
  weeklySteps: number;
}

export type FirstWeekTarget = "collection" | "hatchery" | "leaderboard" | "profile" | "sync";

export interface FirstWeekMission {
  actionLabel: string;
  complete: boolean;
  day: number;
  label: string;
  message: string;
  target: FirstWeekTarget;
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

export function getFirstWeekMissions(data: HatchUpData, today: string): FirstWeekMission[] {
  const activity = getActivitySummary(data.activityHistory, today, 7);
  const activePal = data.collection.find((item) => item.id === data.activeHatchlingId);
  const hasBonusEgg =
    data.milestoneEggsAwarded.length > 0 ||
    data.eventEggsAwarded.length > 0 ||
    data.activeEggs.length + data.pendingEggs.length > 1;

  return [
    {
      actionLabel: data.eggsHatched > 0 ? "View Pal" : "Open Hatchery",
      complete: data.eggsHatched > 0,
      day: 1,
      label: "Choose Egg, hatch first Pal",
      message: "Start the world by turning movement into your first hatch.",
      target: data.eggsHatched > 0 ? "collection" : "hatchery",
    },
    {
      actionLabel: activePal ? "Train Pal" : "Open Collection",
      complete: Boolean(activePal && activePal.trainingSessions.length > 0),
      day: 2,
      label: "Train and name your Pal",
      message: "Give your active Pal a little identity and its first training session.",
      target: "collection",
    },
    {
      actionLabel: "Sync movement",
      complete: hasBonusEgg,
      day: 3,
      label: "Earn a bonus Egg",
      message: "Keep moving to trigger the next random Egg drop.",
      target: "sync",
    },
    {
      actionLabel: "View badges",
      complete: getUnlockedBadgeCount(data, today) > 0,
      day: 4,
      label: "Unlock a badge",
      message: "Badges make the world remember what you did.",
      target: "profile",
    },
    {
      actionLabel: "Compare ranks",
      complete: data.leaderboardShareEnabled,
      day: 5,
      label: "Compare on leaderboard",
      message: "Opt in when you are ready to compare weekly movement.",
      target: "leaderboard",
    },
    {
      actionLabel: "Open Collection",
      complete: data.collection.length >= 3,
      day: 6,
      label: "Build a collection goal",
      message: "Collect three Pals so your team starts feeling real.",
      target: "collection",
    },
    {
      actionLabel: "Sync for reward",
      complete: activity.steps >= Math.max(data.weeklyGoalSteps, 1),
      day: 7,
      label: "Claim weekly reward",
      message: "Finish the weekly movement goal and close your first arc.",
      target: "sync",
    },
  ];
}

export function getCurrentFirstWeekMission(
  data: HatchUpData,
  today: string,
): FirstWeekMission {
  const missions = getFirstWeekMissions(data, today);
  return missions.find((mission) => !mission.complete) ?? missions[missions.length - 1];
}
