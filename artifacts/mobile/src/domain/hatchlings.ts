import type {
  CollectedHatchling,
  EggElement,
  EggRarity,
  HatchlingMood,
  HatchlingStats,
  HatchUpData,
  IncubatorEgg,
} from "./models";

const ELEMENT_NAMES: Record<EggElement, readonly string[]> = {
  ember: ["Cinder", "Kindle", "Flare"],
  leaf: ["Sprig", "Moss", "Fern"],
  storm: ["Gust", "Bolt", "Nimbus"],
  tide: ["Ripple", "Bubbles", "Marina"],
};

const RARITY_BONUS: Record<EggRarity, number> = {
  common: 0,
  uncommon: 2,
  rare: 5,
  epic: 9,
};

const ELEMENT_BASE_STATS: Record<EggElement, HatchlingStats> = {
  ember: { heart: 6, power: 9, resilience: 5, speed: 7 },
  leaf: { heart: 9, power: 6, resilience: 8, speed: 5 },
  storm: { heart: 6, power: 7, resilience: 5, speed: 10 },
  tide: { heart: 8, power: 6, resilience: 9, speed: 6 },
};

export function createHatchlingFromEgg({
  egg,
  hatchedAt,
  index,
}: {
  egg: IncubatorEgg;
  hatchedAt: string;
  index: number;
}): CollectedHatchling {
  const nameOptions = ELEMENT_NAMES[egg.element];
  const level = 1;

  return {
    bond: 5,
    element: egg.element,
    hatchedAt,
    id: `hatchling-${index}`,
    lastInteractionAt: hatchedAt,
    level,
    mood: "happy",
    name: nameOptions[(index - 1) % nameOptions.length],
    rarity: egg.rarity,
    stats: getHatchlingStats(egg.element, egg.rarity, level),
    xp: 0,
  };
}

export function normalizeHatchling(
  hatchling: Partial<CollectedHatchling>,
  index: number,
): CollectedHatchling {
  const element = hatchling.element ?? "leaf";
  const rarity = hatchling.rarity ?? "common";
  const xp = Math.max(hatchling.xp ?? 0, 0);
  const level = getHatchlingLevel(xp);
  const bond = clampBond(hatchling.bond ?? 5);

  return {
    bond,
    element,
    hatchedAt: hatchling.hatchedAt ?? new Date(0).toISOString(),
    id: hatchling.id ?? `hatchling-${index}`,
    lastInteractionAt: hatchling.lastInteractionAt ?? hatchling.hatchedAt ?? null,
    level,
    mood: getHatchlingMood({
      bond,
      lastInteractionAt: hatchling.lastInteractionAt ?? hatchling.hatchedAt ?? null,
    }),
    name: hatchling.name ?? ELEMENT_NAMES[element][(index - 1) % 3],
    rarity,
    stats: getHatchlingStats(element, rarity, level),
    xp,
  };
}

export function addXpToActiveHatchling(
  data: HatchUpData,
  xpGained: number,
): HatchUpData {
  if (!data.activeHatchlingId || xpGained <= 0) return data;

  const collection = data.collection.map((hatchling) => {
    if (hatchling.id !== data.activeHatchlingId) return hatchling;

    const xp = hatchling.xp + xpGained;
    const level = getHatchlingLevel(xp);
    const bond = clampBond(hatchling.bond + Math.max(Math.ceil(xpGained / 25), 1));
    const interactedAt = new Date().toISOString();
    return {
      ...hatchling,
      bond,
      lastInteractionAt: interactedAt,
      level,
      mood: getHatchlingMood({ bond, lastInteractionAt: interactedAt }),
      stats: getHatchlingStats(hatchling.element, hatchling.rarity, level),
      xp,
    };
  });

  return {
    ...data,
    collection,
  };
}

export function renameHatchling(
  data: HatchUpData,
  hatchlingId: string,
  name: string,
): HatchUpData {
  const trimmed = name.trim().slice(0, 18);
  if (!trimmed) return data;

  return {
    ...data,
    collection: data.collection.map((hatchling) =>
      hatchling.id === hatchlingId
        ? {
            ...hatchling,
            name: trimmed,
          }
        : hatchling,
    ),
  };
}

export function bondWithHatchling(
  data: HatchUpData,
  hatchlingId: string,
  amount = 1,
  interactedAt = new Date().toISOString(),
): HatchUpData {
  return {
    ...data,
    collection: data.collection.map((hatchling) => {
      if (hatchling.id !== hatchlingId) return hatchling;

      const bond = clampBond(hatchling.bond + amount);
      return {
        ...hatchling,
        bond,
        lastInteractionAt: interactedAt,
        mood: getHatchlingMood({ bond, lastInteractionAt: interactedAt }),
      };
    }),
  };
}

export function getActiveHatchling(data: HatchUpData) {
  return (
    data.collection.find((item) => item.id === data.activeHatchlingId) ??
    data.collection[0] ??
    null
  );
}

export function getHatchlingLevel(xp: number) {
  return Math.min(Math.floor(Math.max(xp, 0) / 75) + 1, 50);
}

export function getHatchlingXpProgress(xp: number) {
  const xpIntoLevel = Math.max(xp, 0) % 75;
  return xpIntoLevel / 75;
}

export function getHatchlingStats(
  element: EggElement,
  rarity: EggRarity,
  level: number,
): HatchlingStats {
  const base = ELEMENT_BASE_STATS[element];
  const rarityBonus = RARITY_BONUS[rarity];
  const levelBonus = Math.max(level - 1, 0);

  return {
    heart: base.heart + rarityBonus + Math.floor(levelBonus * 0.8),
    power: base.power + rarityBonus + levelBonus,
    resilience: base.resilience + rarityBonus + Math.floor(levelBonus * 0.9),
    speed: base.speed + rarityBonus + Math.floor(levelBonus * 0.85),
  };
}

export function getHatchlingPowerScore(hatchling: CollectedHatchling) {
  return (
    hatchling.stats.heart +
    hatchling.stats.power +
    hatchling.stats.resilience +
    hatchling.stats.speed
  );
}

export function getHatchlingMood({
  bond,
  lastInteractionAt,
}: {
  bond: number;
  lastInteractionAt: string | null;
}): HatchlingMood {
  if (bond >= 80) return "excited";
  if (!lastInteractionAt) return bond >= 30 ? "happy" : "lonely";

  const daysSinceInteraction =
    (Date.now() - Date.parse(lastInteractionAt)) / 86400000;

  if (daysSinceInteraction >= 3) return "lonely";
  if (daysSinceInteraction >= 1.5) return "sleepy";
  return bond >= 30 ? "happy" : "sleepy";
}

function clampBond(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}
