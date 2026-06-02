import type { DailyAward } from "./models";

export interface DailyQuest {
  id: "steps" | "activeCalories" | "workouts";
  label: string;
  current: number;
  target: number;
  unit: string;
}

export function getDailyQuests(award: DailyAward | null): DailyQuest[] {
  return [
    {
      id: "steps",
      label: "Take a long walk",
      current: award?.health.steps ?? 0,
      target: 10000,
      unit: "steps",
    },
    {
      id: "activeCalories",
      label: "Get moving",
      current: award?.health.activeCalories ?? 0,
      target: 500,
      unit: "active cal",
    },
    {
      id: "workouts",
      label: "Complete a workout",
      current: award?.health.workouts ?? 0,
      target: 1,
      unit: "workout",
    },
  ];
}

export function getQuestProgress(quest: DailyQuest) {
  return Math.min(quest.current / quest.target, 1);
}

export function isQuestComplete(quest: DailyQuest) {
  return quest.current >= quest.target;
}
