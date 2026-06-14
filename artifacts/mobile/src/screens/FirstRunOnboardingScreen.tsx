import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import {
  Pill,
  PrimaryCard,
  SecondaryCard,
  UtilityCard,
} from "../components/ui";
import {
  getOnboardingEgg,
  getOnboardingStepIndex,
  getOnboardingStepTitle,
  ONBOARDING_TUTORIAL_STEPS,
  sanitizeOnboardingUsername,
} from "../domain/onboardingTutorial";
import { getTrainingStatus } from "../domain/hatchlings";
import { isEggReady } from "../domain/hatchery";
import type {
  CollectedHatchling,
  EggElement,
  HatchUpData,
  OnboardingTutorialStep,
} from "../domain/models";
import { colors, elementColors, radii, spacing, typography } from "../theme";
import { formatNumber, formatSteps, formatXp } from "../utils/format";
import type { LatestSyncGains } from "../useHatchUpApp";

const starterEggs: Array<{
  body: string;
  element: EggElement;
  label: string;
}> = [
  {
    body: "Steady, kind, and great for a first garden companion.",
    element: "leaf",
    label: "Leaf",
  },
  {
    body: "Bright, bold, and ready to turn effort into sparks.",
    element: "ember",
    label: "Ember",
  },
  {
    body: "Calm, playful, and happiest when progress flows.",
    element: "tide",
    label: "Tide",
  },
  {
    body: "Quick, curious, and charged up for weekly challenges.",
    element: "storm",
    label: "Storm",
  },
];

interface Props {
  data: HatchUpData;
  error: string | null;
  isSyncing: boolean;
  latestSyncGains: LatestSyncGains;
  onComplete: () => Promise<void>;
  onHatchEgg: (eggId: string) => Promise<void>;
  onAcknowledgeSyncExplanation: () => Promise<void>;
  onPickStarterEgg: (element: EggElement) => Promise<void>;
  onSaveIdentity: (username: string) => Promise<void>;
  onSetActivePal: (hatchlingId: string) => Promise<void>;
  onSkip: () => Promise<void>;
  onSyncMovement: () => Promise<boolean>;
  onTrainPal: () => Promise<void>;
}

export function FirstRunOnboardingScreen({
  data,
  error,
  isSyncing,
  latestSyncGains,
  onComplete,
  onHatchEgg,
  onAcknowledgeSyncExplanation,
  onPickStarterEgg,
  onSaveIdentity,
  onSetActivePal,
  onSkip,
  onSyncMovement,
  onTrainPal,
}: Props) {
  const step = data.onboardingStep ?? "username";
  const [busy, setBusy] = useState(false);
  const [selectedElement, setSelectedElement] = useState<EggElement>(
    data.starterEggElement ?? "leaf",
  );
  const [username, setUsername] = useState(
    data.profileUsername || data.monsterName || "",
  );
  const activePal = getActivePal(data);
  const readyEgg = data.activeEggs.find(isEggReady);
  const tutorialEgg = getOnboardingEgg(data);
  const stepIndex = getOnboardingStepIndex(step);
  const progress = stepIndex / ONBOARDING_TUTORIAL_STEPS.length;
  const primary = getStepPrimaryCopy(step, data, activePal);

  async function run(action: () => Promise<unknown>) {
    if (busy || isSyncing) return;

    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <View style={styles.footerActions}>
      <AppButton
        disabled={busy || isSyncing || !primary.enabled}
        label={busy || isSyncing ? "Working..." : primary.cta}
        onPress={() => run(primary.action)}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy || isSyncing}
        onPress={() => run(onSkip)}
        style={styles.skipButton}
      >
        <Text style={styles.skipText}>Skip tutorial</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen contentStyle={styles.screen} footer={footer}>
      <View style={styles.header}>
        <Pill tone="accent">
          Step {stepIndex} of {ONBOARDING_TUTORIAL_STEPS.length}
        </Pill>
        <Text style={styles.title}>{getOnboardingStepTitle(step)}</Text>
        <Text style={styles.subtitle}>
          HatchUp turns your movement into Egg progress, Pal growth, and small
          daily rewards.
        </Text>
        <ProgressBar progress={progress} />
      </View>

      <PrimaryCard style={styles.primaryCard}>
        <Text style={styles.eyebrow}>{primary.eyebrow}</Text>
        <Text style={styles.cardTitle}>{primary.title}</Text>
        <Text style={styles.body}>{primary.body}</Text>
        {renderStepBody({
          activePal,
          data,
          latestSyncGains,
          readyEgg,
          selectedElement,
          setSelectedElement,
          setUsername,
          step,
          tutorialEgg,
          username,
        })}
      </PrimaryCard>

      {error && (
        <UtilityCard style={styles.errorCard}>
          <Text style={styles.errorTitle}>Something needs attention</Text>
          <Text style={styles.body}>{error}</Text>
        </UtilityCard>
      )}

      <SecondaryCard>
        <Text style={styles.cardTitle}>The loop you are learning</Text>
        <View style={styles.loopRow}>
          {["Move", "Sync", "Hatch", "Train", "Return"].map((item) => (
            <View key={item} style={styles.loopPill}>
              <Text style={styles.loopText}>{item}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.caption}>
          After this quick setup, Home will guide you toward the next best action
          each day.
        </Text>
      </SecondaryCard>
    </Screen>
  );

  function getStepPrimaryCopy(
    currentStep: OnboardingTutorialStep,
    currentData: HatchUpData,
    pal: CollectedHatchling | null,
  ) {
    const map: Record<
      OnboardingTutorialStep,
      {
        body: string;
        cta: string;
        enabled: boolean;
        eyebrow: string;
        title: string;
        action: () => Promise<unknown>;
      }
    > = {
      explainSync: {
        action: onAcknowledgeSyncExplanation,
        body: "HatchUp reads movement totals only. Steps become Egg progress now, then Pal XP and Bond after your first hatch.",
        cta: "Continue to sync",
        enabled: true,
        eyebrow: "How progress works",
        title: "Your movement powers the Hatchery",
      },
      hatchPal: {
        action: () =>
          readyEgg
            ? onHatchEgg(readyEgg.id)
            : onSyncMovement().then(() => undefined),
        body: readyEgg
          ? "Your starter Egg is full. Open it now and meet your first Pal."
          : "Your Egg still needs a small push. Sync movement to finish the first hatch.",
        cta: readyEgg ? "Hatch Egg" : "Sync movement",
        enabled: Boolean(readyEgg || tutorialEgg),
        eyebrow: "First hatch",
        title: readyEgg ? "Ready to hatch" : "Almost ready",
      },
      rewardSummary: {
        action: onComplete,
        body: "You picked an Egg, synced movement, hatched a Pal, set it active, and trained it once. That is the daily HatchUp rhythm.",
        cta: "Go to Home",
        enabled: true,
        eyebrow: "Tutorial complete",
        title: "Your first reward is momentum",
      },
      setActivePal: {
        action: () => (pal ? onSetActivePal(pal.id) : Promise.resolve()),
        body: pal
          ? `${pal.name} can travel with you, gain Pal XP from movement, and appear on your profile.`
          : "Hatch your first Egg, then choose which Pal travels with you.",
        cta: pal ? `Set ${pal.name} active` : "Hatch first Pal",
        enabled: Boolean(pal),
        eyebrow: "Active companion",
        title: pal ? "Choose your active Pal" : "No Pal yet",
      },
      starterEgg: {
        action: () => onPickStarterEgg(selectedElement),
        body: "Your starter Egg decides your first Pal element. You will discover other Eggs as you keep moving.",
        cta: `Choose ${capitalize(selectedElement)} Egg`,
        enabled: true,
        eyebrow: "Starter choice",
        title: "Pick the Egg that feels right",
      },
      syncMovement: {
        action: onSyncMovement,
        body: "Sync available movement to start. If Health is not ready yet, HatchUp will use a tutorial boost so you can still learn the first hatch.",
        cta: "Run first sync",
        enabled: true,
        eyebrow: "Movement powered",
        title: currentData.dailyAward
          ? "Sync again when you move more"
          : "Start today’s progress",
      },
      trainPal: {
        action: onTrainPal,
        body: pal
          ? `Training helps ${pal.name} gain Pal XP, Bond, and stronger stats.`
          : "Once your Pal is active, training gives it a small growth boost.",
        cta: "Train Pal",
        enabled: Boolean(pal && getTrainingStatus(pal).canTrain),
        eyebrow: "First care action",
        title: pal ? `Train ${pal.name}` : "Train your Pal",
      },
      username: {
        action: () => onSaveIdentity(sanitizeOnboardingUsername(username)),
        body: "This is your trainer name in the app. You can change it later from Profile.",
        cta: "Save trainer name",
        enabled: username.trim().length > 0,
        eyebrow: "Identity",
        title: "Make this journey yours",
      },
    };

    return map[currentStep];
  }
}

function renderStepBody({
  activePal,
  data,
  latestSyncGains,
  readyEgg,
  selectedElement,
  setSelectedElement,
  setUsername,
  step,
  tutorialEgg,
  username,
}: {
  activePal: CollectedHatchling | null;
  data: HatchUpData;
  latestSyncGains: LatestSyncGains;
  readyEgg: ReturnType<typeof getOnboardingEgg> | undefined;
  selectedElement: EggElement;
  setSelectedElement: (element: EggElement) => void;
  setUsername: (value: string) => void;
  step: OnboardingTutorialStep;
  tutorialEgg: ReturnType<typeof getOnboardingEgg>;
  username: string;
}) {
  if (step === "username") {
    return (
      <TextInput
        accessibilityLabel="Trainer name"
        autoCapitalize="words"
        onChangeText={setUsername}
        placeholder="Trainer name"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={username}
      />
    );
  }

  if (step === "starterEgg") {
    return (
      <View style={styles.eggGrid}>
        {starterEggs.map((egg) => {
          const selected = selectedElement === egg.element;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={egg.element}
              onPress={() => setSelectedElement(egg.element)}
              style={[
                styles.eggChoice,
                selected && {
                  borderColor: elementColors[egg.element],
                  backgroundColor: colors.translucentSurface,
                },
              ]}
            >
              <EggAvatar element={egg.element} rarity="common" size="small" />
              <Text style={styles.choiceTitle}>{egg.label}</Text>
              <Text style={styles.choiceBody}>{egg.body}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (step === "explainSync") {
    return (
      <View style={styles.explainStack}>
        <TutorialBeat
          index="1"
          title="Move"
          body="Walk, work out, or let the day add up naturally."
        />
        <TutorialBeat
          index="2"
          title="Sync movement"
          body="HatchUp reads steps, distance, workouts, and active energy totals only."
        />
        <TutorialBeat
          index="3"
          title="Grow your world"
          body="Before your first hatch, movement fills your Egg. Afterward, it also grows your active Pal."
        />
      </View>
    );
  }

  if (step === "syncMovement") {
    return (
      <View style={styles.statGrid}>
        <Stat label="Today" value={data.dailyAward ? "Synced" : "Not synced"} />
        <Stat
          label="Current Egg"
          value={`${formatNumber(tutorialEgg.stepsWalked)} / ${formatNumber(
            tutorialEgg.stepsRequired,
          )}`}
        />
      </View>
    );
  }

  if (step === "hatchPal") {
    return (
      <View style={styles.heroArt}>
        <EggAvatar
          element={tutorialEgg.element}
          rarity={tutorialEgg.rarity}
          size="large"
        />
        <Text style={styles.caption}>
          {readyEgg
            ? "Ready to hatch"
            : `${formatSteps(
                Math.max(tutorialEgg.stepsRequired - tutorialEgg.stepsWalked, 0),
              )} left`}
        </Text>
      </View>
    );
  }

  if (step === "setActivePal" || step === "trainPal") {
    if (!activePal) return <Text style={styles.caption}>Your first Pal will appear here.</Text>;

    const trainingStatus = getTrainingStatus(activePal);
    return (
      <View style={styles.palSummary}>
        <HatchlingAvatar
          element={activePal.element}
          level={activePal.level}
          rarity={activePal.rarity}
          size="large"
        />
        <View style={styles.statGrid}>
          <Stat label="Pal" value={activePal.name} />
          <Stat label="Level" value={`${activePal.level}`} />
          <Stat label="Bond" value={`${activePal.bond}`} />
          <Stat label="Training" value={trainingStatus.cooldownLabel} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.statGrid}>
      <Stat
        label="Steps synced"
        value={formatSteps(latestSyncGains.stepsSynced || data.dailyAward?.health.steps || 0)}
      />
      <Stat label="Journey XP" value={formatXp(data.dailyAward?.xp.total ?? 0)} />
      <Stat
        label="Egg progress"
        value={formatSteps(latestSyncGains.eggSteps || tutorialEgg.stepsWalked)}
      />
      <Stat label="Pals collected" value={formatNumber(data.collection.length)} />
    </View>
  );
}

function TutorialBeat({
  body,
  index,
  title,
}: {
  body: string;
  index: string;
  title: string;
}) {
  return (
    <UtilityCard style={styles.explainBeat}>
      <View style={styles.explainNumber}>
        <Text style={styles.explainNumberText}>{index}</Text>
      </View>
      <View style={styles.explainCopy}>
        <Text style={styles.explainTitle}>{title}</Text>
        <Text style={styles.explainBody}>{body}</Text>
      </View>
    </UtilityCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <UtilityCard style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </UtilityCard>
  );
}

function getActivePal(data: HatchUpData) {
  return (
    data.collection.find((item) => item.id === data.activeHatchlingId) ??
    data.collection[0] ??
    null
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: typography.bodyLineHeight,
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: typography.titleWeight,
  },
  choiceBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  choiceTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  eggChoice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 6,
    padding: 10,
  },
  eggGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  errorCard: {
    borderColor: colors.danger,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "900",
  },
  explainBeat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  explainCopy: {
    flex: 1,
    gap: 3,
  },
  explainNumber: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  explainNumberText: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: "900",
  },
  explainStack: {
    gap: 9,
  },
  explainBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  explainTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  eyebrow: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  footerActions: {
    gap: 8,
  },
  header: {
    gap: 12,
  },
  heroArt: {
    alignItems: "center",
    gap: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  loopPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  loopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  loopText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  palSummary: {
    alignItems: "center",
    gap: 10,
  },
  primaryCard: {
    gap: 12,
  },
  screen: {
    gap: spacing.section,
  },
  skipButton: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  skipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  statValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
});
