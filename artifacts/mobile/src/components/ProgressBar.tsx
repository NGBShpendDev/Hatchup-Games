import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, gameColors, radii } from "../theme";
import { useReducedMotion } from "../utils/animations";

export function ProgressBar({ progress }: { progress: number }) {
  const reducedMotion = useReducedMotion();
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const fill = useRef(new Animated.Value(clampedProgress)).current;

  useEffect(() => {
    if (reducedMotion) {
      fill.setValue(clampedProgress);
      return;
    }

    const animation = Animated.timing(fill, {
      duration: 420,
      toValue: clampedProgress,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [clampedProgress, fill, reducedMotion]);

  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: gameColors.progressTrack,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.pill,
    height: 12,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: gameColors.progressFill,
    borderRadius: radii.pill,
    height: "100%",
  },
});
