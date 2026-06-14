import { Image, StyleSheet, Text, View } from "react-native";
import { getCreatureAsset } from "../assets/creatureAssets";
import { getCreatureVisualStage } from "../domain/creatureVisuals";
import type { EggElement, EggRarity } from "../domain/models";
import { colors, elementColors, radii, rarityColors as themeRarityColors } from "../theme";

interface Props {
  element: EggElement;
  level?: number;
  rarity: EggRarity;
  size?: "small" | "large";
}

const elementLabels: Record<EggElement, string> = {
  leaf: "LEAF",
  ember: "EMBER",
  tide: "TIDE",
  storm: "STORM",
};

const rarityColors: Record<EggRarity, string> = {
  common: themeRarityColors.common,
  uncommon: themeRarityColors.uncommon,
  rare: themeRarityColors.rare,
  epic: themeRarityColors.epic,
};

export function HatchlingAvatar({ element, level = 1, rarity, size = "large" }: Props) {
  const visualStage = getCreatureVisualStage(level);
  const asset = getCreatureAsset(element, visualStage, rarity);
  const visualStageLabel = capitalize(visualStage);

  if (asset) {
    return (
      <View style={[styles.wrap, styles[size]]}>
        <View style={styles.stagePill}>
          <Text style={styles.stage}>{visualStageLabel}</Text>
        </View>
        <Image
          accessibilityLabel={`${rarity} ${element} ${visualStage} Pal art`}
          resizeMode="contain"
          source={asset}
          style={[styles.image, styles[`${size}Image`]]}
        />
        <View
          style={[styles.rarityPill, { borderColor: rarityColors[rarity] }]}
        >
          <Text style={[styles.rarity, { color: rarityColors[rarity] }]}>
            {rarity.toUpperCase()}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles[size]]}>
      <View style={styles.stagePill}>
        <Text style={styles.stage}>{visualStageLabel}</Text>
      </View>
      <View style={[styles.ear, styles.leftEar, { backgroundColor: elementColors[element] }]} />
      <View style={[styles.ear, styles.rightEar, { backgroundColor: elementColors[element] }]} />
      <View style={[styles.body, { backgroundColor: elementColors[element] }]}>
        <View style={styles.face}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </View>
        <Text style={styles.label}>{elementLabels[element]}</Text>
      </View>
      <View style={[styles.rarityPill, { borderColor: rarityColors[rarity] }]}>
        <Text style={[styles.rarity, { color: rarityColors[rarity] }]}>
          {rarity.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  large: {
    height: 158,
  },
  small: {
    height: 94,
  },
  image: {
    height: "100%",
  },
  largeImage: {
    width: 172,
  },
  smallImage: {
    width: 102,
  },
  body: {
    alignItems: "center",
    borderColor: colors.avatarBorder,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: "68%",
    justifyContent: "center",
    width: "62%",
  },
  ear: {
    borderColor: colors.avatarBorder,
    borderRadius: radii.card,
    borderWidth: 2,
    height: "26%",
    position: "absolute",
    top: "10%",
    width: "22%",
  },
  leftEar: {
    left: "16%",
    transform: [{ rotate: "-22deg" }],
  },
  rightEar: {
    right: "16%",
    transform: [{ rotate: "22deg" }],
  },
  face: {
    flexDirection: "row",
    gap: 17,
    marginBottom: 10,
  },
  eye: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 13,
    width: 13,
  },
  label: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  rarityPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    bottom: "2%",
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: "absolute",
  },
  stagePill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: "absolute",
    top: 0,
    zIndex: 2,
  },
  stage: {
    color: colors.primaryText,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  rarity: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
