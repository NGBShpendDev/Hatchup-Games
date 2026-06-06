import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii } from "../theme";

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReducedMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

export function CardEntrance({
  children,
  delay = 0,
  distance = 10,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }

    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      delay,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, entrance, reducedMotion]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [distance, 0],
  });

  return (
    <Animated.View
      style={[style, { opacity: entrance, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}

export function EggReadyPulse({
  active,
  children,
  style,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, pulse, reducedMotion]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

export function HatchCelebration({ active }: { active: boolean }) {
  const reducedMotion = useReducedMotion();
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      burst.setValue(active ? 1 : 0);
      return;
    }

    burst.setValue(0);
    const animation = Animated.timing(burst, {
      duration: 680,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, burst, reducedMotion]);

  if (!active) return null;

  const opacity = burst.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 1, 0],
  });
  const scale = burst.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1.25],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.celebration, { opacity, transform: [{ scale }] }]}
    >
      <View style={[styles.celebrationDot, styles.celebrationDotTop]} />
      <View style={[styles.celebrationDot, styles.celebrationDotRight]} />
      <View style={[styles.celebrationDot, styles.celebrationDotBottom]} />
      <View style={[styles.celebrationDot, styles.celebrationDotLeft]} />
    </Animated.View>
  );
}

export function SyncSuccessShimmer({
  active,
  style,
}: {
  active: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      shimmer.setValue(1);
      return;
    }

    shimmer.setValue(0);
    const animation = Animated.timing(shimmer, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, reducedMotion, shimmer]);

  if (!active || reducedMotion) return null;

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 360],
  });
  const opacity = shimmer.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: [0, 0.28, 0.28, 0],
  });

  return (
    <View pointerEvents="none" style={[styles.shimmerClip, style]}>
      <Animated.View
        style={[
          styles.shimmerBand,
          { opacity, transform: [{ translateX }, { rotate: "-16deg" }] },
        ]}
      />
    </View>
  );
}

export function ActiveTabTransition({
  active,
  children,
  style,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(active ? 1 : 0);
      return;
    }

    const animation = Animated.timing(progress, {
      duration: 180,
      easing: Easing.out(Easing.quad),
      toValue: active ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, progress, reducedMotion]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  celebration: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  celebrationDot: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    height: 8,
    position: "absolute",
    width: 8,
  },
  celebrationDotTop: {
    top: 8,
  },
  celebrationDotRight: {
    right: 12,
  },
  celebrationDotBottom: {
    bottom: 10,
  },
  celebrationDotLeft: {
    left: 12,
  },
  shimmerBand: {
    backgroundColor: colors.rewardGold,
    height: "190%",
    left: 0,
    position: "absolute",
    top: "-45%",
    width: 70,
  },
  shimmerClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.card,
    overflow: "hidden",
  },
});
