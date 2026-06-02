import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { Screen } from "../components/Screen";
import { colors } from "../theme";

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <Screen>
      <View style={styles.brand}>
        <Text style={styles.kicker}>HATCHUP GAMES</Text>
        <Text style={styles.title}>Raise a monster with your daily movement.</Text>
        <Text style={styles.body}>
          Your steps, active energy, and workouts turn into XP. Start with an egg
          and watch your pocket companion grow.
        </Text>
      </View>
      <MonsterAvatar stage="egg" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Move. Earn XP. Evolve.</Text>
        <Text style={styles.cardBody}>
          HatchUp is a simple daily loop built around progress you already make.
        </Text>
      </View>
      <View style={styles.spacer} />
      <AppButton label="Start raising my monster" onPress={onContinue} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    marginTop: 30,
  },
  kicker: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 37,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 42,
    marginTop: 12,
  },
  body: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 14,
  },
  card: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    padding: 18,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
  },
  cardBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
});
