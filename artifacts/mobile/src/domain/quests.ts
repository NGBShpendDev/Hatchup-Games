import type { DailyAward, DailyHealthSummary } from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  type ProgressionProfile,
} from "./progressionConfig";

export interface DailyQuest {
  id: "steps" | "activeCalories" | "workouts";
  label: string;
  current: number;
  target: number;
  unit: string;
  rewardXp: number;
}

export function getDailyQuests(
  award: DailyAward | null,
  profile = ACTIVE_PROGRESSION_PROFILE,
): DailyQuest[] {
  return [
    {
      id: "steps",
      label: "Take a long walk",
      current: award?.health.steps ?? 0,
      target: profile.questTargets.steps,
      unit: "steps",
      rewardXp: profile.xp.questXp,
    },
    {
      id: "activeCalories",
      label: "Get moving",
      current: award?.health.activeCalories ?? 0,
      target: profile.questTargets.activeCalories,
      unit: "active cal",
      rewardXp: profile.xp.questXp,
    },
    {
      id: "workouts",
      label: "Complete a workout",
      current: award?.health.workouts ?? 0,
      target: profile.questTargets.workouts,
      unit: "workout",
      rewardXp: profile.xp.questXp,
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
  ).filter(isQuestComplete).length;
}

export function getQuestProgress(quest: DailyQuest) {
  return Math.min(quest.current / quest.target, 1);
}

export function isQuestComplete(quest: DailyQuest) {
  return quest.current >= quest.target;
}
