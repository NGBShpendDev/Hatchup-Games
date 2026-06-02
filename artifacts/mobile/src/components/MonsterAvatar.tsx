import { StyleSheet, Text, View } from "react-native";
import type { MonsterStage } from "../domain/progression";
import { colors } from "../theme";

interface Props {
  stage: MonsterStage;
  size?: "small" | "large";
}

const labels: Record<MonsterStage, string> = {
  egg: "EGG",
  baby: "BABY",
  teen: "TEEN",
  final: "FINAL",
};

export function MonsterAvatar({ size = "large", stage }: Props) {
  return (
    <View style={[styles.wrap, styles[size]]}>
      <View style={[styles.body, styles[`${stage}Body`]]}>
        {stage !== "egg" && (
          <View style={styles.face}>
            <View style={styles.eye} />
            <View style={styles.eye} />
          </View>
        )}
        <Text style={styles.label}>{labels[stage]}</Text>
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
    height: 190,
  },
  small: {
    height: 116,
  },
  body: {
    alignItems: "center",
    borderColor: "rgba(37, 49, 46, 0.15)",
    borderRadius: 90,
    borderWidth: 4,
    height: "88%",
    justifyContent: "center",
    width: "62%",
  },
  eggBody: {
    backgroundColor: colors.egg,
  },
  babyBody: {
    backgroundColor: colors.baby,
  },
  teenBody: {
    backgroundColor: colors.teen,
  },
  finalBody: {
    backgroundColor: colors.final,
  },
  face: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 18,
  },
  eye: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    height: 15,
    width: 15,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
