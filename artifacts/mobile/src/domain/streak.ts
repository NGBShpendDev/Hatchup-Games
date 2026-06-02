import { isYesterday } from "./date";

interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastRewardDate: string | null;
}

export function updateStreak(
  state: StreakState,
  rewardDate: string,
  awardedXp: number,
): StreakState {
  if (awardedXp <= 0 || state.lastRewardDate === rewardDate) return state;

  const currentStreak =
    state.lastRewardDate && isYesterday(state.lastRewardDate, rewardDate)
      ? state.currentStreak + 1
      : 1;

  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastRewardDate: rewardDate,
  };
}
