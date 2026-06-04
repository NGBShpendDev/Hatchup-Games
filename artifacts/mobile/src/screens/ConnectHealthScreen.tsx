import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
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
      <OnboardingSteps currentStep={3} />
      <Text style={styles.title}>Turn movement into Pal progress.</Text>
      <Text style={styles.body}>
        Connect your health source so HatchUp can calculate your daily rewards.
        You can skip this and explore first.
      </Text>
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
        <Text style={styles.cardTitle}>Recommended first sync</Text>
        <Text style={styles.item}>1. HatchUp syncs today's movement.</Text>
        <Text style={styles.item}>2. Your starter Egg gains progress.</Text>
        <Text style={styles.item}>3. Any rewards appear on Home.</Text>
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
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.spacer} />
      <AppButton label={`Connect ${healthMode}`} onPress={onConnect} />
      <AppButton label="Skip for now" onPress={onSkip} variant="secondary" />
      <Text style={styles.note}>
        Native health sync requires an Expo development build. Expo Go is not
        supported.
      </Text>
    </Screen>
  );
}

function OnboardingSteps({ currentStep }: { currentStep: number }) {
  return (
    <View style={styles.steps}>
      {["Preview", "Egg", "Health"].map((label, index) => {
        const active = index + 1 === currentStep;
        return (
          <View key={label} style={[styles.stepPill, active && styles.stepPillActive]}>
            <Text style={[styles.stepText, active && styles.stepTextActive]}>
              {index + 1}. {label}
            </Text>
          </View>
        );
      })}
    </View>
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
  steps: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 18,
  },
  stepPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 7,
  },
  stepPillActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  stepText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  stepTextActive: {
    color: "#FFFFFF",
  },
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
  sourceCard: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 24,
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
    color: "#FFFFFF",
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
