import { getActivitySummary } from "./history";
import { metersToMiles, stepsToMiles } from "./leaderboard";
import type { DailyAward, DailyHealthSummary, HatchUpData } from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  type ProgressionProfile,
} from "./progressionConfig";

export type QuestCadence = "daily" | "weekly" | "monthly";

export interface Quest {
  cadence: QuestCadence;
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  rewardXp: number;
}

export function getDailyQuests(
  award: DailyAward | null,
  profile = ACTIVE_PROGRESSION_PROFILE,
): Quest[] {
  const distanceMiles = getAwardDistanceMiles(award);

  return [
    {
      cadence: "daily",
      id: "steps",
      label: "Take a long walk",
      current: award?.health.steps ?? 0,
      target: profile.questTargets.steps,
      unit: "steps",
      rewardXp: profile.xp.questXp,
    },
    {
      cadence: "daily",
      id: "activeCalories",
      label: "Get moving",
      current: award?.health.activeCalories ?? 0,
      target: profile.questTargets.activeCalories,
      unit: "active cal",
      rewardXp: profile.xp.questXp,
    },
    {
      cadence: "daily",
      id: "workouts",
      label: "Complete a workout",
      current: award?.health.workouts ?? 0,
      target: profile.questTargets.workouts,
      unit: "workout",
      rewardXp: profile.xp.questXp,
    },
    {
      cadence: "daily",
      id: "distance",
      label: "Cover ground",
      current: distanceMiles,
      target: 1,
      unit: "mile",
      rewardXp: profile.xp.questXp,
    },
    {
      cadence: "daily",
      id: "firstSync",
      label: "Collect today's rewards",
      current: award ? 1 : 0,
      target: 1,
      unit: "sync",
      rewardXp: profile.xp.questXp,
    },
  ];
}

export function getWeeklyQuests(data: HatchUpData, today: string): Quest[] {
  const activity = getActivitySummary(data.activityHistory, today, 7);

  return [
    {
      cadence: "weekly",
      current: activity.steps,
      id: "weeklySteps",
      label: "Hit the weekly hatch goal",
      rewardXp: 0,
      target: data.weeklyGoalSteps,
      unit: "steps",
    },
    {
      cadence: "weekly",
      current: activity.activeDays,
      id: "weeklyActiveDays",
      label: "Move on three days",
      rewardXp: 0,
      target: 3,
      unit: "active days",
    },
    {
      cadence: "weekly",
      current: data.eggsHatched,
      id: "weeklyHatches",
      label: "Grow the collection",
      rewardXp: 0,
      target: 2,
      unit: "hatches",
    },
  ];
}

export function getMonthlyQuests(data: HatchUpData, today: string): Quest[] {
  const activity = getActivitySummary(data.activityHistory, today, 30);

  return [
    {
      cadence: "monthly",
      current: activity.steps,
      id: "monthlySteps",
      label: "Walk a launch-month journey",
      rewardXp: 0,
      target: data.weeklyGoalSteps * 4,
      unit: "steps",
    },
    {
      cadence: "monthly",
      current: data.collection.length,
      id: "monthlyCollection",
      label: "Build your Pal team",
      rewardXp: 0,
      target: 6,
      unit: "Pals",
    },
    {
      cadence: "monthly",
      current: data.longestStreak,
      id: "monthlyStreak",
      label: "Reach a seven-day streak",
      rewardXp: 0,
      target: 7,
      unit: "days",
    },
  ];
}

export function getCompletedQuestCount(
  summary: DailyHealthSummary,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
) {
  return getDailyQuests(
    {
      date: summary.date,
      health: summary,
      xp: {
        steps: 0,
        activeCalories: 0,
        workouts: 0,
        quests: 0,
        firstSync: 0,
        total: 0,
      },
    },
    profile,
  )
    .filter((quest) => quest.cadence === "daily")
    .filter(isQuestComplete).length;
}

export function getQuestProgress(quest: Quest) {
  return Math.min(quest.current / quest.target, 1);
}

export function isQuestComplete(quest: Quest) {
  return quest.current >= quest.target;
}

function getAwardDistanceMiles(award: DailyAward | null) {
  if (!award) return 0;
  if ((award.health.distanceMeters ?? 0) > 0) {
    return metersToMiles(award.health.distanceMeters ?? 0);
  }
  return stepsToMiles(award.health.steps);
}
