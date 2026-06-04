import type { MonsterAssetMap } from "@/lib/monsters/monsterTypes";

declare const require: (path: string) => number;

export const MONSTER_ASSETS: MonsterAssetMap = {
  ember: {
    egg: {
      uncommon: require("@/assets/monsters/ember/egg_uncommon.png"),
      rare: require("@/assets/monsters/ember/egg_rare.png"),
      epic: require("@/assets/monsters/ember/egg_epic.png"),
    },
    baby: {
      epic: require("@/assets/monsters/ember/baby_epic.png"),
    },
  },
  leaf: {
    egg: {
      uncommon: require("@/assets/monsters/leaf/egg_uncommon.png"),
      rare: require("@/assets/monsters/leaf/egg_rare.png"),
      epic: require("@/assets/monsters/leaf/egg_epic.png"),
    },
  },
  storm: {
    egg: {
      uncommon: require("@/assets/monsters/storm/egg_uncommon.png"),
      rare: require("@/assets/monsters/storm/egg_rare.png"),
      epic: require("@/assets/monsters/storm/egg_epic.png"),
    },
  },
  tide: {
    egg: {
      common: require("@/assets/monsters/tide/egg_common.png"),
      uncommon: require("@/assets/monsters/tide/egg_uncommon.png"),
      rare: require("@/assets/monsters/tide/egg_rare.png"),
      epic: require("@/assets/monsters/tide/egg_epic.png"),
    },
    baby: {
      epic: require("@/assets/monsters/tide/baby_epic.png"),
    },
  },
};
