import {
  canBuyEconomyItem,
  ECONOMY_ITEMS,
  getEconomyItem,
} from "./economy";
import type { EconomyItemId, HatchUpData } from "./models";

export type ShopItemId = EconomyItemId;

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
  ...ECONOMY_ITEMS.map((item) => ({
    body: item.body,
    id: item.id,
    label: item.label,
    priceCoins: item.priceCoins,
    rewardAccountXp: item.reward.accountXp ?? 0,
    rewardEggSteps: item.reward.eggSteps ?? 0,
    rewardPalXp: item.reward.palXp ?? 0,
  })),
];

export function getShopItem(itemId: ShopItemId) {
  const item = getEconomyItem(itemId);
  if (!item) return null;
  return (
    SHOP_ITEMS.find((shopItem) => shopItem.id === item.id) ?? null
  );
}

export function canBuyShopItem(data: HatchUpData, item: ShopItem) {
  return canBuyEconomyItem(data, item.id);
}
