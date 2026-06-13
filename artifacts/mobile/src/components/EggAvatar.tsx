import { Image, StyleSheet, Text, View } from "react-native";
import { getEggAsset } from "../assets/creatureAssets";
import type { EggElement, EggRarity } from "../domain/models";
import { colors, radii, rarityColors as themeRarityColors } from "../theme";

interface Props {
  element: EggElement;
  rarity: EggRarity;
  size?: "small" | "large";
}

const elementLabels: Record<EggElement, string> = {
  leaf: "LEAF",
  ember: "EMBER",
  tide: "TIDE",
  storm: "STORM",
};

const eggRarityColors: Record<EggRarity, string> = {
  common: themeRarityColors.common,
  uncommon: themeRarityColors.uncommon,
  rare: themeRarityColors.rare,
  epic: themeRarityColors.epic,
};

export function EggAvatar({ element, rarity, size = "large" }: Props) {
  const asset = getEggAsset(element, rarity);

  if (asset) {
    return (
      <View style={[styles.wrap, styles[size]]}>
        <Image
          accessibilityLabel={`${rarity} ${element} Egg art`}
          resizeMode="contain"
          source={asset}
          style={[styles.image, styles[`${size}Image`]]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles[size]]}>
      <View style={[styles.egg, { backgroundColor: eggRarityColors[rarity] }]}>
        <View style={styles.spotRow}>
          <View style={styles.spot} />
          <View style={[styles.spot, styles.smallSpot]} />
        </View>
        <Text style={styles.label}>{elementLabels[element]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  large: {
    height: 144,
  },
  small: {
    height: 82,
  },
  image: {
    height: "100%",
  },
  largeImage: {
    width: 144,
  },
  smallImage: {
    width: 88,
  },
  egg: {
    alignItems: "center",
    borderColor: colors.avatarBorder,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: "88%",
    justifyContent: "center",
    width: "55%",
  },
  spotRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  spot: {
    backgroundColor: colors.translucentSurface,
    borderRadius: radii.pill,
    height: 20,
    width: 20,
  },
  smallSpot: {
    height: 13,
    width: 13,
  },
  label: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
