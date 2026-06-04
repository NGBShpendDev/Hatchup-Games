import { getActivitySummary } from "./history";
import type { HatchUpData } from "./models";

export type BadgeCategory =
  | "collection"
  | "movement"
  | "bond"
  | "training"
  | "rarity"
  | "streak"
  | "xp";

export interface Badge {
  category: BadgeCategory;
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
  const monthly = getActivitySummary(data.activityHistory, today, 30);
  const rareHatchlings = data.collection.filter(
    (item) => item.rarity === "rare" || item.rarity === "epic",
  ).length;
  const epicHatchlings = data.collection.filter((item) => item.rarity === "epic").length;
  const uniqueElements = new Set(data.collection.map((item) => item.element)).size;
  const highestPalLevel = data.collection.reduce(
    (highest, item) => Math.max(highest, item.level),
    0,
  );
  const highestBond = data.collection.reduce(
    (highest, item) => Math.max(highest, item.bond),
    0,
  );
  const trainingSessions = data.collection.reduce(
    (total, item) => total + item.trainingSessions.length,
    0,
  );

  return [
    badge("first-hatch", "First Hatch", "Hatch your first Pal.", data.eggsHatched, 1),
    badge("hatch-5", "Hatch Crew", "Hatch five Pals.", data.eggsHatched, 5, "collection"),
    badge("hatch-10", "Hatch Master", "Hatch ten Pals.", data.eggsHatched, 10, "collection"),
    badge("hatch-25", "Hatch Legend", "Hatch twenty-five Pals.", data.eggsHatched, 25, "collection"),
    badge("egg-team", "Tiny Team", "Collect three Pals.", data.collection.length, 3, "collection"),
    badge("team-6", "Six-Pal Squad", "Collect six Pals.", data.collection.length, 6, "collection"),
    badge("team-12", "Dozen Den", "Collect twelve Pals.", data.collection.length, 12, "collection"),
    badge("team-20", "Full Page", "Collect twenty Pals.", data.collection.length, 20, "collection"),
    badge("element-2", "Element Pair", "Collect Pals from two elements.", uniqueElements, 2, "collection"),
    badge("element-4", "Element Keeper", "Collect all four elements.", uniqueElements, 4, "collection"),
    badge("rare-find", "Rare Finder", "Hatch a rare or epic Pal.", rareHatchlings, 1, "rarity"),
    badge("rare-3", "Rare Trio", "Collect three rare or epic Pals.", rareHatchlings, 3, "rarity"),
    badge("rare-10", "Rare Circle", "Collect ten rare or epic Pals.", rareHatchlings, 10, "rarity"),
    badge("epic-find", "Epic Spark", "Hatch your first epic Pal.", epicHatchlings, 1, "rarity"),
    badge("epic-3", "Epic Trio", "Collect three epic Pals.", epicHatchlings, 3, "rarity"),
    badge("streak-3", "Three-Day Spark", "Keep a three-day sync streak.", data.longestStreak, 3, "streak"),
    badge("streak-7", "Weekly Ritual", "Keep a seven-day sync streak.", data.longestStreak, 7, "streak"),
    badge("streak-14", "Two-Week Ritual", "Keep a fourteen-day sync streak.", data.longestStreak, 14, "streak"),
    badge("streak-30", "Monthly Ritual", "Keep a thirty-day sync streak.", data.longestStreak, 30, "streak"),
    badge("streak-60", "Season Ritual", "Keep a sixty-day sync streak.", data.longestStreak, 60, "streak"),
    badge("xp-500", "Pal Trainer", "Earn 500 journey XP.", data.totalXp, 500, "xp"),
    badge("xp-1500", "Final Form", "Reach 1,500 journey XP.", data.totalXp, 1500, "xp"),
    badge("xp-5000", "World Walker", "Earn 5,000 journey XP.", data.totalXp, 5000, "xp"),
    badge("xp-15000", "World Shaper", "Earn 15,000 journey XP.", data.totalXp, 15000, "xp"),
    badge("account-1000", "Profile Climber", "Earn 1,000 account XP.", data.accountXp, 1000, "xp"),
    badge("account-5000", "Known Trainer", "Earn 5,000 account XP.", data.accountXp, 5000, "xp"),
    badge("pal-level-5", "Level Climber", "Raise a Pal to level 5.", highestPalLevel, 5, "training"),
    badge("pal-level-10", "Power Partner", "Raise a Pal to level 10.", highestPalLevel, 10, "training"),
    badge("pal-level-20", "Champion Pal", "Raise a Pal to level 20.", highestPalLevel, 20, "training"),
    badge("bond-50", "Trusted Friend", "Reach 50 bond with a Pal.", highestBond, 50, "bond"),
    badge("bond-100", "Unbreakable Bond", "Reach 100 bond with a Pal.", highestBond, 100, "bond"),
    badge("train-3", "Training Habit", "Complete three training sessions.", trainingSessions, 3, "training"),
    badge("train-15", "Training Camp", "Complete fifteen training sessions.", trainingSessions, 15, "training"),
    badge("train-50", "Training Hall", "Complete fifty training sessions.", trainingSessions, 50, "training"),
    badge("weekly-goal", "Weekly Mover", "Hit your weekly step goal.", weekly.steps, data.weeklyGoalSteps, "movement"),
    badge("weekly-plus", "Weekly Overachiever", "Beat your weekly step goal by 15K.", weekly.steps, data.weeklyGoalSteps + 15000, "movement"),
    badge("month-100k", "100K Month", "Walk 100K steps in 30 days.", monthly.steps, 100000, "movement"),
    badge("month-200k", "200K Month", "Walk 200K steps in 30 days.", monthly.steps, 200000, "movement"),
  ];
}

export function getUnlockedBadgeCount(data: HatchUpData, today: string) {
  return getBadges(data, today).filter((badgeItem) => badgeItem.unlocked).length;
}

export function getBadgeCompletionRatio(data: HatchUpData, today: string) {
  const badges = getBadges(data, today);
  if (badges.length === 0) return 0;
  return badges.filter((badgeItem) => badgeItem.unlocked).length / badges.length;
}

export function getNextBadges(data: HatchUpData, today: string, limit = 4) {
  return getBadges(data, today)
    .filter((badgeItem) => !badgeItem.unlocked)
    .sort((a, b) => b.progress - a.progress || a.target - b.target)
    .slice(0, limit);
}

export function getBadgesByCategory(data: HatchUpData, today: string) {
  return getBadges(data, today).reduce(
    (groups, badgeItem) => {
      return {
        ...groups,
        [badgeItem.category]: [...(groups[badgeItem.category] ?? []), badgeItem],
      };
    },
    {} as Record<BadgeCategory, Badge[]>,
  );
}

export function getBadgeCategoryProgress(data: HatchUpData, today: string) {
  const groups = getBadgesByCategory(data, today);
  return Object.entries(groups).reduce(
    (progress, [category, categoryBadges]) => {
      const unlocked = categoryBadges.filter((badgeItem) => badgeItem.unlocked).length;
      return {
        ...progress,
        [category]: categoryBadges.length === 0 ? 0 : unlocked / categoryBadges.length,
      };
    },
    {} as Record<BadgeCategory, number>,
  );
}

export function getBadgeCategorySummary(data: HatchUpData, today: string) {
  return getBadges(data, today).reduce(
    (summary, badgeItem) => {
      const existing = summary[badgeItem.category] ?? { total: 0, unlocked: 0 };
      return {
        ...summary,
        [badgeItem.category]: {
          total: existing.total + 1,
          unlocked: existing.unlocked + (badgeItem.unlocked ? 1 : 0),
        },
      };
    },
    {} as Record<BadgeCategory, { total: number; unlocked: number }>,
  );
}

function badge(
  id: string,
  label: string,
  description: string,
  value: number,
  target: number,
  category: BadgeCategory = "collection",
): Badge {
  const safeTarget = Math.max(target, 1);
  return {
    category,
    description,
    id,
    label,
    progress: Math.min(value / safeTarget, 1),
    target: safeTarget,
    unlocked: value >= safeTarget,
    value,
  };
}
