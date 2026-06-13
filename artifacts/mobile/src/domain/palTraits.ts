import type { CollectedHatchling, EggElement, EggRarity, PalTraitId } from "./models";

export interface PalTrait {
  description: string;
  displayName: string;
  effect: string;
  id: PalTraitId;
  implementationNote?: string;
}

export const PAL_TRAITS: Record<PalTraitId, PalTrait> = {
  brave: {
    description: "Bold, competitive, and happiest when weekly goals get serious.",
    displayName: "Brave",
    effect: "+5% Journey XP score on the weekly Ranks board.",
    id: "brave",
  },
  curious: {
    description: "Always noticing tiny moments along the journey.",
    displayName: "Curious",
    effect: "Higher chance to reveal memories.",
    id: "curious",
    implementationNote:
      "TODO: wire into a future memory-drop roll when sync and training can emit optional memories.",
  },
  energetic: {
    description: "Quick to convert movement into growth.",
    displayName: "Energetic",
    effect: "Bonus Pal XP from step-based sync rewards.",
    id: "energetic",
    implementationNote:
      "TODO: apply only when health sync passes source-specific step XP into Pal XP rewards.",
  },
  loyal: {
    description: "Protective, steady, and built for long streaks.",
    displayName: "Loyal",
    effect: "Streak protection once per week.",
    id: "loyal",
    implementationNote:
      "TODO: apply when streak misses are represented separately from normal daily sync state.",
  },
  playful: {
    description: "Loves short practice bursts and bonding through training.",
    displayName: "Playful",
    effect: "+1 Bond from each completed training session.",
    id: "playful",
  },
  sleepy: {
    description: "Slow to wake up, but especially sweet when you come back tomorrow.",
    displayName: "Sleepy",
    effect: "+1 bonus Bond from daily return bond.",
    id: "sleepy",
  },
};

const TRAIT_ROTATION: PalTraitId[] = [
  "sleepy",
  "energetic",
  "loyal",
  "curious",
  "brave",
  "playful",
];

export function assignPalTrait({
  element,
  index,
  rarity,
}: {
  element: EggElement;
  index: number;
  rarity: EggRarity;
}): PalTraitId {
  const elementOffset: Record<EggElement, number> = {
    ember: 4,
    leaf: 0,
    storm: 3,
    tide: 1,
  };
  const rarityOffset: Record<EggRarity, number> = {
    common: 0,
    epic: 5,
    rare: 3,
    uncommon: 1,
  };
  const seed = Math.max(index - 1, 0) + elementOffset[element] + rarityOffset[rarity];
  return TRAIT_ROTATION[seed % TRAIT_ROTATION.length];
}

export function getPalTrait(hatchling: Pick<CollectedHatchling, "traitId">): PalTrait {
  return PAL_TRAITS[hatchling.traitId ?? "sleepy"];
}

export function getTrainingBondWithTrait(hatchling: Pick<CollectedHatchling, "traitId">, baseBond: number) {
  return baseBond + (getPalTrait(hatchling).id === "playful" ? 1 : 0);
}

export function getPassiveBondWithTrait({
  baseBondGain,
  hatchling,
  now,
}: {
  baseBondGain: number;
  hatchling: Pick<CollectedHatchling, "lastInteractionAt" | "traitId">;
  now: string;
}) {
  if (baseBondGain <= 0 || getPalTrait(hatchling).id !== "sleepy") {
    return baseBondGain;
  }
  if (!hatchling.lastInteractionAt) return baseBondGain;

  const elapsedDays =
    (Date.parse(now) - Date.parse(hatchling.lastInteractionAt)) / 86400000;
  return elapsedDays >= 1 ? baseBondGain + 1 : baseBondGain;
}

export function getWeeklyChallengeXpWithTrait(
  hatchling: Pick<CollectedHatchling, "traitId"> | null,
  baseXp: number,
) {
  return hatchling && getPalTrait(hatchling).id === "brave"
    ? Math.round(baseXp * 1.05)
    : baseXp;
}
