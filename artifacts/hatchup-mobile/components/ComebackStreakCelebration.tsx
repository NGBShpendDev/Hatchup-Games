import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export interface ComebackStreakData {
  palName: string;
  streakCount: number;
}

interface Props {
  data: ComebackStreakData | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;
const FIRE_COLOR = "#f97316";
const FIRE_GLOW = "rgba(249,115,22,0.35)";

function FireParticle({ delay }: { delay: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  const startX = (Math.random() - 0.5) * 280;
  const driftX = (Math.random() - 0.5) * 80;
  const duration = 1200 + Math.random() * 1000;
  const size = 10 + Math.random() * 18;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.9, duration: duration * 0.2, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: duration * 0.8, useNativeDriver: true }),
          ]),
          Animated.timing(translateY, { toValue: -300 - Math.random() * 200, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(translateX, { toValue: driftX, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1, duration: duration * 0.3, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.2, duration: duration * 0.7, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const FIRE_COLORS = ["#f97316", "#ef4444", "#fbbf24", "#f43f5e", "#fb923c", "#fcd34d", "#dc2626"];
  const color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left: "50%" as any,
          bottom: 0,
          opacity,
          transform: [{ translateX: Animated.add(translateX, new Animated.Value(startX)) }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

function FireIcon() {
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(rotate, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: -1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  const rotateDeg = rotate.interpolate({ inputRange: [-1, 1], outputRange: ["-6deg", "6deg"] });

  return (
    <Animated.Text style={[styles.fireEmoji, { transform: [{ scale }, { rotate: rotateDeg }] }]}>
      🔥
    </Animated.Text>
  );
}

function PulsingRing() {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const borderWidth = glow.interpolate({ inputRange: [0, 1], outputRange: [2, 4] });
  const borderOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <Animated.View style={[styles.ringOuter, { borderWidth, borderColor: FIRE_COLOR, opacity: borderOpacity }]}>
      <FireIcon />
    </Animated.View>
  );
}

function BonusBadge({ children, borderColor, textColor, bg }: {
  children: string; borderColor: string; textColor: string; bg: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.bonusBadge, { borderColor, backgroundColor: bg, transform: [{ scale }] }]}>
      <Text style={[styles.bonusText, { color: textColor }]}>{children}</Text>
    </Animated.View>
  );
}

const PARTICLE_COUNT = 18;

export function ComebackStreakCelebration({ data, onDismiss }: Props) {
  const cardScale = useRef(new Animated.Value(0.5)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const subtitleOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!data) return;

    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, damping: 16, stiffness: 280, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(subtitleOpacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(t);
      cardScale.setValue(0.5);
      cardOpacity.setValue(0);
      overlayOpacity.setValue(0);
    };
  }, [data]);

  const particles = React.useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => ({ id: i, delay: (i / PARTICLE_COUNT) * 1500 })),
    []
  );

  return (
    <Modal
      visible={!!data}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

        {/* Fire particles */}
        <View style={styles.particleContainer} pointerEvents="none">
          {particles.map((p) => (
            <FireParticle key={p.id} delay={p.delay} />
          ))}
        </View>

        {/* Card */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.card,
              { transform: [{ scale: cardScale }], opacity: cardOpacity },
            ]}
          >
            <PulsingRing />

            <View style={styles.textBlock}>
              <Animated.Text style={[styles.eyebrow, { opacity: subtitleOpacity }]}>
                Comeback Streak!
              </Animated.Text>
              <Text style={styles.headline}>Unstoppable!</Text>
              <Text style={styles.streakLine}>
                {data?.streakCount ?? 0} consecutive comebacks
              </Text>
            </View>

            <Text style={styles.palLine}>{data?.palName ?? ""} is on fire!</Text>

            <View style={styles.bonusRow}>
              <BonusBadge borderColor="#eab30860" textColor="#eab308" bg="#eab30818">
                ⚡ +50 XP
              </BonusBadge>
              <BonusBadge borderColor="#f9731660" textColor={FIRE_COLOR} bg="#f9731618">
                ❤️ +5 Loyalty
              </BonusBadge>
            </View>

            <Text style={styles.hint}>Tap anywhere to continue</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  particleContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  particle: {
    position: "absolute",
  },
  card: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(249,115,22,0.5)",
    paddingHorizontal: 28,
    paddingVertical: 36,
    alignItems: "center",
    gap: 16,
    width: 320,
    shadowColor: FIRE_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 40,
    elevation: 20,
  },
  ringOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(249,115,22,0.1)",
  },
  fireEmoji: {
    fontSize: 64,
  },
  textBlock: {
    alignItems: "center",
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    textTransform: "uppercase",
    color: FIRE_COLOR,
  },
  headline: {
    fontSize: 30,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  streakLine: {
    fontSize: 14,
    fontWeight: "700",
    color: FIRE_COLOR,
  },
  palLine: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
  },
  bonusRow: {
    flexDirection: "row",
    gap: 10,
  },
  bonusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  bonusText: {
    fontSize: 14,
    fontWeight: "900",
  },
  hint: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
