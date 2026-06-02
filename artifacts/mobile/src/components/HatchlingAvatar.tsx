import { StyleSheet, Text, View } from "react-native";
import type { EggElement, EggRarity } from "../domain/models";
import { colors } from "../theme";

interface Props {
  element: EggElement;
  rarity: EggRarity;
  size?: "small" | "large";
}

const elementColors: Record<EggElement, string> = {
  leaf: colors.baby,
  ember: colors.accent,
  tide: colors.teen,
  storm: colors.final,
};

const elementLabels: Record<EggElement, string> = {
  leaf: "LEAF",
  ember: "EMBER",
  tide: "TIDE",
  storm: "STORM",
};

export function HatchlingAvatar({ element, rarity, size = "large" }: Props) {
  return (
    <View style={[styles.wrap, styles[size]]}>
      <View style={[styles.ear, styles.leftEar, { backgroundColor: elementColors[element] }]} />
      <View style={[styles.ear, styles.rightEar, { backgroundColor: elementColors[element] }]} />
      <View style={[styles.body, { backgroundColor: elementColors[element] }]}>
        <View style={styles.face}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </View>
        <Text style={styles.label}>{elementLabels[element]}</Text>
      </View>
      <View style={styles.rarityPill}>
        <Text style={styles.rarity}>{rarity.toUpperCase()}</Text>
      </View>
    </View>
  );
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
  body: {
    alignItems: "center",
    borderColor: "rgba(37, 49, 46, 0.15)",
    borderRadius: 54,
    borderWidth: 3,
    height: "68%",
    justifyContent: "center",
    width: "62%",
  },
  ear: {
    borderColor: "rgba(37, 49, 46, 0.12)",
    borderRadius: 18,
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
    borderRadius: 7,
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
    borderRadius: 10,
    borderWidth: 1,
    bottom: "2%",
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: "absolute",
  },
  rarity: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
