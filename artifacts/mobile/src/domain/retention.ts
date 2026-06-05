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
      actionLabel: data.lastSyncedDate ? "Open Hatchery" : "Sync movement",
      complete: Boolean(data.lastSyncedDate),
      day: 1,
      label: "Move and sync",
      message: "Start the loop by turning today's movement into Egg progress.",
      target: data.lastSyncedDate ? "hatchery" : "sync",
    },
    {
      actionLabel: data.eggsHatched > 0 ? "View Pal" : "Open Hatchery",
      complete: data.eggsHatched > 0,
      day: 2,
      label: "Hatch first Pal",
      message: "Open your ready Egg and meet the Pal your movement powered.",
      target: data.eggsHatched > 0 ? "collection" : "hatchery",
    },
    {
      actionLabel: activePal ? "Train Pal" : "Open Collection",
      complete: Boolean(activePal && activePal.trainingSessions.length > 0),
      day: 3,
      label: "Train and name active Pal",
      message: "Make your Pal feel personal with a name, bond, and first training session.",
      target: "collection",
    },
    {
      actionLabel: getUnlockedBadgeCount(data, today) > 0 ? "View badges" : "Sync movement",
      complete: getUnlockedBadgeCount(data, today) > 0,
      day: 4,
      label: "Unlock reward or badge",
      message: "Let the profile remember what your movement and hatches achieved.",
      target: getUnlockedBadgeCount(data, today) > 0 ? "profile" : "sync",
    },
    {
      actionLabel: hasBonusEgg ? "Open Collection" : "Sync movement",
      complete: hasBonusEgg || data.collection.length >= 2,
      day: 5,
      label: "Grow collection",
      message: "Earn or hatch another Egg so your team starts becoming a collection.",
      target: hasBonusEgg ? "collection" : "sync",
    },
    {
      actionLabel: "Compare ranks",
      complete: data.leaderboardShareEnabled,
      day: 6,
      label: "Try optional Ranks",
      message: "Opt in only when you want weekly movement to become a friendly challenge.",
      target: "leaderboard",
    },
    {
      actionLabel: "Sync for reward",
      complete: activity.steps >= Math.max(data.weeklyGoalSteps, 1),
      day: 7,
      label: "Weekly recap",
      message: "Finish the weekly movement goal, claim the recap, and return tomorrow.",
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
