import type {
  EggElement,
  EggRarity,
  HatchUpData,
  IncubatorEgg,
} from "./models";
import { createHatchlingFromEgg } from "./hatchlings";
import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
  type ProgressionProfile,
} from "./progressionConfig";

export const MAX_ACTIVE_EGGS = 3;

const ELEMENTS: readonly EggElement[] = ["leaf", "ember", "tide", "storm"];
const RARITY_WEIGHTS: readonly { rarity: EggRarity; weight: number }[] = [
  { rarity: "common", weight: 55 },
  { rarity: "uncommon", weight: 30 },
  { rarity: "rare", weight: 12 },
  { rarity: "epic", weight: 3 },
];
const EGG_DROP_MILESTONES = [50, 150, 350, 700, 1200, 1800];

export function createEgg(
  seed: number,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): IncubatorEgg {
  const safeSeed = Math.abs(Math.floor(seed));
  const rarity = pickRarity(seededPercent(safeSeed, 17));
  const element = ELEMENTS[seededIndex(safeSeed, 31, ELEMENTS.length)];

  return {
    id: `egg-${safeSeed + 1}`,
    element,
    rarity,
    stepsRequired: getEggStepsRequired(rarity, profile),
    stepsWalked: 0,
  };
}

export function createRandomEgg(
  seed: number,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
) {
  return createEgg(hashSeed(seed), profile);
}

export function createStarterEgg(
  element: EggElement,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): IncubatorEgg {
  return {
    id: `starter-${element}`,
    element,
    rarity: "common",
    stepsRequired: getEggStepsRequired("common", profile),
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

export function addStepsToEggs(
  eggs: readonly IncubatorEgg[],
  steps: number,
): IncubatorEgg[] {
  return eggs.map((egg) => addStepsToEgg(egg, steps));
}

export function getReadyEggs(eggs: readonly IncubatorEgg[]) {
  return eggs.filter(isEggReady);
}

export function hatchEgg(
  data: HatchUpData,
  eggId: string,
  hatchedAt: string,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): HatchUpData {
  const egg = data.activeEggs.find((item) => item.id === eggId);
  if (!egg || !isEggReady(egg)) return data;

  const eggsHatched = data.eggsHatched + 1;
  const hatchling = createHatchlingFromEgg({
    egg,
    hatchedAt,
    index: eggsHatched,
  });
  const replacementEgg = createRandomEgg(
    Date.parse(hatchedAt) + eggsHatched + hashText(eggId),
    profile,
  );
  const activeEggs = data.activeEggs
    .map((item) => (item.id === eggId ? replacementEgg : item))
    .slice(0, MAX_ACTIVE_EGGS);

  return {
    ...data,
    activeEgg: activeEggs[0],
    activeEggs,
    activeHatchlingId: data.activeHatchlingId ?? hatchling.id,
    collection: [hatchling, ...data.collection],
    eggsHatched,
  };
}

export function hatchActiveEgg(
  data: HatchUpData,
  hatchedAt: string,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): HatchUpData {
  const readyEgg = data.activeEggs.find(isEggReady);
  return readyEgg ? hatchEgg(data, readyEgg.id, hatchedAt, profile) : data;
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

export function grantMilestoneEggs(
  data: HatchUpData,
  previousXp: number,
  nextXp: number,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): HatchUpData {
  let next = data;

  for (const milestone of EGG_DROP_MILESTONES) {
    const id = `xp-${milestone}`;
    const crossed = previousXp < milestone && nextXp >= milestone;
    const alreadyAwarded = next.milestoneEggsAwarded.includes(id);
    const hasRoom = next.activeEggs.length < MAX_ACTIVE_EGGS;

    if (!crossed || alreadyAwarded || !hasRoom) continue;

    const egg = createRandomEgg(nextXp + milestone + next.activeEggs.length, profile);
    const activeEggs = [...next.activeEggs, { ...egg, id: `${id}-${egg.id}` }];
    next = {
      ...next,
      activeEgg: activeEggs[0],
      activeEggs,
      milestoneEggsAwarded: [...next.milestoneEggsAwarded, id],
    };
  }

  return next;
}

function seededIndex(seed: number, salt: number, length: number) {
  return Math.abs(hashSeed(seed + salt)) % length;
}

function seededPercent(seed: number, salt: number) {
  return Math.abs(hashSeed(seed + salt)) % 100;
}

function pickRarity(roll: number): EggRarity {
  let remaining = roll;

  for (const entry of RARITY_WEIGHTS) {
    if (remaining < entry.weight) return entry.rarity;
    remaining -= entry.weight;
  }

  return "common";
}

function hashSeed(seed: number) {
  let value = Math.abs(Math.floor(seed)) || 1;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;
  return Math.abs(value);
}

function hashText(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}
