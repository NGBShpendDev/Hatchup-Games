import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

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
    backgroundColor: colors.line,
    borderRadius: 6,
    height: 11,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    height: "100%",
  },
});
