import { StyleSheet, Text, View } from "react-native";
import type { EggElement, EggRarity } from "../domain/models";
import { colors } from "../theme";

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

const rarityColors: Record<EggRarity, string> = {
  common: colors.egg,
  uncommon: colors.baby,
  rare: colors.teen,
  epic: colors.final,
};

export function EggAvatar({ element, rarity, size = "large" }: Props) {
  return (
    <View style={[styles.wrap, styles[size]]}>
      <View style={[styles.egg, { backgroundColor: rarityColors[rarity] }]}>
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
  egg: {
    alignItems: "center",
    borderColor: "rgba(37, 49, 46, 0.15)",
    borderRadius: 62,
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
    backgroundColor: "rgba(255, 255, 255, 0.52)",
    borderRadius: 12,
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
