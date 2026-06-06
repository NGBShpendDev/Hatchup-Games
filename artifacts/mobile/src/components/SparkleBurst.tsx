import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { useReducedMotion } from "../utils/animations";

interface Props {
  label?: string;
  loop?: boolean;
  tone?: "accent" | "primary";
}

export function SparkleBurst({ label, loop = false, tone = "primary" }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(1);
      return;
    }

    pulse.setValue(0);
    const sequence = Animated.sequence([
      Animated.timing(pulse, {
        duration: 720,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        duration: 720,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);
    const animation = loop ? Animated.loop(sequence) : sequence;
    animation.start();
    return () => animation.stop();
  }, [loop, pulse, reducedMotion]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.08],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });
  const color = tone === "accent" ? colors.accent : colors.primary;

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ scale }] }]}>
      <Text style={[styles.spark, { color }]}>*</Text>
      {label ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
      <Text style={[styles.spark, { color }]}>*</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  spark: {
    fontSize: 13,
    fontWeight: "900",
  },
  label: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
