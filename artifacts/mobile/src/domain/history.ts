import { dateKeyToLocalDate, shiftDateKey } from "./date";
import type { DailyAward } from "./models";

export const MAX_ACTIVITY_HISTORY_DAYS = 14;

export interface ActivityDay {
  date: string;
  dayLabel: string;
  award: DailyAward | null;
}

export interface ActivitySummary {
  days: ActivityDay[];
  activeDays: number;
  steps: number;
  xp: number;
}

export function upsertDailyAward(
  history: DailyAward[],
  award: DailyAward,
): DailyAward[] {
  return [
    award,
    ...history.filter((item) => item.date !== award.date),
  ]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, MAX_ACTIVITY_HISTORY_DAYS);
}

export function getActivitySummary(
  history: DailyAward[],
  today: string,
  dayCount = 7,
): ActivitySummary {
  const byDate = new Map(history.map((award) => [award.date, award]));
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = shiftDateKey(today, index - dayCount + 1);

    return {
      date,
      dayLabel: dateKeyToLocalDate(date)
        .toLocaleDateString([], { weekday: "narrow" }),
      award: byDate.get(date) ?? null,
    };
  });

  return {
    days,
    activeDays: days.filter((day) => (day.award?.xp.total ?? 0) > 0).length,
    steps: days.reduce((total, day) => total + (day.award?.health.steps ?? 0), 0),
    xp: days.reduce((total, day) => total + (day.award?.xp.total ?? 0), 0),
  };
}
