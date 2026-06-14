import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { ScreenHeader, PrimaryCard, SecondaryCard, UtilityCard } from "../components/ui";
import { getCreatureVisualStage, type CreatureVisualStage } from "../domain/creatureVisuals";
import {
  getHatchlingLevelProgress,
  getHatchlingPowerScore,
  getHatchlingXpProgress,
  getTimeAdjustedHatchling,
  getTrainingPreview,
  getTrainingStatus,
  HATCHLING_XP_PER_LEVEL,
  PASSIVE_BOND_HOURS,
  TRAINING_DAILY_LIMIT,
  TRAINING_XP,
} from "../domain/hatchlings";
import type { CollectedHatchling, HatchUpData, HatchlingStats } from "../domain/models";
import { getPalTrait } from "../domain/palTraits";
import { colors, radii, typography } from "../theme";
import { formatNumber, formatXp } from "../utils/format";

interface Props {
  data: HatchUpData;
  palId: string;
  onBack: () => void;
  onHomePress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onProfilePress: () => void;
  onRenameHatchling: (hatchlingId: string, name: string) => Promise<void>;
  onSetActiveHatchling: (hatchlingId: string) => Promise<void>;
  onSetProfilePal: (hatchlingId: string) => Promise<void>;
  onTrainActiveHatchling: () => Promise<void>;
}

export function PalDetailScreen({
  data,
  palId,
  onBack,
  onHomePress,
  onLeaderboardPress,
  onMonsterPress,
  onProfilePress,
  onRenameHatchling,
  onSetActiveHatchling,
  onSetProfilePal,
  onTrainActiveHatchling,
}: Props) {
  const rawPal = data.collection.find((item) => item.id === palId) ?? null;
  const pal = rawPal ? getTimeAdjustedHatchling(rawPal) : null;
  const [draftName, setDraftName] = useState(pal?.name ?? "");

  useEffect(() => {
    setDraftName(pal?.name ?? "");
  }, [pal?.id, pal?.name]);

  if (!pal) {
    return (
      <Screen
        footer={
          <BottomNav
            active="dex"
            onDexPress={onBack}
            onHomePress={onHomePress}
            onLeaderboardPress={onLeaderboardPress}
            onMonsterPress={onMonsterPress}
            onSettingsPress={onProfilePress}
          />
        }
      >
        <ScreenHeader onBack={onBack} title="Pal not found" />
        <UtilityCard>
          <Text style={styles.body}>
            This Pal is no longer in your Collection. Open Collection to pick
            another companion.
          </Text>
          <AppButton label="Back to Collection" onPress={onBack} />
        </UtilityCard>
      </Screen>
    );
  }

  const isActive = pal.id === data.activeHatchlingId;
  const isProfilePal = pal.id === data.profileHatchlingId;
  const trainingStatus = getTrainingStatus(pal);
  const levelProgress = getHatchlingLevelProgress(pal.xp);
  const trainingPreview = getTrainingPreview(pal);

  return (
    <Screen
      footer={
        <BottomNav
          active="dex"
          onDexPress={onBack}
          onHomePress={onHomePress}
          onLeaderboardPress={onLeaderboardPress}
          onMonsterPress={onMonsterPress}
          onSettingsPress={onProfilePress}
        />
      }
    >
      <ScreenHeader
        onBack={onBack}
        subtitle="Stats, training, bond, memories, and profile choices live here."
        title={pal.name}
      />
      <PrimaryCard style={styles.heroCard}>
        <Text style={styles.kicker}>{isActive ? "ACTIVE PAL" : "PAL DETAIL"}</Text>
        <HatchlingAvatar
          element={pal.element}
          level={pal.level}
          rarity={pal.rarity}
          size="large"
        />
        <Text style={styles.name}>{pal.name}</Text>
        <Text style={styles.meta}>
          Level {pal.level} | {capitalize(pal.rarity)} {capitalize(pal.element)} |{" "}
          {capitalize(getCreatureVisualStage(pal.level))}
        </Text>
        <View style={styles.actionRow}>
          <AppButton
            disabled={isActive}
            label={isActive ? "Active Pal" : "Set active"}
            onPress={() => onSetActiveHatchling(pal.id)}
            style={styles.heroAction}
            variant={isActive ? "secondary" : "primary"}
          />
          <AppButton
            disabled={isProfilePal}
            label={isProfilePal ? "Profile Pal" : "Use on profile"}
            onPress={() => onSetProfilePal(pal.id)}
            style={styles.heroAction}
            variant="secondary"
          />
        </View>
      </PrimaryCard>

      <SecondaryCard>
        <Text style={styles.sectionTitle}>Growth</Text>
        <LabeledProgress
          label="Bond"
          progress={pal.bond / 100}
          value={`${pal.bond}/100`}
        />
        <LabeledProgress
          label={
            levelProgress?.nextLevel
              ? `Level ${pal.level} progress`
              : "Max level"
          }
          progress={getHatchlingXpProgress(pal.xp)}
          value={
            levelProgress?.nextLevel
              ? `${formatNumber(levelProgress.currentLevelXp)}/${formatNumber(levelProgress.xpPerLevel)} XP`
              : "Complete"
          }
        />
        <Text style={styles.caption}>
          {formatNumber(pal.xp)} Pal XP | Power {getHatchlingPowerScore(pal)}
          {levelProgress?.nextLevel
            ? ` | ${formatXp(levelProgress.xpToNext)} to L${levelProgress.nextLevel}`
            : " | Max level"}
        </Text>
      </SecondaryCard>

      <EvolutionPreviewCard hatchling={pal} />
      <PalTraitCard hatchling={pal} />

      <CollapsibleSection
        badge={`${trainingStatus.remainingToday} left`}
        defaultOpen
        subtitle="Training is limited each day so progress feels earned."
        title="Training"
      >
        <UtilityCard>
          <Text style={styles.sectionTitle}>Today’s training</Text>
          <Text style={styles.body}>
            {isActive
              ? trainingStatus.cooldownLabel
              : "Set this Pal active before training."}
          </Text>
          <TrainingPips sessionsToday={trainingStatus.sessionsToday} />
          <Text style={styles.caption}>
            +{trainingPreview?.xpGain ?? TRAINING_XP} XP and +
            {trainingPreview?.bondGain ?? 0} Bond per session. Passive bond grows
            every {PASSIVE_BOND_HOURS} hours.
          </Text>
          <AppButton
            disabled={isActive && !trainingStatus.canTrain}
            label={
              !isActive
                ? "Set active Pal"
                : trainingStatus.canTrain
                  ? "Train now"
                  : "Training cooling down"
            }
            onPress={() => {
              if (!isActive) {
                void onSetActiveHatchling(pal.id);
                return;
              }
              void onTrainActiveHatchling();
            }}
            variant="secondary"
          />
        </UtilityCard>
      </CollapsibleSection>

      <CollapsibleSection
        badge="Edit"
        subtitle="Give this Pal a name that makes it feel yours."
        title="Nickname"
      >
        <UtilityCard>
          <TextInput
            autoCapitalize="words"
            maxLength={18}
            onChangeText={setDraftName}
            placeholder={pal.name}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draftName}
          />
          <AppButton
            label="Save nickname"
            onPress={() => onRenameHatchling(pal.id, draftName)}
            variant="secondary"
          />
        </UtilityCard>
      </CollapsibleSection>

      <CollapsibleSection
        badge={`P${getHatchlingPowerScore(pal)}`}
        subtitle="Heart, power, guard, and speed for this Pal."
        title="Stats"
      >
        <View style={styles.statGrid}>
          <Stat
            highlight={getTopStats(pal.stats).includes("heart")}
            label="Heart"
            max={getStatBarMax(pal.stats)}
            value={pal.stats.heart}
          />
          <Stat
            highlight={getTopStats(pal.stats).includes("power")}
            label="Power"
            max={getStatBarMax(pal.stats)}
            value={pal.stats.power}
          />
          <Stat
            highlight={getTopStats(pal.stats).includes("resilience")}
            label="Guard"
            max={getStatBarMax(pal.stats)}
            value={pal.stats.resilience}
          />
          <Stat
            highlight={getTopStats(pal.stats).includes("speed")}
            label="Speed"
            max={getStatBarMax(pal.stats)}
            value={pal.stats.speed}
          />
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        badge={String(pal.memories.length)}
        subtitle="Key moments this Pal has earned with you."
        title="Memory log"
      >
        <UtilityCard>
          {pal.memories.length > 0 ? (
            pal.memories.slice(0, 5).map((memory) => (
              <View key={memory.id} style={styles.memoryRow}>
                <Text style={styles.memoryLabel}>{memory.label}</Text>
                <Text style={styles.body}>{memory.description}</Text>
                <Text style={styles.caption}>
                  {new Date(memory.happenedAt).toLocaleDateString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.body}>
              Move, train, and return tomorrow to unlock memories with this Pal.
            </Text>
          )}
        </UtilityCard>
      </CollapsibleSection>
    </Screen>
  );
}

function LabeledProgress({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
}

function EvolutionPreviewCard({ hatchling }: { hatchling: CollectedHatchling }) {
  const currentStage = getCreatureVisualStage(hatchling.level);
  const next = getNextEvolutionStage(currentStage);
  const xpRemaining = next
    ? Math.max((next.levelRequired - 1) * HATCHLING_XP_PER_LEVEL - hatchling.xp, 0)
    : 0;

  return (
    <UtilityCard style={styles.evolutionCard}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.kicker}>Evolution preview</Text>
          <Text style={styles.sectionTitle}>
            {capitalize(currentStage)}
            {next ? ` -> ${capitalize(next.stage)}` : " stage complete"}
          </Text>
        </View>
        <HatchlingAvatar
          element={hatchling.element}
          level={next?.levelRequired ?? hatchling.level}
          rarity={hatchling.rarity}
          size="small"
        />
      </View>
      <Text style={styles.body}>
        {next
          ? `Reach Level ${next.levelRequired} to unlock the ${capitalize(next.stage)} look. ${formatXp(xpRemaining)} remaining.`
          : "This Pal has reached its final visual stage."}
      </Text>
      <Text style={styles.caption}>
        Move, train, and return tomorrow to grow this Pal.
      </Text>
    </UtilityCard>
  );
}

function PalTraitCard({ hatchling }: { hatchling: CollectedHatchling }) {
  const trait = getPalTrait(hatchling);

  return (
    <UtilityCard>
      <Text style={styles.kicker}>Personality trait</Text>
      <Text style={styles.sectionTitle}>{trait.displayName}</Text>
      <Text style={styles.body}>{trait.description}</Text>
      <Text style={styles.caption}>Effect: {trait.effect}</Text>
      {trait.implementationNote && (
        <Text style={styles.caption}>{trait.implementationNote}</Text>
      )}
    </UtilityCard>
  );
}

function TrainingPips({ sessionsToday }: { sessionsToday: number }) {
  return (
    <View style={styles.trainingPips}>
      {Array.from({ length: TRAINING_DAILY_LIMIT }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.trainingPip,
            index < sessionsToday && styles.trainingPipUsed,
          ]}
        />
      ))}
      <Text style={styles.caption}>
        {Math.max(TRAINING_DAILY_LIMIT - sessionsToday, 0)} left today
      </Text>
    </View>
  );
}

function Stat({
  highlight,
  label,
  max,
  value,
}: {
  highlight: boolean;
  label: string;
  max: number;
  value: number;
}) {
  return (
    <UtilityCard style={[styles.stat, highlight && styles.statHighlight]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.caption}>{label}</Text>
      <ProgressBar progress={Math.min(value / max, 1)} />
    </UtilityCard>
  );
}

function getNextEvolutionStage(stage: CreatureVisualStage) {
  if (stage === "baby") return { levelRequired: 5, stage: "teen" as const };
  if (stage === "teen") return { levelRequired: 15, stage: "final" as const };
  return null;
}

function getTopStats(stats: HatchlingStats) {
  const entries = Object.entries(stats) as [keyof HatchlingStats, number][];
  const topValue = Math.max(...entries.map(([, value]) => value));
  return entries.filter(([, value]) => value === topValue).map(([key]) => key);
}

function getStatBarMax(stats: HatchlingStats) {
  return Math.max(...Object.values(stats), 20);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: typography.bodyLineHeight,
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  evolutionCard: {
    backgroundColor: colors.accentSoft,
  },
  heroAction: {
    flex: 1,
  },
  heroCard: {
    alignItems: "center",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  kicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  memoryLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  memoryRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  name: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.5,
  },
  progressBlock: {
    gap: 8,
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  progressValue: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: typography.titleWeight,
  },
  stat: {
    flex: 1,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statHighlight: {
    borderColor: colors.rewardGold,
  },
  statValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  trainingPip: {
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 10,
    width: 28,
  },
  trainingPipUsed: {
    backgroundColor: colors.rewardGold,
  },
  trainingPips: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
