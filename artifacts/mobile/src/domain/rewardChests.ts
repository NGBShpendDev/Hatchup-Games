import { getActivitySummary } from "./history";
import type { HatchUpData } from "./models";
import { ECONOMY_BALANCE } from "./economy";

export interface RewardChest {
  canClaim: boolean;
  claimed: boolean;
  key: string;
  label: string;
  progress: number;
  rewardAccountXp: number;
  rewardCoins: number;
  rewardEggSteps: number;
  steps: number;
  target: number;
}

export function getWeeklyRewardChest(
  data: HatchUpData,
  today: string,
): RewardChest {
  const activity = getActivitySummary(data.activityHistory, today, 7);
  const target = Math.max(data.weeklyGoalSteps, 1);
  const key = getWeeklyChestKey(today);
  const claimed = data.claimedRewardChests.includes(key);

  return {
    canClaim: activity.steps >= target && !claimed,
    claimed,
    key,
    label: ECONOMY_BALANCE.weeklyChest.label,
    progress: Math.min(activity.steps / target, 1),
    rewardAccountXp: ECONOMY_BALANCE.weeklyChest.accountXp,
    rewardCoins: ECONOMY_BALANCE.weeklyChest.coins,
    rewardEggSteps: ECONOMY_BALANCE.weeklyChest.eggSteps,
    steps: activity.steps,
    target,
  };
}

function getWeeklyChestKey(today: string) {
  const date = new Date(`${today}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return `weekly-chest-${date.toISOString().slice(0, 10)}`;
}
