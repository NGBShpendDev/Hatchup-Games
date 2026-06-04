import { StyleSheet, View } from "react-native";
import { colors, radii } from "../theme";

export function ProgressBar({ progress }: { progress: number }) {
  const width = `${progress * 100}%` as `${number}%`;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 12,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    height: "100%",
  },
});
