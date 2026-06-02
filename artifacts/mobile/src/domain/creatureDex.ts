import type { CollectedHatchling, EggElement, EggRarity } from "./models";

export interface CreatureSpecies {
  id: string;
  name: string;
  element: EggElement;
  rarity: EggRarity;
  habitat: string;
  description: string;
}

export interface CreatureDexEntry extends CreatureSpecies {
  ownedCount: number;
  firstHatchedAt: string | null;
}

const ELEMENT_DETAILS: Record<EggElement, { habitat: string; trait: string }> = {
  leaf: {
    habitat: "Sprout Grove",
    trait: "restores energy with tiny bursts of green light",
  },
  ember: {
    habitat: "Cinder Nook",
    trait: "keeps moving with a warm little spark",
  },
  tide: {
    habitat: "Moonpool Shore",
    trait: "flows calmly through every active streak",
  },
  storm: {
    habitat: "Cloudline Ridge",
    trait: "charges up when a workout lands",
  },
};

const RARITY_PREFIXES: Record<EggRarity, string> = {
  common: "Tiny",
  uncommon: "Bright",
  rare: "Wild",
  epic: "Mythic",
};

const ELEMENT_NAMES: Record<EggElement, string> = {
  leaf: "Sprig",
  ember: "Cinder",
  tide: "Ripple",
  storm: "Gust",
};

export const CREATURE_SPECIES: readonly CreatureSpecies[] = (
  ["common", "uncommon", "rare", "epic"] as const
).flatMap((rarity) =>
  (["leaf", "ember", "tide", "storm"] as const).map((element) => ({
    id: getSpeciesId(element, rarity),
    name: `${RARITY_PREFIXES[rarity]} ${ELEMENT_NAMES[element]}`,
    element,
    rarity,
    habitat: ELEMENT_DETAILS[element].habitat,
    description: `${RARITY_PREFIXES[rarity]} ${ELEMENT_NAMES[element]} ${ELEMENT_DETAILS[element].trait}.`,
  })),
);

export function getSpeciesId(element: EggElement, rarity: EggRarity) {
  return `${rarity}-${element}`;
}

export function getCreatureDexEntries(
  collection: readonly CollectedHatchling[],
): CreatureDexEntry[] {
  return CREATURE_SPECIES.map((species) => {
    const owned = collection.filter(
      (hatchling) =>
        hatchling.element === species.element && hatchling.rarity === species.rarity,
    );
    const firstHatchedAt = owned.reduce<string | null>(
      (earliest, hatchling) =>
        earliest === null || hatchling.hatchedAt < earliest
          ? hatchling.hatchedAt
          : earliest,
      null,
    );

    return {
      ...species,
      ownedCount: owned.length,
      firstHatchedAt,
    };
  });
}

export function getDexCompletion(collection: readonly CollectedHatchling[]) {
  const entries = getCreatureDexEntries(collection);
  const unlocked = entries.filter((entry) => entry.ownedCount > 0).length;

  return {
    total: entries.length,
    unlocked,
    percent: entries.length > 0 ? unlocked / entries.length : 0,
  };
}
