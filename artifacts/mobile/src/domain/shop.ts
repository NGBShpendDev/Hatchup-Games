import type { HatchUpData } from "./models";

export type ShopItemId = "berry-bundle" | "training-charm" | "incubator-spark";

export interface ShopItem {
  body: string;
  id: ShopItemId;
  label: string;
  priceCoins: number;
  rewardAccountXp: number;
  rewardEggSteps: number;
  rewardPalXp: number;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    body: "A gentle care bundle that gives your profile a little progress.",
    id: "berry-bundle",
    label: "Berry Bundle",
    priceCoins: 60,
    rewardAccountXp: 80,
    rewardEggSteps: 0,
    rewardPalXp: 0,
  },
  {
    body: "A focused training charm for your active Pal.",
    id: "training-charm",
    label: "Training Charm",
    priceCoins: 120,
    rewardAccountXp: 0,
    rewardEggSteps: 0,
    rewardPalXp: 75,
  },
  {
    body: "A warm spark that nudges every incubating Egg forward.",
    id: "incubator-spark",
    label: "Incubator Spark",
    priceCoins: 150,
    rewardAccountXp: 0,
    rewardEggSteps: 750,
    rewardPalXp: 0,
  },
];

export function getShopItem(itemId: ShopItemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) ?? null;
}

export function canBuyShopItem(data: HatchUpData, item: ShopItem) {
  if (data.coins < item.priceCoins) return false;
  if (item.rewardPalXp > 0 && !data.activeHatchlingId) return false;
  return true;
}
