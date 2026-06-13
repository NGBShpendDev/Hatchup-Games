import { formatNumber, formatPercent, formatSteps } from "../utils/format";
import { toDateKey } from "./date";
import { getEggProgress, isEggReady } from "./hatchery";
import {
  getActiveHatchling,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "./hatchlings";
import type { HatchUpData } from "./models";

export type NextBestActionTarget =
  | "collection"
  | "hatchery"
  | "profile"
  | "sync"
  | "tomorrow";

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

export function getNextBestAction(
  data: HatchUpData,
  options: NextBestActionOptions = {},
): NextBestActionModel {
  const todayKey = options.todayKey ?? toDateKey(new Date());
  const now = options.now ?? new Date().toISOString();
  const activeEggs = Array.isArray(data.activeEggs) ? data.activeEggs : [];
  const collection = Array.isArray(data.collection) ? data.collection : [];
  const todayAward =
    data.dailyAward?.date === todayKey
      ? data.dailyAward
      : data.activityHistory?.find((award) => award.date === todayKey) ?? null;
  const readyEggCount = activeEggs.filter(isEggReady).length;
  const focusEgg =
    activeEggs.find((egg) => !isEggReady(egg)) ?? activeEggs[0] ?? null;
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

  if (!todayAward) {
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
  return `${formatPercent(getEggProgress(egg))} Egg progress`;
}
