import type {
  CollectedHatchling,
  EggElement,
  EggRarity,
  HatchUpData,
  IncubatorEgg,
} from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
  type ProgressionProfile,
} from "./progressionConfig";

const ELEMENTS: readonly EggElement[] = ["leaf", "ember", "tide", "storm"];
const RARITIES: readonly EggRarity[] = [
  "common",
  "common",
  "uncommon",
  "common",
  "rare",
  "uncommon",
  "epic",
];
const NAMES = ["Sprig", "Cinder", "Ripple", "Gust", "Moss", "Sparky", "Pebble"];

export function createEgg(
  seed: number,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): IncubatorEgg {
  const rarity = RARITIES[seed % RARITIES.length];

  return {
    id: `egg-${seed + 1}`,
    element: ELEMENTS[seed % ELEMENTS.length],
    rarity,
    stepsRequired: getEggStepsRequired(rarity, profile),
    stepsWalked: 0,
  };
}

export function getEggProgress(egg: IncubatorEgg) {
  return Math.min(egg.stepsWalked / egg.stepsRequired, 1);
}

export function isEggReady(egg: IncubatorEgg) {
  return egg.stepsWalked >= egg.stepsRequired;
}

export function addStepsToEgg(egg: IncubatorEgg, steps: number): IncubatorEgg {
  return {
    ...egg,
    stepsWalked: Math.min(
      egg.stepsWalked + Math.max(steps, 0),
      egg.stepsRequired,
    ),
  };
}

export function hatchActiveEgg(
  data: HatchUpData,
  hatchedAt: string,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): HatchUpData {
  if (!isEggReady(data.activeEgg)) return data;

  const hatchling: CollectedHatchling = {
    id: `hatchling-${data.eggsHatched + 1}`,
    name: NAMES[data.eggsHatched % NAMES.length],
    element: data.activeEgg.element,
    rarity: data.activeEgg.rarity,
    hatchedAt,
  };
  const eggsHatched = data.eggsHatched + 1;

  return {
    ...data,
    activeEgg: createEgg(eggsHatched, profile),
    collection: [hatchling, ...data.collection],
    eggsHatched,
  };
}

export function getNewStepsForSync(
  previousAward: HatchUpData["dailyAward"],
  nextDate: string,
  nextSteps: number,
) {
  const previousSteps =
    previousAward?.date === nextDate ? previousAward.health.steps : 0;

  return Math.max(nextSteps - previousSteps, 0);
}
