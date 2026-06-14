import { Linking, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { Header } from "../components/Header";
import { OnboardingSteps } from "../components/OnboardingSteps";
import { Screen } from "../components/Screen";
import {
  buildSupportMailto,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from "../config/runtime";
import { colors, radii, typography } from "../theme";

const privacyCopy =
  "HatchUp reads your steps, distance, workouts, and active energy only to reward your Pal with XP and show optional rankings. We do not sell your health data or use it for ads.";

interface Props {
  error: string | null;
  healthMode: string;
  onBack: () => void;
  onConnect: () => Promise<void>;
  onSkip: () => Promise<void>;
}

export function ConnectHealthScreen({
  error,
  healthMode,
  onBack,
  onConnect,
  onSkip,
}: Props) {
  return (
    <Screen>
      <Header onBack={onBack} title="Connect health" />
      <OnboardingSteps currentStep={3} helperText="Read-only movement rewards" />
      <Text style={styles.title}>Turn movement into Pal progress.</Text>
      <Text style={styles.body}>
        Connect your health source so HatchUp can calculate your daily rewards,
        hatch progress, and first-week journey. You can still explore first.
      </Text>
      <View style={styles.handoffCard}>
        <Text style={styles.handoffKicker}>Almost home</Text>
        <Text style={styles.handoffTitle}>After this, Home gives you one next action.</Text>
        <Text style={styles.handoffBody}>
          If you connect now, HatchUp can reward today's movement. If you
          skip, the app uses safe demo progress until you connect from Profile.
        </Text>
      </View>
      <View style={styles.sourceCard}>
        <View style={styles.sourceMark}>
          <Text style={styles.sourceMarkText}>H</Text>
        </View>
        <View style={styles.sourceText}>
          <Text style={styles.sourceTitle}>{healthMode}</Text>
          <Text style={styles.sourceBody}>Read-only access for Pal rewards</Text>
        </View>
      </View>
      <View style={styles.readCard}>
        <Text style={styles.cardTitle}>HatchUp reads only</Text>
        <View style={styles.permissionGrid}>
          <PermissionChip label="Steps" />
          <PermissionChip label="Distance" />
          <PermissionChip label="Active calories" />
          <PermissionChip label="Workouts" />
        </View>
      </View>
      <View style={styles.nextCard}>
        <Text style={styles.cardTitle}>What to expect</Text>
        <Text style={styles.item}>1. Tap Connect and approve read-only categories.</Text>
        <Text style={styles.item}>2. Return to HatchUp after the permission sheet.</Text>
        <Text style={styles.item}>3. Home shows today's rewards and next action.</Text>
      </View>
      <View style={styles.skipCard}>
        <Text style={styles.cardTitle}>Not ready yet?</Text>
        <Text style={styles.privacyBody}>
          You can enter Home now, browse your Hatchery, and connect health from
          Settings later. Your Egg will start progressing after the first sync.
        </Text>
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Your privacy matters</Text>
        <Text style={styles.privacyBody}>{privacyCopy}</Text>
        <View style={styles.legalActions}>
          <AppButton
            disabled={!PRIVACY_POLICY_URL}
            label={PRIVACY_POLICY_URL ? "Privacy policy" : "Privacy URL needed"}
            onPress={() => {
              if (PRIVACY_POLICY_URL) void Linking.openURL(PRIVACY_POLICY_URL);
            }}
            style={styles.legalButton}
            variant="secondary"
          />
          <AppButton
            disabled={!TERMS_URL}
            label={TERMS_URL ? "Terms" : "Terms URL needed"}
            onPress={() => {
              if (TERMS_URL) void Linking.openURL(TERMS_URL);
            }}
            style={styles.legalButton}
            variant="secondary"
          />
        </View>
        <AppButton
          label="Ask a privacy question"
          onPress={() => {
            void Linking.openURL(
              buildSupportMailto({
                subject: "HatchUp Privacy Question",
              }),
            );
          }}
          style={styles.supportButton}
          variant="secondary"
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.spacer} />
      <AppButton label={`Connect ${healthMode} and continue`} onPress={onConnect} />
      <AppButton label="Explore with demo progress" onPress={onSkip} variant="secondary" />
      <Text style={styles.note}>
        Health data is read-only. Native sync is available in TestFlight and
        development builds; demo progress keeps the app testable without access.
      </Text>
    </Screen>
  );
}

function PermissionChip({ label }: { label: string }) {
  return (
    <View style={styles.permissionChip}>
      <Text style={styles.permissionChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    lineHeight: 35,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  handoffCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  handoffKicker: {
    color: colors.rewardGold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  handoffTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 5,
  },
  handoffBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  sourceCard: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 14,
    padding: 16,
  },
  sourceMark: {
    alignItems: "center",
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.button,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sourceMarkText: {
    color: colors.primaryText,
    fontSize: 18,
    fontWeight: "900",
  },
  sourceText: {
    flex: 1,
    marginLeft: 13,
  },
  sourceTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  sourceBody: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  readCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  nextCard: {
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  privacyCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  skipCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  item: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 23,
  },
  permissionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  permissionChip: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  permissionChipText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  privacyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  legalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  legalButton: {
    flex: 1,
    minHeight: 46,
  },
  supportButton: {
    marginTop: 8,
    minHeight: 46,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    textAlign: "center",
  },
});
