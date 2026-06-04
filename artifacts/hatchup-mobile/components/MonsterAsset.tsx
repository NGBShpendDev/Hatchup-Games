import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { GenerativeCreature } from "@/components/GenerativeCreature";
import { EggAsset } from "@/components/EggAsset";
import {
  getMonsterAsset,
  getMonsterIdentity,
  monsterElementToRealm,
} from "@/lib/monsters/monsterHelpers";

interface MonsterAssetProps {
  monster?: {
    id?: number | null;
    element?: string | null;
    realm?: string | null;
    eggType?: string | null;
    rarity?: string | null;
    evolutionStage?: string | number | null;
    stage?: string | number | null;
    isShiny?: boolean | null;
    genetics?: { realm?: string | null } | null;
  };
  id?: number;
  element?: string | null;
  stage?: string | number | null;
  rarity?: string | null;
  size?: number;
}

export function MonsterAsset({
  monster,
  id,
  element,
  stage,
  rarity,
  size = 110,
}: MonsterAssetProps) {
  const identity = getMonsterIdentity({
    element: element ?? monster?.element,
    eggType: monster?.eggType,
    realm: monster?.realm ?? monster?.genetics?.realm,
    stage: stage ?? monster?.stage ?? monster?.evolutionStage,
    rarity: rarity ?? monster?.rarity,
  });
  const monsterId = id ?? monster?.id ?? 0;

  if (identity.stage === "egg") {
    return (
      <EggAsset
        id={monsterId}
        element={identity.element}
        rarity={identity.rarity}
        size={size}
      />
    );
  }

  const asset = getMonsterAsset(identity);
  if (!asset) {
    return (
      <GenerativeCreature
        creature={{
          id: monsterId,
          realm: monsterElementToRealm(identity.element),
          rarity: identity.rarity,
          isShiny: monster?.isShiny,
        }}
        size={size}
      />
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Image source={asset} resizeMode="contain" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { height: "100%", width: "100%" },
});
