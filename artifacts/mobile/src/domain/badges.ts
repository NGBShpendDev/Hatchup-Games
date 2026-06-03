import { getActivitySummary } from "./history";
import type { HatchUpData } from "./models";

export interface Badge {
  description: string;
  id: string;
  label: string;
  progress: number;
  target: number;
  unlocked: boolean;
  value: number;
}

export function getBadges(data: HatchUpData, today: string): Badge[] {
  const weekly = getActivitySummary(data.activityHistory, today, 7);
  const rareHatchlings = data.collection.filter(
    (item) => item.rarity === "rare" || item.rarity === "epic",
  ).length;

  return [
    badge("first-hatch", "First Hatch", "Hatch your first companion.", data.eggsHatched, 1),
    badge("egg-team", "Tiny Team", "Collect three hatchlings.", data.collection.length, 3),
    badge("rare-find", "Rare Finder", "Hatch a rare or epic companion.", rareHatchlings, 1),
    badge("streak-3", "Three-Day Spark", "Keep a three-day sync streak.", data.longestStreak, 3),
    badge("streak-7", "Weekly Ritual", "Keep a seven-day sync streak.", data.longestStreak, 7),
    badge("xp-500", "Monster Trainer", "Earn 500 total XP.", data.totalXp, 500),
    badge("xp-1500", "Final Form", "Reach 1,500 total XP.", data.totalXp, 1500),
    badge("weekly-goal", "Weekly Mover", "Hit your weekly step goal.", weekly.steps, data.weeklyGoalSteps),
  ];
}

export function getUnlockedBadgeCount(data: HatchUpData, today: string) {
  return getBadges(data, today).filter((badgeItem) => badgeItem.unlocked).length;
}

function badge(
  id: string,
  label: string,
  description: string,
  value: number,
  target: number,
): Badge {
  const safeTarget = Math.max(target, 1);
  return {
    description,
    id,
    label,
    progress: Math.min(value / safeTarget, 1),
    target: safeTarget,
    unlocked: value >= safeTarget,
    value,
  };
}
