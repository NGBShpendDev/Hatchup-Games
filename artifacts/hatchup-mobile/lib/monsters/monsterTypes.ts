import type { ImageSourcePropType } from "react-native";

export const MONSTER_ELEMENTS = ["leaf", "ember", "tide", "storm"] as const;
export const MONSTER_STAGES = ["egg", "baby", "teen", "final"] as const;
export const MONSTER_RARITIES = ["common", "uncommon", "rare", "epic"] as const;

export type MonsterElement = (typeof MONSTER_ELEMENTS)[number];
export type MonsterStage = (typeof MONSTER_STAGES)[number];
export type MonsterRarity = (typeof MONSTER_RARITIES)[number];

export type MonsterAssetKey = `${MonsterElement}.${MonsterStage}.${MonsterRarity}`;

export type MonsterAssetMap = Partial<
  Record<MonsterElement, Partial<Record<MonsterStage, Partial<Record<MonsterRarity, ImageSourcePropType>>>>>
>;

export interface MonsterIdentity {
  element: MonsterElement;
  stage: MonsterStage;
  rarity: MonsterRarity;
}
