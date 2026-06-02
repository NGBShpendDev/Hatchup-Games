import type { ImageSourcePropType } from "react-native";
import type { EggElement, EggRarity } from "../domain/models";
import type { MonsterStage } from "../domain/progression";

import eggEmberCommon from "../../assets/creatures/eggs/egg_ember_common.png";
import eggLeafCommon from "../../assets/creatures/eggs/egg_leaf_common.png";
import eggStormCommon from "../../assets/creatures/eggs/egg_storm_common.png";
import hatchlingEmberCommon from "../../assets/creatures/hatchlings/hatchling_ember_common.png";
import hatchlingEmberRare from "../../assets/creatures/hatchlings/hatchling_ember_rare.png";
import hatchlingEmberUncommon from "../../assets/creatures/hatchlings/hatchling_ember_uncommon.png";
import hatchlingStormCommon from "../../assets/creatures/hatchlings/hatchling_storm_common.png";
import hatchlingStormRare from "../../assets/creatures/hatchlings/hatchling_storm_rare.png";
import hatchlingStormUncommon from "../../assets/creatures/hatchlings/hatchling_storm_uncommon.png";
import hatchlingTideCommon from "../../assets/creatures/hatchlings/hatchling_tide_common.png";
import hatchlingTideRare from "../../assets/creatures/hatchlings/hatchling_tide_rare.png";
import hatchlingTideUncommon from "../../assets/creatures/hatchlings/hatchling_tide_uncommon.png";
import monsterBaby from "../../assets/creatures/monster/monster_baby.png";
import monsterEgg from "../../assets/creatures/monster/monster_egg.png";
import monsterFinal from "../../assets/creatures/monster/monster_final.png";
import monsterTeen from "../../assets/creatures/monster/monster_teen.png";

type EggAssetMap = Partial<
  Record<EggElement, Partial<Record<EggRarity, ImageSourcePropType>>>
>;

type HatchlingAssetMap = Partial<
  Record<EggElement, Partial<Record<EggRarity, ImageSourcePropType>>>
>;

const monsterAssets: Record<MonsterStage, ImageSourcePropType> = {
  baby: monsterBaby,
  egg: monsterEgg,
  final: monsterFinal,
  teen: monsterTeen,
};

const eggAssets: EggAssetMap = {
  ember: {
    common: eggEmberCommon,
  },
  leaf: {
    common: eggLeafCommon,
  },
  storm: {
    common: eggStormCommon,
  },
};

const hatchlingAssets: HatchlingAssetMap = {
  ember: {
    common: hatchlingEmberCommon,
    rare: hatchlingEmberRare,
    uncommon: hatchlingEmberUncommon,
  },
  storm: {
    common: hatchlingStormCommon,
    rare: hatchlingStormRare,
    uncommon: hatchlingStormUncommon,
  },
  tide: {
    common: hatchlingTideCommon,
    rare: hatchlingTideRare,
    uncommon: hatchlingTideUncommon,
  },
};

export function getMonsterAsset(stage: MonsterStage) {
  return monsterAssets[stage];
}

export function getEggAsset(element: EggElement, rarity: EggRarity) {
  if (rarity === "epic") {
    return null;
  }

  return eggAssets[element]?.[rarity] ?? eggAssets[element]?.common ?? null;
}

export function getHatchlingAsset(element: EggElement, rarity: EggRarity) {
  return hatchlingAssets[element]?.[rarity] ?? null;
}
