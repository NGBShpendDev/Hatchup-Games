import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { GenerativeEgg } from "@/components/GenerativeEgg";
import { getEggAsset, getMonsterIdentity } from "@/lib/monsters/monsterHelpers";

interface EggAssetProps {
  egg?: {
    id?: number | null;
    type?: string | null;
    eggType?: string | null;
    element?: string | null;
    rarity?: string | null;
  };
  id?: number;
  element?: string | null;
  rarity?: string | null;
  size?: number;
}

export function EggAsset({ egg, id, element, rarity, size = 90 }: EggAssetProps) {
  const identity = getMonsterIdentity({
    element: element ?? egg?.element,
    eggType: egg?.eggType ?? egg?.type,
    rarity: rarity ?? egg?.rarity,
    stage: "egg",
  });
  const asset = getEggAsset(identity);
  const eggId = id ?? egg?.id ?? 0;

  if (!asset) {
    return (
      <GenerativeEgg
        egg={{ id: eggId, type: identity.element, rarity: identity.rarity }}
        size={size}
      />
    );
  }

  return (
    <View style={{ width: size, height: Math.round(size * 1.2) }}>
      <Image source={asset} resizeMode="contain" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { height: "100%", width: "100%" },
});
