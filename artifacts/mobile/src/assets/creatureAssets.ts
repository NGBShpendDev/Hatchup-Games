import type { ImageSourcePropType } from "react-native";
import type { CreatureVisualStage } from "../domain/creatureVisuals";
import type { EggElement, EggRarity } from "../domain/models";
import type { MonsterStage } from "../domain/progression";

import eggEmberCommon from "../../assets/creatures/eggs/egg_ember_common.png";
import eggEmberEpic from "../../assets/creatures/eggs/egg_ember_epic.png";
import eggEmberRare from "../../assets/creatures/eggs/egg_ember_rare.png";
import eggEmberUncommon from "../../assets/creatures/eggs/egg_ember_uncommon.png";
import eggLeafCommon from "../../assets/creatures/eggs/egg_leaf_common.png";
import eggLeafEpic from "../../assets/creatures/eggs/egg_leaf_epic.png";
import eggLeafRare from "../../assets/creatures/eggs/egg_leaf_rare.png";
import eggLeafUncommon from "../../assets/creatures/eggs/egg_leaf_uncommon.png";
import eggStormCommon from "../../assets/creatures/eggs/egg_storm_common.png";
import eggStormEpic from "../../assets/creatures/eggs/egg_storm_epic.png";
import eggStormRare from "../../assets/creatures/eggs/egg_storm_rare.png";
import eggStormUncommon from "../../assets/creatures/eggs/egg_storm_uncommon.png";
import eggTideCommon from "../../assets/creatures/eggs/egg_tide_common.png";
import eggTideEpic from "../../assets/creatures/eggs/egg_tide_epic.png";
import eggTideRare from "../../assets/creatures/eggs/egg_tide_rare.png";
import eggTideUncommon from "../../assets/creatures/eggs/egg_tide_uncommon.png";
import hatchlingEmberCommon from "../../assets/creatures/hatchlings/hatchling_ember_common.png";
import hatchlingEmberEpic from "../../assets/creatures/hatchlings/hatchling_ember_epic.png";
import hatchlingEmberRare from "../../assets/creatures/hatchlings/hatchling_ember_rare.png";
import hatchlingEmberUncommon from "../../assets/creatures/hatchlings/hatchling_ember_uncommon.png";
import hatchlingStormCommon from "../../assets/creatures/hatchlings/hatchling_storm_common.png";
import hatchlingStormRare from "../../assets/creatures/hatchlings/hatchling_storm_rare.png";
import hatchlingStormUncommon from "../../assets/creatures/hatchlings/hatchling_storm_uncommon.png";
import hatchlingTideCommon from "../../assets/creatures/hatchlings/hatchling_tide_common.png";
import hatchlingTideEpic from "../../assets/creatures/hatchlings/hatchling_tide_epic.png";
import hatchlingTideRare from "../../assets/creatures/hatchlings/hatchling_tide_rare.png";
import hatchlingTideUncommon from "../../assets/creatures/hatchlings/hatchling_tide_uncommon.png";
import emberBabyCommon from "../../assets/creatures/staged/ember_baby_common.png";
import emberBabyEpic from "../../assets/creatures/staged/ember_baby_epic.png";
import emberBabyRare from "../../assets/creatures/staged/ember_baby_rare.png";
import emberBabyUncommon from "../../assets/creatures/staged/ember_baby_uncommon.png";
import emberFinalCommon from "../../assets/creatures/staged/ember_final_common.png";
import emberFinalEpic from "../../assets/creatures/staged/ember_final_epic.png";
import emberFinalRare from "../../assets/creatures/staged/ember_final_rare.png";
import emberFinalUncommon from "../../assets/creatures/staged/ember_final_uncommon.png";
import emberTeenCommon from "../../assets/creatures/staged/ember_teen_common.png";
import emberTeenEpic from "../../assets/creatures/staged/ember_teen_epic.png";
import emberTeenRare from "../../assets/creatures/staged/ember_teen_rare.png";
import emberTeenUncommon from "../../assets/creatures/staged/ember_teen_uncommon.png";
import leafBabyCommon from "../../assets/creatures/staged/leaf_baby_common.png";
import leafBabyEpic from "../../assets/creatures/staged/leaf_baby_epic.png";
import leafBabyRare from "../../assets/creatures/staged/leaf_baby_rare.png";
import leafBabyUncommon from "../../assets/creatures/staged/leaf_baby_uncommon.png";
import leafFinalCommon from "../../assets/creatures/staged/leaf_final_common.png";
import leafFinalEpic from "../../assets/creatures/staged/leaf_final_epic.png";
import leafFinalRare from "../../assets/creatures/staged/leaf_final_rare.png";
import leafFinalUncommon from "../../assets/creatures/staged/leaf_final_uncommon.png";
import leafTeenCommon from "../../assets/creatures/staged/leaf_teen_common.png";
import leafTeenEpic from "../../assets/creatures/staged/leaf_teen_epic.png";
import leafTeenRare from "../../assets/creatures/staged/leaf_teen_rare.png";
import leafTeenUncommon from "../../assets/creatures/staged/leaf_teen_uncommon.png";
import monsterBaby from "../../assets/creatures/monster/monster_baby.png";
import monsterEgg from "../../assets/creatures/monster/monster_egg.png";
import monsterFinal from "../../assets/creatures/monster/monster_final.png";
import monsterTeen from "../../assets/creatures/monster/monster_teen.png";
import stormBabyCommon from "../../assets/creatures/staged/storm_baby_common.png";
import stormBabyEpic from "../../assets/creatures/staged/storm_baby_epic.png";
import stormBabyRare from "../../assets/creatures/staged/storm_baby_rare.png";
import stormBabyUncommon from "../../assets/creatures/staged/storm_baby_uncommon.png";
import stormFinalCommon from "../../assets/creatures/staged/storm_final_common.png";
import stormFinalEpic from "../../assets/creatures/staged/storm_final_epic.png";
import stormFinalRare from "../../assets/creatures/staged/storm_final_rare.png";
import stormFinalUncommon from "../../assets/creatures/staged/storm_final_uncommon.png";
import stormTeenCommon from "../../assets/creatures/staged/storm_teen_common.png";
import stormTeenEpic from "../../assets/creatures/staged/storm_teen_epic.png";
import stormTeenRare from "../../assets/creatures/staged/storm_teen_rare.png";
import stormTeenUncommon from "../../assets/creatures/staged/storm_teen_uncommon.png";
import tideBabyCommon from "../../assets/creatures/staged/tide_baby_common.png";
import tideBabyEpic from "../../assets/creatures/staged/tide_baby_epic.png";
import tideBabyRare from "../../assets/creatures/staged/tide_baby_rare.png";
import tideBabyUncommon from "../../assets/creatures/staged/tide_baby_uncommon.png";
import tideFinalCommon from "../../assets/creatures/staged/tide_final_common.png";
import tideFinalEpic from "../../assets/creatures/staged/tide_final_epic.png";
import tideFinalRare from "../../assets/creatures/staged/tide_final_rare.png";
import tideFinalUncommon from "../../assets/creatures/staged/tide_final_uncommon.png";
import tideTeenCommon from "../../assets/creatures/staged/tide_teen_common.png";
import tideTeenEpic from "../../assets/creatures/staged/tide_teen_epic.png";
import tideTeenRare from "../../assets/creatures/staged/tide_teen_rare.png";
import tideTeenUncommon from "../../assets/creatures/staged/tide_teen_uncommon.png";

type EggAssetMap = Partial<
  Record<EggElement, Partial<Record<EggRarity, ImageSourcePropType>>>
>;

type HatchlingAssetMap = Partial<
  Record<EggElement, Partial<Record<EggRarity, ImageSourcePropType>>>
>;

type StagedCreatureAssetMap = Partial<
  Record<
    EggElement,
    Partial<Record<CreatureVisualStage, Partial<Record<EggRarity, ImageSourcePropType>>>>
  >
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
    epic: eggEmberEpic,
    rare: eggEmberRare,
    uncommon: eggEmberUncommon,
  },
  leaf: {
    common: eggLeafCommon,
    epic: eggLeafEpic,
    rare: eggLeafRare,
    uncommon: eggLeafUncommon,
  },
  storm: {
    common: eggStormCommon,
    epic: eggStormEpic,
    rare: eggStormRare,
    uncommon: eggStormUncommon,
  },
  tide: {
    common: eggTideCommon,
    epic: eggTideEpic,
    rare: eggTideRare,
    uncommon: eggTideUncommon,
  },
};

const hatchlingAssets: HatchlingAssetMap = {
  ember: {
    common: hatchlingEmberCommon,
    epic: hatchlingEmberEpic,
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
    epic: hatchlingTideEpic,
    rare: hatchlingTideRare,
    uncommon: hatchlingTideUncommon,
  },
};

const stagedCreatureAssets: StagedCreatureAssetMap = {
  ember: {
    baby: {
      common: emberBabyCommon,
      epic: emberBabyEpic,
      rare: emberBabyRare,
      uncommon: emberBabyUncommon,
    },
    final: {
      common: emberFinalCommon,
      epic: emberFinalEpic,
      rare: emberFinalRare,
      uncommon: emberFinalUncommon,
    },
    teen: {
      common: emberTeenCommon,
      epic: emberTeenEpic,
      rare: emberTeenRare,
      uncommon: emberTeenUncommon,
    },
  },
  leaf: {
    baby: {
      common: leafBabyCommon,
      epic: leafBabyEpic,
      rare: leafBabyRare,
      uncommon: leafBabyUncommon,
    },
    final: {
      common: leafFinalCommon,
      epic: leafFinalEpic,
      rare: leafFinalRare,
      uncommon: leafFinalUncommon,
    },
    teen: {
      common: leafTeenCommon,
      epic: leafTeenEpic,
      rare: leafTeenRare,
      uncommon: leafTeenUncommon,
    },
  },
  storm: {
    baby: {
      common: stormBabyCommon,
      epic: stormBabyEpic,
      rare: stormBabyRare,
      uncommon: stormBabyUncommon,
    },
    final: {
      common: stormFinalCommon,
      epic: stormFinalEpic,
      rare: stormFinalRare,
      uncommon: stormFinalUncommon,
    },
    teen: {
      common: stormTeenCommon,
      epic: stormTeenEpic,
      rare: stormTeenRare,
      uncommon: stormTeenUncommon,
    },
  },
  tide: {
    baby: {
      common: tideBabyCommon,
      epic: tideBabyEpic,
      rare: tideBabyRare,
      uncommon: tideBabyUncommon,
    },
    final: {
      common: tideFinalCommon,
      epic: tideFinalEpic,
      rare: tideFinalRare,
      uncommon: tideFinalUncommon,
    },
    teen: {
      common: tideTeenCommon,
      epic: tideTeenEpic,
      rare: tideTeenRare,
      uncommon: tideTeenUncommon,
    },
  },
};

export function getMonsterAsset(stage: MonsterStage) {
  return monsterAssets[stage];
}

export function getEggAsset(element: EggElement, rarity: EggRarity) {
  return eggAssets[element]?.[rarity] ?? eggAssets[element]?.common ?? null;
}

export function getHatchlingAsset(element: EggElement, rarity: EggRarity) {
  return hatchlingAssets[element]?.[rarity] ?? null;
}

export function getCreatureAsset(
  element: EggElement,
  stage: CreatureVisualStage,
  rarity: EggRarity,
) {
  return stagedCreatureAssets[element]?.[stage]?.[rarity] ?? getHatchlingAsset(element, rarity);
}
