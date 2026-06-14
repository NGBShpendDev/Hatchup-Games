import { formatNumber, formatPercent, formatSteps } from "../utils/format";
import type { EggElement, EggRarity, IncubatorEgg } from "./models";

export interface EggProgressSummary {
  egg: IncubatorEgg;
  eggName: string;
  element: EggElement;
  elementLabel: string;
  isReady: boolean;
  percent: number;
  percentLabel: string;
  progressLabel: string;
  rarity: EggRarity;
  rarityLabel: string;
  readinessLabel: string;
  stepsLeft: number;
  stepsLeftLabel: string;
  stepsProgress: number;
  stepsRequired: number;
}

export function getEggProgressSummary(egg: IncubatorEgg): EggProgressSummary {
  const stepsRequired = Math.max(Math.floor(egg.stepsRequired || 0), 1);
  const stepsProgress = clamp(Math.floor(egg.stepsWalked || 0), 0, stepsRequired);
  const stepsLeft = Math.max(stepsRequired - stepsProgress, 0);
  const percent = clamp(stepsProgress / stepsRequired, 0, 1);
  const isReady = stepsLeft === 0;
  const rarityLabel = capitalize(egg.rarity);
  const elementLabel = capitalize(egg.element);
  const eggName = `${rarityLabel} ${elementLabel} Egg`;

  return {
    egg,
    eggName,
    element: egg.element,
    elementLabel,
    isReady,
    percent,
    percentLabel: formatPercent(percent),
    progressLabel: `${formatNumber(stepsProgress)} / ${formatNumber(stepsRequired)} steps`,
    rarity: egg.rarity,
    rarityLabel,
    readinessLabel: isReady
      ? `${eggName} is ready to hatch`
      : `${eggName} is ${formatPercent(percent)} ready`,
    stepsLeft,
    stepsLeftLabel: isReady ? "Ready to hatch" : `${formatSteps(stepsLeft)} left`,
    stepsProgress,
    stepsRequired,
  };
}

export function getEggProgressSummaries(
  eggs: readonly IncubatorEgg[] | null | undefined,
) {
  return [...(eggs ?? [])]
    .map(getEggProgressSummary)
    .sort((left, right) => {
      if (left.isReady !== right.isReady) return left.isReady ? -1 : 1;
      if (left.stepsLeft !== right.stepsLeft) return left.stepsLeft - right.stepsLeft;
      return right.percent - left.percent;
    });
}

export function getTrackedEgg(
  eggs: readonly IncubatorEgg[] | null | undefined,
): IncubatorEgg | null {
  return getEggProgressSummaries(eggs)[0]?.egg ?? null;
}

export function getReadyEggCount(eggs: readonly IncubatorEgg[] | null | undefined) {
  return getEggProgressSummaries(eggs).filter((summary) => summary.isReady).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
