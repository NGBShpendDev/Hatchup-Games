import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { OnboardingSteps } from "../components/OnboardingSteps";
import { Screen } from "../components/Screen";
import { colors, radii, typography } from "../theme";

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <Screen>
      <OnboardingSteps currentStep={1} helperText="Your first Pal starts here" />
      <View style={styles.brand}>
        <Text style={styles.kicker}>HATCHUP GAMES</Text>
        <Text style={styles.title}>Start a tiny creature journey today.</Text>
        <Text style={styles.body}>
          Your steps, distance, active energy, and workouts turn into XP. Pick
          your first Egg, place it in the incubator, then let movement grow your
          Pal.
        </Text>
      </View>
      <MonsterAvatar stage="egg" />
      <View style={styles.todayCard}>
        <Text style={styles.todayKicker}>Today's setup</Text>
        <Text style={styles.todayTitle}>Choose Egg - decide sync - land on Home</Text>
        <Text style={styles.todayBody}>
          Home will show one clear next action after setup, so new players do
          not have to guess where to tap first.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Move. Hatch. Climb.</Text>
        <Text style={styles.cardBody}>
          Start with one chosen Egg, earn random milestone Eggs, collect Pals,
          and optionally compare your weekly movement on the journey board.
        </Text>
      </View>
      <View style={styles.trustCard}>
        <Text style={styles.trustTitle}>Start safely</Text>
        <Text style={styles.trustBody}>
          No account needed to begin. Health access is read-only, and rankings
          stay private unless you choose to share.
        </Text>
      </View>
      <View style={styles.loopCard}>
        <Text style={styles.loopTitle}>Your first 3 minutes</Text>
        <LoopStep number="1" title="Pick an Egg" body="Choose the Pal style you want to start with." />
        <LoopStep number="2" title="Connect health" body="Read-only movement turns into Egg progress." />
        <LoopStep number="3" title="Hatch & train" body="Meet your first Pal, then grow your team." />
      </View>
      <View style={styles.spacer} />
      <AppButton label="Choose my starter Egg" onPress={onContinue} />
    </Screen>
  );
}

function LoopStep({
  body,
  number,
  title,
}: {
  body: string;
  number: string;
  title: string;
}) {
  return (
    <View style={styles.loopStep}>
      <Text style={styles.loopNumber}>{number}</Text>
      <View style={styles.loopText}>
        <Text style={styles.loopStepTitle}>{title}</Text>
        <Text style={styles.loopStepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    marginTop: 20,
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
    fontWeight: typography.titleWeight,
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
  todayCard: {
    backgroundColor: colors.surface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  todayKicker: {
    color: colors.rewardGold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  todayTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },
  todayBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  card: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
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
  trustCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  trustTitle: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  trustBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  loopCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 16,
  },
  loopTitle: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  loopStep: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  loopNumber: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  loopText: {
    flex: 1,
  },
  loopStepTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  loopStepBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
});
