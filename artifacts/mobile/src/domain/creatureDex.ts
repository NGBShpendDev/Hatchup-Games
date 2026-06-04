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

export interface DexGroupSummary<T extends string> {
  id: T;
  total: number;
  unlocked: number;
  percent: number;
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

export const DEX_ELEMENTS = ["leaf", "ember", "tide", "storm"] as const;
export const DEX_RARITIES = ["common", "uncommon", "rare", "epic"] as const;

export const CREATURE_SPECIES: readonly CreatureSpecies[] = (
  DEX_RARITIES
).flatMap((rarity) =>
  DEX_ELEMENTS.map((element) => ({
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

export function getNextMissingDexEntry(
  collection: readonly CollectedHatchling[],
): CreatureDexEntry | null {
  return (
    getCreatureDexEntries(collection).find((entry) => entry.ownedCount === 0) ??
    null
  );
}

export function getDexElementSummary(
  collection: readonly CollectedHatchling[],
): DexGroupSummary<EggElement>[] {
  const entries = getCreatureDexEntries(collection);
  return DEX_ELEMENTS.map((element) => getDexGroupSummary(element, entries));
}

export function getDexRaritySummary(
  collection: readonly CollectedHatchling[],
): DexGroupSummary<EggRarity>[] {
  const entries = getCreatureDexEntries(collection);
  return DEX_RARITIES.map((rarity) => getDexGroupSummary(rarity, entries));
}

function getDexGroupSummary<T extends EggElement | EggRarity>(
  id: T,
  entries: readonly CreatureDexEntry[],
): DexGroupSummary<T> {
  const group = entries.filter(
    (entry) => entry.element === id || entry.rarity === id,
  );
  const unlocked = group.filter((entry) => entry.ownedCount > 0).length;

  return {
    id,
    total: group.length,
    unlocked,
    percent: group.length > 0 ? unlocked / group.length : 0,
  };
}
