import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { ScreenHeader, SecondaryCard, UtilityCard } from "../components/ui";
import { toDateKey } from "../domain/date";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import {
  getActiveHatchling,
  getHatchlingPowerScore,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import { getCreatureVisualStage } from "../domain/creatureVisuals";
import { getPalTrait } from "../domain/palTraits";
import type { CollectedHatchling, HatchUpData } from "../domain/models";
import { colors, radii, typography } from "../theme";
import {
  EggReadyPulse,
  HatchCelebration,
  useReducedMotion,
} from "../utils/animations";
import { formatNumber, formatSteps } from "../utils/format";

interface Props {
  data: HatchUpData;
  latestHatchling: CollectedHatchling | null;
  onBack: () => void;
  onDexPress: () => void;
  onDismissHatch: () => void;
  onHatchAll: () => Promise<void>;
  onHatch: (eggId: string) => Promise<void>;
  onLeaderboardPress: () => void;
  onSetActiveHatchling: (hatchlingId: string) => Promise<void>;
  onSettingsPress: () => void;
}

type ActiveEgg = HatchUpData["activeEggs"][number];
type ClosestEggSummary = {
  egg: ActiveEgg;
  slotNumber: number;
  stepsLeft: number;
};

export function MonsterDetailScreen({
  data,
  latestHatchling,
  onBack,
  onDexPress,
  onDismissHatch,
  onHatchAll,
  onHatch,
  onLeaderboardPress,
  onSetActiveHatchling,
  onSettingsPress,
}: Props) {
  const todayKey = toDateKey(new Date());
  const readyEggCount = data.activeEggs.filter(isEggReady).length;
  const firstReadyEgg = data.activeEggs.find(isEggReady);
  const closestEgg = getClosestEgg(data.activeEggs);
  const todaySteps = data.dailyAward?.date === todayKey ? data.dailyAward.health.steps : 0;
  const activeHatchlingRaw = getActiveHatchling(data);
  const activeHatchling = activeHatchlingRaw
    ? getTimeAdjustedHatchling(activeHatchlingRaw)
    : null;
  const activePalTraining = activeHatchling
    ? getTrainingStatus(activeHatchling)
    : null;

  return (
    <Screen
      footer={
        <BottomNav
          active="monster"
          onDexPress={onDexPress}
          onHomePress={onBack}
          onLeaderboardPress={onLeaderboardPress}
          onMonsterPress={() => undefined}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <ScreenHeader
        onBack={onBack}
        subtitle="Your steps fill Eggs. Ready Eggs hatch into Pals."
        title="Hatchery"
      />
      <HatchRevealModal
        hatchling={latestHatchling}
        onHatchAnother={
          firstReadyEgg
            ? async () => {
                await onHatch(firstReadyEgg.id);
              }
            : undefined
        }
        onClose={onDismissHatch}
        onSetActive={async (hatchlingId) => {
          await onSetActiveHatchling(hatchlingId);
          onDismissHatch();
        }}
        onViewPal={() => {
          onDismissHatch();
          onDexPress();
        }}
      />
      <View style={styles.hatcheryStatusRow}>
        <View style={styles.hatcheryStatusPill}>
          <Text style={styles.hatcheryStatusText}>
            {readyEggCount} ready
          </Text>
        </View>
        <Text style={styles.hatcheryStatusHint}>
          Up to three Eggs fill together from each movement sync.
        </Text>
      </View>
      <AllEggsSummary
        closestEgg={closestEgg}
        readyEggCount={readyEggCount}
        todaySteps={todaySteps}
      />
      {firstReadyEgg && (
        <EggReadyPulse active style={styles.readyCelebrationPulse}>
          <View style={styles.readyCelebration}>
            <View style={styles.readyCelebrationText}>
              <Text style={styles.readyCelebrationKicker}>Egg ready!</Text>
              <Text style={styles.readyCelebrationBody}>
                A {capitalize(firstReadyEgg.rarity)} {capitalize(firstReadyEgg.element)} Egg is ready to hatch.
              </Text>
            </View>
            <AppButton
              label="Hatch now"
              onPress={() => onHatch(firstReadyEgg.id)}
              style={styles.readyCelebrationButton}
            />
          </View>
        </EggReadyPulse>
      )}
      {readyEggCount > 1 && (
        <AppButton
          label={`Hatch all ${readyEggCount} ready Eggs`}
          onPress={onHatchAll}
          style={styles.hatchAllButton}
        />
      )}
      <View style={styles.incubatorStack}>
        {data.activeEggs.map((egg, index) => (
          <EggSlotCard
            egg={egg}
            key={egg.id}
            onHatch={() => onHatch(egg.id)}
            slotNumber={index + 1}
          />
        ))}
      </View>
      <ActivePalShortcut
        activeHatchling={activeHatchling}
        collectionCount={data.collection.length}
        onCollectionPress={onDexPress}
        trainingSessionsLeft={activePalTraining?.remainingToday ?? 0}
      />
    </Screen>
  );
}

function AllEggsSummary({
  closestEgg,
  readyEggCount,
  todaySteps,
}: {
  closestEgg: ClosestEggSummary | null;
  readyEggCount: number;
  todaySteps: number;
}) {
  return (
    <SecondaryCard style={styles.eggsSummaryCard}>
      <View style={styles.eggsSummaryHeader}>
        <View>
          <Text style={styles.eggsSummaryKicker}>All Eggs</Text>
          <Text style={styles.eggsSummaryTitle}>Incubator overview</Text>
        </View>
        {readyEggCount > 0 && <Text style={styles.eggsSummaryReady}>Ready</Text>}
      </View>
      <View style={styles.eggsSummaryGrid}>
        <SummaryStat label="Steps added today" value={formatSteps(todaySteps)} />
        <SummaryStat label="Eggs ready" value={String(readyEggCount)} />
        <SummaryStat
          label="Closest next Egg"
          value={
            closestEgg
              ? `Slot ${closestEgg.slotNumber}`
              : readyEggCount > 0
                ? "Ready now"
                : "No Egg"
          }
        />
      </View>
      <Text style={styles.eggsSummaryNote}>
        {closestEgg
          ? `${capitalize(closestEgg.egg.rarity)} ${capitalize(closestEgg.egg.element)} Egg has ${formatSteps(closestEgg.stepsLeft)} left.`
          : readyEggCount > 0
            ? "Open a ready Egg below to meet your next Pal."
            : "Add an Egg to start filling the incubator."}
      </Text>
    </SecondaryCard>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.eggsSummaryStat}>
      <Text style={styles.eggsSummaryValue}>{value}</Text>
      <Text style={styles.eggsSummaryLabel}>{label}</Text>
    </View>
  );
}

function EggSlotCard({
  egg,
  onHatch,
  slotNumber,
}: {
  egg: ActiveEgg;
  onHatch: () => Promise<void>;
  slotNumber: number;
}) {
  const ready = isEggReady(egg);
  const stepsLeft = Math.max(egg.stepsRequired - egg.stepsWalked, 0);

  return (
    <EggReadyPulse active={ready}>
      <UtilityCard style={[styles.eggSlotCard, ready && styles.eggSlotCardReady]}>
      <View style={styles.eggSlotArt}>
        <EggAvatar element={egg.element} rarity={egg.rarity} size="small" />
      </View>
      <View style={styles.eggSlotBody}>
        <View style={styles.eggSlotHeader}>
          <View>
            <Text style={styles.eggSlotNumber}>Slot {slotNumber}</Text>
            <Text style={styles.eggSlotName}>
              {capitalize(egg.rarity)} {capitalize(egg.element)} Egg
            </Text>
          </View>
          <Text style={[styles.eggSlotStatus, ready && styles.eggSlotStatusReady]}>
            {ready ? "Ready to hatch" : `${formatSteps(stepsLeft)} left`}
          </Text>
        </View>
        <ProgressBar progress={getEggProgress(egg)} />
        {ready ? (
          <>
          <Text style={styles.eggReadyHint}>
            Tap Hatch Egg for the reveal moment.
          </Text>
          <AppButton
            label="Hatch Egg"
            onPress={() => {
              void onHatch();
            }}
          />
          </>
        ) : (
          <Text style={styles.eggSlotHint}>
            Sync movement from Home to keep this Egg filling.
          </Text>
        )}
      </View>
      </UtilityCard>
    </EggReadyPulse>
  );
}

function ActivePalShortcut({
  activeHatchling,
  collectionCount,
  onCollectionPress,
  trainingSessionsLeft,
}: {
  activeHatchling: CollectedHatchling | null;
  collectionCount: number;
  onCollectionPress: () => void;
  trainingSessionsLeft: number;
}) {
  return (
    <UtilityCard style={styles.activePalShortcut}>
      {activeHatchling ? (
        <>
          <HatchlingAvatar
            element={activeHatchling.element}
            level={activeHatchling.level}
            rarity={activeHatchling.rarity}
            size="small"
          />
          <View style={styles.activePalShortcutBody}>
            <Text style={styles.activePalShortcutKicker}>Active Pal shortcut</Text>
            <Text style={styles.activePalShortcutTitle}>
              {activeHatchling.name} | L{activeHatchling.level}
            </Text>
            <Text style={styles.activePalShortcutText}>
              {capitalize(activeHatchling.rarity)} {capitalize(activeHatchling.element)} | Power{" "}
              {getHatchlingPowerScore(activeHatchling)} | Training: {trainingSessionsLeft} left
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.activePalShortcutBody}>
          <Text style={styles.activePalShortcutKicker}>Collection shortcut</Text>
          <Text style={styles.activePalShortcutTitle}>No active Pal yet</Text>
          <Text style={styles.activePalShortcutText}>
            Hatch an Egg here, then manage Pal stats, evolution, and training in Collection.
          </Text>
        </View>
      )}
      <AppButton
        label="Open Collection"
        onPress={onCollectionPress}
        style={styles.activePalShortcutButton}
        variant="secondary"
      />
    </UtilityCard>
  );
}

function HatchRevealModal({
  hatchling,
  onHatchAnother,
  onClose,
  onSetActive,
  onViewPal,
}: {
  hatchling: CollectedHatchling | null;
  onHatchAnother?: () => Promise<void>;
  onClose: () => void;
  onSetActive: (hatchlingId: string) => Promise<void>;
  onViewPal: () => void;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<"shake" | "crack" | "reveal">("shake");

  useEffect(() => {
    if (!hatchling) return;

    setStage("shake");
    shake.setValue(0);
    glow.setValue(0);
    if (reducedMotion) {
      setStage("reveal");
      glow.setValue(1);
      return;
    }

    const shakeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, {
          duration: 80,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          duration: 80,
          toValue: -1,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          duration: 80,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 6 },
    );
    shakeLoop.start();
    Animated.timing(glow, {
      duration: 1650,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    const crackTimer = setTimeout(() => setStage("crack"), 900);
    const revealTimer = setTimeout(() => setStage("reveal"), 1750);

    return () => {
      shakeLoop.stop();
      clearTimeout(crackTimer);
      clearTimeout(revealTimer);
    };
  }, [glow, hatchling, reducedMotion, shake]);

  if (!hatchling) return null;

  const rotate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-7deg", "0deg", "7deg"],
  });
  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.88],
  });
  const revealed = stage === "reveal";
  const visualStage = getCreatureVisualStage(hatchling.level);
  const stats = hatchling.stats;
  const trait = getPalTrait(hatchling);

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.revealBackdrop}>
        <View style={styles.revealModal}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.revealClose}
          >
            <Text style={styles.revealCloseText}>Close</Text>
          </Pressable>
          <Text style={styles.revealKicker}>
            {revealed ? "NEW PAL" : "HATCHING"}
          </Text>
          <Text style={styles.revealStageText}>
            {stage === "shake"
              ? "The Egg is moving..."
              : stage === "crack"
                ? "Cracks of light appear."
                : "A new Pal has arrived."}
          </Text>
          <View style={styles.revealArtStage}>
            <HatchCelebration active={revealed} />
            <Animated.View
              style={[
                styles.revealGlow,
                {
                  opacity: glowOpacity,
                  transform: [
                    {
                      scale: glow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1.18],
                      }),
                    },
                  ],
                },
              ]}
            />
            {revealed ? (
              <HatchlingAvatar
                element={hatchling.element}
                level={hatchling.level}
                rarity={hatchling.rarity}
              />
            ) : (
              <Animated.View style={{ transform: [{ rotate }] }}>
                <EggAvatar
                  element={hatchling.element}
                  rarity={hatchling.rarity}
                />
              </Animated.View>
            )}
          </View>
          {revealed && (
            <View style={styles.revealResult}>
              <Text style={styles.revealTitle}>Meet {hatchling.name}</Text>
              <Text style={styles.revealText}>
                {capitalize(hatchling.rarity)} {capitalize(hatchling.element)} Pal
                | {capitalize(visualStage)} | Level {hatchling.level}
              </Text>
              <View style={styles.revealInfoGrid}>
                <RevealInfo label="Rarity" value={capitalize(hatchling.rarity)} />
                <RevealInfo label="Element" value={capitalize(hatchling.element)} />
                <RevealInfo label="Stage" value={capitalize(visualStage)} />
                <RevealInfo label="Trait" value={trait.displayName} />
              </View>
              <Text style={styles.revealPersonality}>
                {getRevealPersonality(hatchling)}
              </Text>
              <Text style={styles.revealTraitEffect}>
                Trait effect: {trait.effect}
              </Text>
              <View style={styles.revealStatsGrid}>
                <RevealStat label="Heart" value={stats.heart} />
                <RevealStat label="Power" value={stats.power} />
                <RevealStat label="Speed" value={stats.speed} />
                <RevealStat label="Resilience" value={stats.resilience} />
              </View>
              <View style={styles.revealActions}>
                <AppButton
                  label="Set Active Pal"
                  onPress={() => onSetActive(hatchling.id)}
                />
                <AppButton
                  label="View in Collection"
                  onPress={onViewPal}
                  variant="secondary"
                />
                {onHatchAnother && (
                  <AppButton
                    label="Hatch another"
                    onPress={() => {
                      void onHatchAnother();
                    }}
                    variant="secondary"
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function RevealInfo({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.revealInfoPill}>
      <Text style={styles.revealInfoLabel}>{label}</Text>
      <Text style={styles.revealInfoValue}>{value}</Text>
    </View>
  );
}

function RevealStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.revealStat}>
      <Text style={styles.revealStatValue}>{value}</Text>
      <Text style={styles.revealStatLabel}>{label}</Text>
    </View>
  );
}

function getRevealPersonality(hatchling: CollectedHatchling) {
  const trait = getPalTrait(hatchling);
  const elementTone = {
    ember: "brave and eager to train after active days",
    leaf: "steady and happiest when you return tomorrow",
    storm: "restless, bright, and drawn to streaks",
    tide: "playful and powered by long walks",
  }[hatchling.element];
  const moodCopy = {
    excited: "already bouncing with energy",
    happy: "warmly bonded from the first hatch",
    lonely: "looking for a favorite trainer",
    sleepy: "soft-eyed but ready to grow",
  }[hatchling.mood];

  return `${capitalize(hatchling.name)} is ${elementTone}, ${moodCopy}. Personality: ${trait.displayName}.`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getClosestEgg(eggs: ActiveEgg[]): ClosestEggSummary | null {
  return eggs.reduce<ClosestEggSummary | null>((closest, egg, index) => {
    if (isEggReady(egg)) return closest;
    const stepsLeft = Math.max(egg.stepsRequired - egg.stepsWalked, 0);
    if (!closest || stepsLeft < closest.stepsLeft) {
      return {
        egg,
        slotNumber: index + 1,
        stepsLeft,
      };
    }
    return closest;
  }, null);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    padding: 18,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  revealBackdrop: {
    alignItems: "center",
    backgroundColor: colors.modalBackdrop,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  revealModal: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    maxWidth: 420,
    overflow: "hidden",
    padding: 22,
    width: "100%",
  },
  revealClose: {
    alignSelf: "flex-end",
    backgroundColor: colors.translucentSurface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  revealCloseText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  revealKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "center",
  },
  revealStageText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  revealArtStage: {
    alignItems: "center",
    height: 230,
    justifyContent: "center",
    marginVertical: 4,
    width: "100%",
  },
  revealGlow: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    height: 210,
    position: "absolute",
    width: 210,
  },
  revealResult: {
    gap: 10,
    width: "100%",
  },
  revealTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  revealText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    textAlign: "center",
  },
  revealInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  revealInfoPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "48%",
  },
  revealInfoLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  revealInfoValue: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
  },
  revealPersonality: {
    backgroundColor: colors.translucentSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    padding: 11,
  },
  revealTraitEffect: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
    padding: 10,
  },
  revealStatsGrid: {
    flexDirection: "row",
    gap: 7,
  },
  revealStat: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    padding: 9,
  },
  revealStatValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  revealStatLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 3,
    textAlign: "center",
  },
  revealActions: {
    gap: 8,
  },
  name: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  stage: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 14,
    marginTop: 4,
    textAlign: "center",
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 9,
    textAlign: "center",
  },
  screenLoopCopy: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 10,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: typography.titleWeight,
    marginBottom: 10,
    marginTop: 22,
  },
  stageRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.card,
    flexDirection: "row",
    marginBottom: 8,
    padding: 14,
  },
  dot: {
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 14,
    marginRight: 11,
    width: 14,
  },
  unlockedDot: {
    backgroundColor: colors.rewardGold,
  },
  stageText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  rowCaption: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  status: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  unlocked: {
    color: colors.primary,
  },
  stats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  stat: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.card,
    flex: 1,
    padding: 14,
  },
  statValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  trainingCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  trainingBody: {
    flex: 1,
  },
  trainingName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  trainingMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  activePalMiniStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  activePalChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activePalProgress: {
    gap: 5,
    marginTop: 8,
  },
  activePalProgressText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  trainingButton: {
    minWidth: 110,
  },
  activePalShortcut: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  activePalShortcutBody: {
    flex: 1,
  },
  activePalShortcutKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  activePalShortcutTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  activePalShortcutText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 3,
  },
  activePalShortcutButton: {
    minWidth: 120,
  },
  hatcheryStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  hatcheryStatusPill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  hatcheryStatusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  hatcheryStatusHint: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  eggsSummaryCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
    padding: 12,
  },
  eggsSummaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eggsSummaryKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  eggsSummaryTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },
  eggsSummaryReady: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  eggsSummaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  eggsSummaryStat: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  eggsSummaryValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  eggsSummaryLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 4,
  },
  eggsSummaryNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  readyCelebration: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 12,
  },
  readyCelebrationText: {
    flex: 1,
  },
  readyCelebrationKicker: {
    color: colors.primaryDeep,
    fontSize: 17,
    fontWeight: "900",
  },
  readyCelebrationBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  readyCelebrationButton: {
    minWidth: 106,
  },
  readyCelebrationPulse: {
    marginBottom: 0,
  },
  eggSlotCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 11,
  },
  eggSlotCardReady: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  eggSlotArt: {
    alignItems: "center",
    justifyContent: "center",
    width: 84,
  },
  eggSlotBody: {
    flex: 1,
    gap: 8,
  },
  eggSlotHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  eggSlotNumber: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  eggSlotName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  eggSlotStatus: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
    maxWidth: 96,
    textAlign: "right",
  },
  eggSlotStatusReady: {
    color: colors.primaryDeep,
  },
  eggReadyHint: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  eggSlotHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  palInfoBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginTop: 8,
    padding: 12,
  },
  palInfoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  palInfoTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  palInfoBadge: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  incubatorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  eggCardBody: {
    flex: 1,
    gap: 6,
  },
  incubatorIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    marginTop: -4,
  },
  missionCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginBottom: 14,
    padding: 14,
  },
  missionKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  missionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  missionBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  incubatorStack: {
    gap: 10,
  },
  hatchAllButton: {
    marginBottom: 10,
  },
  eggName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  eggCaption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  eggRemaining: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  eggProgressStatus: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  eggProgressStatusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  collectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  collectionCount: {
    color: colors.muted,
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  collection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hatchlingCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  hatchlingName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  hatchlingMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
});
