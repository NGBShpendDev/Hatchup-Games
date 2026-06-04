import type {
  CollectedHatchling,
  EggElement,
  EggRarity,
  HatchlingMemory,
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

export const TRAINING_DAILY_LIMIT = 3;
export const TRAINING_COOLDOWN_HOURS = 4;
export const TRAINING_XP = 25;
export const TRAINING_BOND = 4;
export const PASSIVE_BOND_HOURS = 8;
export const HATCHLING_XP_PER_LEVEL = 75;

export interface HatchlingTrainingStatus {
  canTrain: boolean;
  cooldownLabel: string;
  nextAvailableAt: string | null;
  remainingToday: number;
  sessionsToday: number;
}

export interface HatchlingLevelProgress {
  currentLevelXp: number;
  nextLevel: number | null;
  progress: number;
  xpPerLevel: number;
  xpToNext: number;
}

export interface HatchlingTrainingPreview {
  bondGain: number;
  levelAfterTraining: number;
  levelsGained: number;
  powerAfterTraining: number;
  powerGain: number;
  xpGain: number;
}

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
    memories: [
      {
        description: `Hatched from a ${egg.rarity} ${egg.element} egg.`,
        happenedAt: hatchedAt,
        id: `memory-hatch-${index}`,
        label: "First hatch",
      },
    ],
    mood: "happy",
    name: nameOptions[(index - 1) % nameOptions.length],
    rarity: egg.rarity,
    stats: getHatchlingStats(egg.element, egg.rarity, level),
    trainingSessions: [],
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
  const lastInteractionAt =
    hatchling.lastInteractionAt ?? hatchling.hatchedAt ?? null;

  return {
    bond,
    element,
    hatchedAt: hatchling.hatchedAt ?? new Date(0).toISOString(),
    id: hatchling.id ?? `hatchling-${index}`,
    lastInteractionAt,
    memories:
      hatchling.memories && hatchling.memories.length > 0
        ? hatchling.memories
        : createLegacyHatchMemory(hatchling, index),
    level,
    mood: getHatchlingMood({
      bond,
      lastInteractionAt,
    }),
    name: hatchling.name ?? ELEMENT_NAMES[element][(index - 1) % 3],
    rarity,
    stats: getHatchlingStats(element, rarity, level),
    trainingSessions: hatchling.trainingSessions ?? [],
    xp,
  };
}

export function addXpToActiveHatchling(
  data: HatchUpData,
  xpGained: number,
  interactedAt = new Date().toISOString(),
): HatchUpData {
  if (!data.activeHatchlingId || xpGained <= 0) return data;

  const collection = data.collection.map((hatchling) => {
    if (hatchling.id !== data.activeHatchlingId) return hatchling;

    const current = getTimeAdjustedHatchling(hatchling, interactedAt);
    const xp = current.xp + xpGained;
    const level = getHatchlingLevel(xp);
    const leveledUp = level > current.level;
    const bond = clampBond(current.bond + Math.max(Math.ceil(xpGained / 25), 1));
    return {
      ...current,
      bond,
      lastInteractionAt: interactedAt,
      level,
      mood: getHatchlingMood({ bond, lastInteractionAt: interactedAt }),
      memories: leveledUp
        ? [
            createLevelMemory(level, interactedAt, "Health sync"),
            ...current.memories,
          ]
        : current.memories,
      stats: getHatchlingStats(hatchling.element, hatchling.rarity, level),
      xp,
    };
  });

  return {
    ...data,
    collection,
  };
}

export function trainHatchling(
  data: HatchUpData,
  hatchlingId: string,
  trainedAt = new Date().toISOString(),
): HatchUpData {
  let trained = false;

  const collection = data.collection.map((hatchling) => {
    if (hatchling.id !== hatchlingId) return getTimeAdjustedHatchling(hatchling);

    const current = getTimeAdjustedHatchling(hatchling, trainedAt);
    const status = getTrainingStatus(current, trainedAt);
    if (!status.canTrain) return current;

    trained = true;
    const xp = current.xp + TRAINING_XP;
    const level = getHatchlingLevel(xp);
    const leveledUp = level > current.level;
    const bond = clampBond(current.bond + TRAINING_BOND);

    return {
      ...current,
      bond,
      lastInteractionAt: trainedAt,
      level,
      memories: leveledUp
        ? [
            createLevelMemory(level, trainedAt, "Training"),
            ...current.memories,
          ]
        : current.memories,
      mood: getHatchlingMood({ bond, lastInteractionAt: trainedAt }),
      stats: getHatchlingStats(current.element, current.rarity, level),
      trainingSessions: [...current.trainingSessions, trainedAt],
      xp,
    };
  });

  return trained
    ? {
        ...data,
        activeHatchlingId: data.activeHatchlingId ?? hatchlingId,
        collection,
      }
    : {
        ...data,
        collection,
      };
}

function createLevelMemory(
  level: number,
  happenedAt: string,
  source: string,
): HatchlingMemory {
  return {
    description: `${source} helped this Pal reach level ${level}.`,
    happenedAt,
    id: `memory-level-${level}-${Date.parse(happenedAt)}`,
    label: `Reached level ${level}`,
  };
}

function createLegacyHatchMemory(
  hatchling: Partial<CollectedHatchling>,
  index: number,
): HatchlingMemory[] {
  const element = hatchling.element ?? "leaf";
  const rarity = hatchling.rarity ?? "common";
  const happenedAt = hatchling.hatchedAt ?? new Date(0).toISOString();

  return [
    {
      description: `Hatched from a ${rarity} ${element} egg.`,
      happenedAt,
      id: `memory-hatch-${index}`,
      label: "First hatch",
    },
  ];
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

export function getTimeAdjustedHatchling(
  hatchling: CollectedHatchling,
  now = new Date().toISOString(),
): CollectedHatchling {
  const passiveBond = getPassiveBondGain(hatchling, now);
  const bond = clampBond(hatchling.bond + passiveBond);
  const lastInteractionAt =
    passiveBond > 0 ? now : hatchling.lastInteractionAt;

  return {
    ...hatchling,
    bond,
    lastInteractionAt,
    mood: getHatchlingMood({ bond, lastInteractionAt }),
    trainingSessions: getTrainingSessionsForDay(hatchling, now),
  };
}

export function getTrainingStatus(
  hatchling: CollectedHatchling,
  now = new Date().toISOString(),
): HatchlingTrainingStatus {
  const sessionsToday = getTrainingSessionsForDay(hatchling, now);
  const remainingToday = Math.max(
    TRAINING_DAILY_LIMIT - sessionsToday.length,
    0,
  );
  const lastSession = sessionsToday[sessionsToday.length - 1] ?? null;
  const nextAvailableAt = lastSession
    ? new Date(
        Date.parse(lastSession) + TRAINING_COOLDOWN_HOURS * 60 * 60 * 1000,
      ).toISOString()
    : null;
  const cooldownDone = !nextAvailableAt || Date.parse(now) >= Date.parse(nextAvailableAt);
  const canTrain = remainingToday > 0 && cooldownDone;

  return {
    canTrain,
    cooldownLabel: getCooldownLabel({ nextAvailableAt, remainingToday, now }),
    nextAvailableAt,
    remainingToday,
    sessionsToday: sessionsToday.length,
  };
}

export function getHatchlingLevel(xp: number) {
  return Math.min(Math.floor(Math.max(xp, 0) / HATCHLING_XP_PER_LEVEL) + 1, 50);
}

export function getHatchlingXpProgress(xp: number) {
  return getHatchlingLevelProgress(xp).progress;
}

export function getHatchlingLevelProgress(xp: number): HatchlingLevelProgress {
  const safeXp = Math.max(xp, 0);
  const level = getHatchlingLevel(safeXp);
  const maxed = level >= 50;
  const currentLevelXp = maxed ? HATCHLING_XP_PER_LEVEL : safeXp % HATCHLING_XP_PER_LEVEL;
  const xpToNext = maxed ? 0 : HATCHLING_XP_PER_LEVEL - currentLevelXp;

  return {
    currentLevelXp,
    nextLevel: maxed ? null : level + 1,
    progress: maxed ? 1 : currentLevelXp / HATCHLING_XP_PER_LEVEL,
    xpPerLevel: HATCHLING_XP_PER_LEVEL,
    xpToNext,
  };
}

export function getTrainingPreview(
  hatchling: CollectedHatchling,
): HatchlingTrainingPreview {
  const xp = hatchling.xp + TRAINING_XP;
  const levelAfterTraining = getHatchlingLevel(xp);
  const statsAfterTraining = getHatchlingStats(
    hatchling.element,
    hatchling.rarity,
    levelAfterTraining,
  );
  const powerAfterTraining =
    statsAfterTraining.heart +
    statsAfterTraining.power +
    statsAfterTraining.resilience +
    statsAfterTraining.speed;
  const currentPower = getHatchlingPowerScore(hatchling);

  return {
    bondGain: TRAINING_BOND,
    levelAfterTraining,
    levelsGained: Math.max(levelAfterTraining - hatchling.level, 0),
    powerAfterTraining,
    powerGain: Math.max(powerAfterTraining - currentPower, 0),
    xpGain: TRAINING_XP,
  };
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

export function getPassiveBondGain(
  hatchling: Pick<CollectedHatchling, "bond" | "lastInteractionAt">,
  now = new Date().toISOString(),
) {
  if (!hatchling.lastInteractionAt || hatchling.bond >= 100) return 0;

  const elapsedMs = Math.max(Date.parse(now) - Date.parse(hatchling.lastInteractionAt), 0);
  return Math.min(Math.floor(elapsedMs / (PASSIVE_BOND_HOURS * 60 * 60 * 1000)), 3);
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

function getTrainingSessionsForDay(
  hatchling: Pick<CollectedHatchling, "trainingSessions">,
  now: string,
) {
  const day = now.slice(0, 10);
  return hatchling.trainingSessions.filter((session) => session.slice(0, 10) === day);
}

function getCooldownLabel({
  nextAvailableAt,
  now,
  remainingToday,
}: {
  nextAvailableAt: string | null;
  now: string;
  remainingToday: number;
}) {
  if (remainingToday <= 0) return "Training used up for today";
  if (!nextAvailableAt || Date.parse(now) >= Date.parse(nextAvailableAt)) {
    return `${remainingToday} training session${remainingToday === 1 ? "" : "s"} left today`;
  }

  const minutes = Math.max(
    Math.ceil((Date.parse(nextAvailableAt) - Date.parse(now)) / 60000),
    1,
  );
  if (minutes >= 60) {
    const hours = Math.ceil(minutes / 60);
    return `Next training in ${hours}h`;
  }

  return `Next training in ${minutes}m`;
}
