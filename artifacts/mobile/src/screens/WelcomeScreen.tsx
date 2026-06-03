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
        <Text style={styles.title}>Raise a Pal with your daily movement.</Text>
        <Text style={styles.body}>
          Your steps, distance, active energy, and workouts turn into XP. Pick
          your first Egg, then train a team of Pals as you move.
        </Text>
      </View>
      <MonsterAvatar stage="egg" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Move. Hatch. Climb.</Text>
        <Text style={styles.cardBody}>
          Start with one chosen Egg, earn random milestone Eggs, collect Pals,
          and optionally compare your weekly movement in beta
          rankings.
        </Text>
      </View>
      <View style={styles.spacer} />
      <AppButton label="Start raising my Pal" onPress={onContinue} />
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
