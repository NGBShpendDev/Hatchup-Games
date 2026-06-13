import { addStepsToEggs } from "./hatchery";
import {
  addXpToActiveHatchling,
  bondWithHatchling,
} from "./hatchlings";
import type {
  CosmeticRewardId,
  CosmeticRewardType,
  EconomyItemId,
  EconomyRewardReceipt,
  EconomyRewardSource,
  HatchUpData,
} from "./models";

export type EconomyRewardType =
  | "journeyXp"
  | "palXp"
  | "bond"
  | "coins"
  | "eggProgress"
  | "chestProgress"
  | "items"
  | "cosmetics";

export interface EconomyRewardBundle {
  accountXp?: number;
  bond?: number;
  chestProgress?: number;
  coins?: number;
  cosmetics?: CosmeticRewardId[];
  eggSteps?: number;
  items?: EconomyItemId[];
  label: string;
  palXp?: number;
  source: EconomyRewardSource;
}

export interface EconomyItemDefinition {
  body: string;
  id: EconomyItemId;
  label: string;
  priceCoins: number;
  reward: Omit<EconomyRewardBundle, "label" | "source">;
}

export interface CosmeticRewardDefinition {
  id: CosmeticRewardId;
  label: string;
  type: CosmeticRewardType;
}

export const ECONOMY_BALANCE = {
  hatch: {
    coins: 25,
  },
  syncChestProgressPerStep: 1,
  training: {
    chestProgress: 100,
  },
  weeklyChest: {
    accountXp: 250,
    bonusItemChance: 0.7,
    cosmeticChance: 0.28,
    coins: 180,
    eggSteps: 1500,
    label: "Weekly Hatch Chest",
  },
} as const;

export const ECONOMY_ITEMS: readonly EconomyItemDefinition[] = [
  {
    body: "A cozy treat that increases Bond with your active Pal.",
    id: "pal-snack",
    label: "Pal Snack",
    priceCoins: 60,
    reward: { bond: 6 },
  },
  {
    body: "A focused token that restores a little training energy.",
    id: "training-token",
    label: "Training Token",
    priceCoins: 110,
    reward: { palXp: 75 },
  },
  {
    body: "A warm boost that fills all active Eggs with progress.",
    id: "egg-booster",
    label: "Egg Booster",
    priceCoins: 140,
    reward: { eggSteps: 900 },
  },
  {
    body: "A lucky keepsake for future rarity bonuses.",
    id: "lucky-charm",
    label: "Lucky Charm",
    priceCoins: 180,
    reward: { chestProgress: 500 },
  },
];

export const ECONOMY_COSMETICS: readonly CosmeticRewardDefinition[] = [
  {
    id: "profile-frame-garden-gold",
    label: "Garden Gold Profile Frame",
    type: "profileFrame",
  },
  {
    id: "badge-style-sunlit",
    label: "Sunlit Badge Style",
    type: "badgeStyle",
  },
  {
    id: "pal-card-background-meadow",
    label: "Meadow Pal Card Background",
    type: "palCardBackground",
  },
];

export function getEconomyItem(itemId: EconomyItemId) {
  return ECONOMY_ITEMS.find((item) => item.id === itemId) ?? null;
}

export function canUseEconomyItem(data: HatchUpData, itemId: EconomyItemId) {
  return getInventoryQuantity(data, itemId) > 0;
}

export function canBuyEconomyItem(data: HatchUpData, itemId: EconomyItemId) {
  const item = getEconomyItem(itemId);
  if (!item || data.coins < item.priceCoins) return false;
  if ((item.reward.palXp || item.reward.bond) && !data.activeHatchlingId) {
    return false;
  }
  return true;
}

export function applyEconomyReward(
  data: HatchUpData,
  reward: EconomyRewardBundle,
  createdAt = new Date().toISOString(),
) {
  let next = {
    ...data,
    accountXp: data.accountXp + (reward.accountXp ?? 0),
    chestProgress: data.chestProgress + (reward.chestProgress ?? 0),
    coins: data.coins + (reward.coins ?? 0),
  };

  if ((reward.eggSteps ?? 0) > 0) {
    const activeEggs = addStepsToEggs(next.activeEggs, reward.eggSteps ?? 0);
    next = {
      ...next,
      activeEgg: activeEggs[0],
      activeEggs,
    };
  }

  if ((reward.palXp ?? 0) > 0) {
    next = addXpToActiveHatchling(next, reward.palXp ?? 0, createdAt);
  }

  if ((reward.bond ?? 0) > 0 && next.activeHatchlingId) {
    next = bondWithHatchling(
      next,
      next.activeHatchlingId,
      reward.bond ?? 0,
      createdAt,
    );
  }

  if (reward.items?.length) {
    next = {
      ...next,
      inventoryItems: addInventoryItems(next.inventoryItems, reward.items),
    };
  }

  if (reward.cosmetics?.length) {
    next = {
      ...next,
      cosmeticUnlocks: unlockCosmetics(
        next.cosmeticUnlocks,
        reward.cosmetics,
        createdAt,
      ),
    };
  }

  return {
    ...next,
    economyRewardHistory: [
      createEconomyReceipt(reward, createdAt),
      ...next.economyRewardHistory,
    ].slice(0, 40),
  };
}

export function spendInventoryItem(data: HatchUpData, itemId: EconomyItemId) {
  return {
    ...data,
    inventoryItems: data.inventoryItems
      .map((item) =>
        item.id === itemId
          ? { ...item, quantity: Math.max(item.quantity - 1, 0) }
          : item,
      )
      .filter((item) => item.quantity > 0),
  };
}

export function createWeeklyChestReward(
  chestKey: string,
  seed: number,
): EconomyRewardBundle {
  const seededChest = seed + hashText(chestKey);
  const item = rollRewardItem(seededChest);
  const cosmetic = rollCosmetic(seededChest + 31);

  return {
    accountXp: ECONOMY_BALANCE.weeklyChest.accountXp,
    coins: ECONOMY_BALANCE.weeklyChest.coins,
    cosmetics: cosmetic ? [cosmetic] : [],
    eggSteps: ECONOMY_BALANCE.weeklyChest.eggSteps,
    items: item ? [item] : [],
    label: ECONOMY_BALANCE.weeklyChest.label,
    source: "weeklyChest",
  };
}

export function getInventoryQuantity(
  data: HatchUpData,
  itemId: EconomyItemId,
) {
  return data.inventoryItems.find((item) => item.id === itemId)?.quantity ?? 0;
}

export function getCosmeticDefinition(cosmeticId: CosmeticRewardId) {
  return ECONOMY_COSMETICS.find((cosmetic) => cosmetic.id === cosmeticId) ?? null;
}

export function getEconomyRewardParts(reward: EconomyRewardBundle) {
  const parts: string[] = [];
  if ((reward.accountXp ?? 0) > 0) parts.push(`+${reward.accountXp} Journey XP`);
  if ((reward.palXp ?? 0) > 0) parts.push(`+${reward.palXp} Pal XP`);
  if ((reward.bond ?? 0) > 0) parts.push(`+${reward.bond} Bond`);
  if ((reward.coins ?? 0) > 0) parts.push(`+${reward.coins} coins`);
  if ((reward.eggSteps ?? 0) > 0) parts.push(`+${reward.eggSteps} Egg progress`);
  if ((reward.chestProgress ?? 0) > 0) {
    parts.push(`+${reward.chestProgress} Chest progress`);
  }
  if (reward.items?.length) parts.push(`${reward.items.length} item`);
  if (reward.cosmetics?.length) parts.push(`${reward.cosmetics.length} cosmetic`);
  return parts;
}

function createEconomyReceipt(
  reward: EconomyRewardBundle,
  createdAt: string,
): EconomyRewardReceipt {
  return {
    accountXp: reward.accountXp ?? 0,
    bond: reward.bond ?? 0,
    chestProgress: reward.chestProgress ?? 0,
    coins: reward.coins ?? 0,
    cosmeticIds: reward.cosmetics ?? [],
    createdAt,
    eggSteps: reward.eggSteps ?? 0,
    id: `${reward.source}:${Date.parse(createdAt)}:${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    itemIds: reward.items ?? [],
    label: reward.label,
    palXp: reward.palXp ?? 0,
    source: reward.source,
  };
}

function addInventoryItems(
  inventory: HatchUpData["inventoryItems"],
  itemIds: EconomyItemId[],
) {
  return itemIds.reduce<HatchUpData["inventoryItems"]>((items, itemId) => {
    const existing = items.find((item) => item.id === itemId);
    if (!existing) return [...items, { id: itemId, quantity: 1 }];
    return items.map((item) =>
      item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item,
    );
  }, inventory);
}

function unlockCosmetics(
  current: HatchUpData["cosmeticUnlocks"],
  cosmeticIds: CosmeticRewardId[],
  unlockedAt: string,
) {
  return cosmeticIds.reduce<HatchUpData["cosmeticUnlocks"]>((items, cosmeticId) => {
    if (items.some((item) => item.id === cosmeticId)) return items;
    const definition = getCosmeticDefinition(cosmeticId);
    if (!definition) return items;
    return [
      ...items,
      {
        id: definition.id,
        type: definition.type,
        unlockedAt,
      },
    ];
  }, current);
}

function rollRewardItem(seed: number) {
  if (seededPercent(seed) > ECONOMY_BALANCE.weeklyChest.bonusItemChance * 100) {
    return null;
  }

  return ECONOMY_ITEMS[Math.abs(seed) % ECONOMY_ITEMS.length].id;
}

function rollCosmetic(seed: number) {
  if (seededPercent(seed) > ECONOMY_BALANCE.weeklyChest.cosmeticChance * 100) {
    return null;
  }

  return ECONOMY_COSMETICS[Math.abs(seed) % ECONOMY_COSMETICS.length].id;
}

function seededPercent(seed: number) {
  const safeSeed = Math.abs(Math.floor(seed)) || 1;
  const value = (safeSeed * 9301 + 49297) % 233280;
  return (value / 233280) * 100;
}

function hashText(value: string) {
  return value.split("").reduce((total, character) => {
    return total + character.charCodeAt(0);
  }, 0);
}
