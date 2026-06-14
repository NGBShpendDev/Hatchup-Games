import { formatNumber, formatSteps } from "../utils/format";
import { toDateKey } from "./date";
import {
  getEggProgressSummary,
  getReadyEggCount,
  getTrackedEgg,
} from "./eggProgress";
import {
  getActiveHatchling,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "./hatchlings";
import type { HatchUpData } from "./models";
import {
  getDailyQuests,
  getQuestProgress,
  getQuestRemainingText,
  isQuestComplete,
  type Quest,
} from "./quests";
import { getWeeklyRewardChest } from "./rewardChests";

export type NextBestActionTarget =
  | "collection"
  | "claimWeeklyChest"
  | "dailyQuest"
  | "hatchery"
  | "profile"
  | "sync"
  | "tomorrow"
  | "weeklyChest";

export interface NextBestActionModel {
  ctaLabel: string;
  description: string;
  disabled?: boolean;
  progressLabel?: string;
  target: NextBestActionTarget;
  title: string;
  valueLabel?: string;
  variant?: "primary" | "secondary";
}

interface NextBestActionOptions {
  isSyncing?: boolean;
  now?: string;
  todayKey?: string;
}

const CLOSE_DAILY_QUEST_PROGRESS = 0.75;
const CLOSE_WEEKLY_CHEST_PROGRESS = 0.8;

export function getNextBestAction(
  data: HatchUpData,
  options: NextBestActionOptions = {},
): NextBestActionModel {
  const todayKey = options.todayKey ?? toDateKey(new Date());
  const now = options.now ?? new Date().toISOString();
  const activeEggs =
    Array.isArray(data.activeEggs) && data.activeEggs.length > 0
      ? data.activeEggs
      : data.activeEgg
        ? [data.activeEgg]
        : [];
  const collection = Array.isArray(data.collection) ? data.collection : [];
  const todayAward = getSyncedAwardForDate(data, todayKey);
  const movementAvailableToSync = !todayAward;
  const readyEggCount = getReadyEggCount(activeEggs);
  const focusEgg = getTrackedEgg(activeEggs);
  const activeHatchlingRaw = getActiveHatchling({
    ...data,
    collection,
  });
  const activeHatchling = activeHatchlingRaw
    ? getTimeAdjustedHatchling(activeHatchlingRaw, now)
    : null;
  const trainingStatus = activeHatchling
    ? getTrainingStatus(activeHatchling, now)
    : null;
  const profileIncomplete =
    !data.profileUsername?.trim() ||
    (collection.length > 0 && !data.profileHatchlingId);
  const closeDailyQuest = todayAward
    ? getCloseDailyQuest(getDailyQuests(todayAward))
    : null;
  const weeklyChest = getWeeklyRewardChest(data, todayKey);

  if (movementAvailableToSync) {
    return {
      ctaLabel: options.isSyncing ? "Syncing..." : "Sync movement",
      description: activeHatchling
        ? "Turn today's movement into Pal XP, Egg progress, streak progress, and quest rewards."
        : "Turn today's movement into Egg progress, streak progress, and quest rewards.",
      disabled: Boolean(options.isSyncing),
      progressLabel: "No movement synced today",
      target: "sync",
      title: "Sync movement",
      valueLabel: focusEgg ? formatEggProgress(focusEgg) : undefined,
      variant: "primary",
    };
  }

  if (readyEggCount > 0) {
    return {
      ctaLabel: readyEggCount > 1 ? "Hatch Eggs" : "Hatch Egg",
      description:
        "Your steps filled an Egg. Open the Hatchery to reveal the Pal waiting inside.",
      progressLabel: `${readyEggCount} ready`,
      target: "hatchery",
      title: readyEggCount > 1 ? "Hatch Eggs" : "Hatch Egg",
      valueLabel: formatSteps(todayAward.health.steps),
      variant: "primary",
    };
  }

  if (activeHatchling && trainingStatus?.canTrain) {
    return {
      ctaLabel: "Train Pal",
      description: `${activeHatchling.name} has a training session ready. Training builds Pal XP and bond.`,
      progressLabel: `${trainingStatus.remainingToday} training ${
        trainingStatus.remainingToday === 1 ? "session" : "sessions"
      } left today`,
      target: "collection",
      title: "Train Pal",
      valueLabel: `Level ${formatNumber(activeHatchling.level)}`,
      variant: "primary",
    };
  }

  if (closeDailyQuest) {
    return {
      ctaLabel: "Sync movement",
      description: `${closeDailyQuest.label} is almost done. A little more movement can turn it into today's quest progress.`,
      progressLabel: `${Math.round(getQuestProgress(closeDailyQuest) * 100)}% done`,
      target: "dailyQuest",
      title: "Finish today's quest",
      valueLabel: getQuestRemainingText(closeDailyQuest),
      variant: "primary",
    };
  }

  if (weeklyChest.canClaim) {
    return {
      ctaLabel: "Claim chest",
      description:
        "Your weekly movement filled the chest. Claim it before pushing for the next goal.",
      progressLabel: "Ready",
      target: "claimWeeklyChest",
      title: "Claim weekly chest",
      valueLabel: `${formatNumber(weeklyChest.rewardCoins)} coins`,
      variant: "primary",
    };
  }

  if (!weeklyChest.claimed && weeklyChest.progress >= CLOSE_WEEKLY_CHEST_PROGRESS) {
    return {
      ctaLabel: options.isSyncing ? "Syncing..." : "Sync movement",
      description:
        "Your weekly chest is close. Sync new movement after your next walk to push it over the line.",
      disabled: Boolean(options.isSyncing),
      progressLabel: `${Math.round(weeklyChest.progress * 100)}% filled`,
      target: "weeklyChest",
      title: "Push weekly chest",
      valueLabel: `${formatSteps(Math.max(weeklyChest.target - weeklyChest.steps, 0))} left`,
      variant: "primary",
    };
  }

  if (profileIncomplete) {
    return {
      ctaLabel: "Complete profile",
      description:
        "Add your trainer name and profile Pal so your progress feels personal and ready to share.",
      progressLabel: data.profileUsername?.trim()
        ? "Choose profile Pal"
        : "Trainer name needed",
      target: "profile",
      title: "Complete profile",
      valueLabel:
        collection.length > 0
          ? `${formatNumber(collection.length)} Pals collected`
          : undefined,
      variant: "secondary",
    };
  }

  return {
    ctaLabel: "View Collection",
    description:
      "Today's core loop is complete. Return tomorrow to sync movement, grow Eggs, and keep your streak alive.",
    progressLabel:
      data.currentStreak > 0
        ? `${formatNumber(data.currentStreak)} day streak`
        : "Daily loop complete",
    target: "tomorrow",
    title: "Come back tomorrow",
    valueLabel: focusEgg ? formatEggProgress(focusEgg) : undefined,
    variant: "secondary",
  };
}

function formatEggProgress(egg: HatchUpData["activeEgg"]) {
  const summary = getEggProgressSummary(egg);
  return `${summary.progressLabel} | ${summary.stepsLeftLabel}`;
}

export function getSyncedAwardForDate(data: HatchUpData, todayKey: string) {
  if (data.dailyAward?.date === todayKey) return data.dailyAward;
  return data.activityHistory?.find((award) => award.date === todayKey) ?? null;
}

function getCloseDailyQuest(quests: readonly Quest[]) {
  return [...quests]
    .filter((quest) => !isQuestComplete(quest))
    .map((quest) => ({
      progress: getQuestProgress(quest),
      quest,
    }))
    .filter(({ progress }) => progress >= CLOSE_DAILY_QUEST_PROGRESS)
    .sort((left, right) => right.progress - left.progress)[0]?.quest ?? null;
}
