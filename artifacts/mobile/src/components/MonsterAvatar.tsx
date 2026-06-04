import { Image, StyleSheet, Text, View } from "react-native";
import { getMonsterAsset } from "../assets/creatureAssets";
import type { MonsterStage } from "../domain/progression";
import { colors, radii } from "../theme";

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
  const asset = getMonsterAsset(stage);

  if (asset) {
    return (
      <View style={[styles.wrap, styles[size]]}>
        <Image
          accessibilityLabel={`${labels[stage]} Pal journey art`}
          resizeMode="contain"
          source={asset}
          style={[styles.image, styles[`${size}Image`]]}
        />
      </View>
    );
  }

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
  image: {
    height: "100%",
  },
  largeImage: {
    width: 210,
  },
  smallImage: {
    width: 126,
  },
  body: {
    alignItems: "center",
    borderColor: colors.avatarBorder,
    borderRadius: radii.pill,
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
    borderRadius: radii.pill,
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
