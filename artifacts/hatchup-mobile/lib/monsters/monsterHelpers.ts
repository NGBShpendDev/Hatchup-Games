import { MONSTER_ASSETS } from "@/constants/monsterAssets";
import {
  MONSTER_ELEMENTS,
  MONSTER_RARITIES,
  MONSTER_STAGES,
  type MonsterAssetKey,
  type MonsterElement,
  type MonsterIdentity,
  type MonsterRarity,
  type MonsterStage,
} from "./monsterTypes";

const ELEMENT_ALIASES: Record<string, MonsterElement> = {
  air: "storm",
  electric: "storm",
  ember: "ember",
  fire: "ember",
  leaf: "leaf",
  nature: "leaf",
  plant: "leaf",
  storm: "storm",
  tide: "tide",
  water: "tide",
};

const STAGE_ALIASES: Record<string, MonsterStage> = {
  0: "egg",
  1: "baby",
  2: "teen",
  3: "final",
  baby: "baby",
  cute: "baby",
  egg: "egg",
  final: "final",
  legendary: "final",
  teen: "teen",
  athletic: "teen",
};

export function normalizeMonsterElement(value?: string | null): MonsterElement {
  const key = value?.trim().toLowerCase() ?? "";
  if (isMonsterElement(key)) return key;
  return ELEMENT_ALIASES[key] ?? "leaf";
}

export function normalizeMonsterStage(value?: string | number | null): MonsterStage {
  const key = String(value ?? "baby").trim().toLowerCase();
  if (isMonsterStage(key)) return key;
  return STAGE_ALIASES[key] ?? "baby";
}

export function normalizeMonsterRarity(value?: string | null): MonsterRarity {
  const key = value?.trim().toLowerCase() ?? "";
  if (isMonsterRarity(key)) return key;
  return "common";
}

export function getMonsterIdentity(input: {
  element?: string | null;
  eggType?: string | null;
  realm?: string | null;
  stage?: string | number | null;
  evolutionStage?: string | number | null;
  rarity?: string | null;
}): MonsterIdentity {
  return {
    element: normalizeMonsterElement(input.element ?? input.eggType ?? input.realm),
    stage: normalizeMonsterStage(input.stage ?? input.evolutionStage),
    rarity: normalizeMonsterRarity(input.rarity),
  };
}

export function getMonsterAssetKey(identity: MonsterIdentity): MonsterAssetKey {
  return `${identity.element}.${identity.stage}.${identity.rarity}`;
}

export function getMonsterAsset(identity: MonsterIdentity) {
  const elementAssets = MONSTER_ASSETS[identity.element];
  const stageAssets = elementAssets?.[identity.stage];
  return (
    stageAssets?.[identity.rarity] ??
    stageAssets?.common ??
    elementAssets?.baby?.[identity.rarity] ??
    elementAssets?.baby?.common ??
    null
  );
}

export function getEggAsset(identity: Pick<MonsterIdentity, "element" | "rarity">) {
  return getMonsterAsset({ ...identity, stage: "egg" });
}

export function monsterElementToRealm(element: MonsterElement) {
  switch (element) {
    case "ember":
      return "strength";
    case "storm":
      return "cardio";
    case "tide":
      return "balance";
    case "leaf":
    default:
      return "beast";
  }
}

function isMonsterElement(value: string): value is MonsterElement {
  return (MONSTER_ELEMENTS as readonly string[]).indexOf(value) >= 0;
}

function isMonsterStage(value: string): value is MonsterStage {
  return (MONSTER_STAGES as readonly string[]).indexOf(value) >= 0;
}

function isMonsterRarity(value: string): value is MonsterRarity {
  return (MONSTER_RARITIES as readonly string[]).indexOf(value) >= 0;
}
