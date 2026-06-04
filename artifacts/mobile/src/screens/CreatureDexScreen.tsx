import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import {
  DEX_ELEMENTS,
  DEX_RARITIES,
  getCreatureDexEntries,
  getDexCompletion,
  getDexElementSummary,
  getDexRaritySummary,
  getNextMissingDexEntry,
  type CreatureDexEntry,
} from "../domain/creatureDex";
import {
  getActiveHatchling,
  getHatchlingLevelProgress,
  getHatchlingPowerScore,
  getHatchlingXpProgress,
  getTimeAdjustedHatchling,
  getTrainingPreview,
  getTrainingStatus,
  TRAINING_DAILY_LIMIT,
  PASSIVE_BOND_HOURS,
  TRAINING_XP,
} from "../domain/hatchlings";
import type {
  CollectedHatchling,
  EggElement,
  EggRarity,
  HatchUpData,
  HatchlingStats,
} from "../domain/models";
import { colors, elementColors, radii, typography } from "../theme";

interface Props {
  data: HatchUpData;
  onHomePress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onRenameHatchling: (hatchlingId: string, name: string) => Promise<void>;
  onSetActiveHatchling: (hatchlingId: string) => Promise<void>;
  onSettingsPress: () => void;
  onTrainActiveHatchling: () => Promise<void>;
}

export function CreatureDexScreen({
  data,
  onHomePress,
  onLeaderboardPress,
  onMonsterPress,
  onRenameHatchling,
  onSetActiveHatchling,
  onSettingsPress,
  onTrainActiveHatchling,
}: Props) {
  const entries = getCreatureDexEntries(data.collection);
  const completion = getDexCompletion(data.collection);
  const elementSummary = getDexElementSummary(data.collection);
  const raritySummary = getDexRaritySummary(data.collection);
  const nextMissingEntry = getNextMissingDexEntry(data.collection);
  const activeHatchling = getActiveHatchling(data);
  const initialIndex = Math.max(
    data.collection.findIndex((item) => item.id === activeHatchling?.id),
    0,
  );
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [draftName, setDraftName] = useState("");
  const [elementFilter, setElementFilter] = useState<"all" | EggElement>("all");
  const [rarityFilter, setRarityFilter] = useState<"all" | EggRarity>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "owned" | "missing">("all");
  const selectedHatchling = useMemo(() => {
    if (data.collection.length === 0) return null;
    const hatchling = data.collection[
      Math.min(selectedIndex, data.collection.length - 1)
    ];
    return getTimeAdjustedHatchling(hatchling);
  }, [data.collection, selectedIndex]);
  useEffect(() => {
    setDraftName(selectedHatchling?.name ?? "");
  }, [selectedHatchling?.id, selectedHatchling?.name]);
  const trainingStatus = selectedHatchling
    ? getTrainingStatus(selectedHatchling)
    : null;
  const levelProgress = selectedHatchling
    ? getHatchlingLevelProgress(selectedHatchling.xp)
    : null;
  const trainingPreview = selectedHatchling
    ? getTrainingPreview(selectedHatchling)
    : null;
  const filteredEntries = entries.filter((entry) => {
    const elementMatches =
      elementFilter === "all" || entry.element === elementFilter;
    const rarityMatches =
      rarityFilter === "all" || entry.rarity === rarityFilter;
    const statusMatches =
      statusFilter === "all" ||
      (statusFilter === "owned" && entry.ownedCount > 0) ||
      (statusFilter === "missing" && entry.ownedCount === 0);
    return elementMatches && rarityMatches && statusMatches;
  });

  return (
    <Screen
      footer={
        <BottomNav
          active="dex"
          onDexPress={() => undefined}
          onHomePress={onHomePress}
          onLeaderboardPress={onLeaderboardPress}
          onMonsterPress={onMonsterPress}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <Text style={styles.kicker}>COLLECTION</Text>
      <Text style={styles.title}>Care for your team of Pals.</Text>
      <Text style={styles.body}>
        Each Pal has its own level, XP, bond, and stats. Bond grows over
        time with your active Pal; training is limited to three sessions a
        day.
      </Text>
      {selectedHatchling ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailKicker}>
            {selectedHatchling.id === data.activeHatchlingId
              ? "ACTIVE PAL"
              : "COLLECTED PAL"}
          </Text>
          {selectedHatchling.id === data.activeHatchlingId && (
            <View style={styles.detailSparkles}>
              <SparkleBurst label="ACTIVE" tone="accent" />
            </View>
          )}
          <HatchlingAvatar
            element={selectedHatchling.element}
            rarity={selectedHatchling.rarity}
          />
          <Text style={styles.detailName}>{selectedHatchling.name}</Text>
          <Text style={styles.detailMeta}>
            Level {selectedHatchling.level} | {capitalize(selectedHatchling.rarity)}{" "}
            {capitalize(selectedHatchling.element)}
          </Text>
          <Text style={styles.moodText}>
            Mood: {capitalize(selectedHatchling.mood)} | Bond{" "}
            {selectedHatchling.bond}/100
          </Text>
          <View style={styles.identityCard}>
            <Text style={styles.identityTitle}>Companion identity</Text>
            <Text style={styles.identityText}>
              {getPalPersonality(selectedHatchling)}
            </Text>
            <Text style={styles.identityEffect}>
              {getPalCompanionEffect(selectedHatchling)}
            </Text>
          </View>
          <LabeledProgress
            label="Bond"
            progress={selectedHatchling.bond / 100}
            value={`${selectedHatchling.bond}/100`}
          />
          <LabeledProgress
            label={
              levelProgress?.nextLevel
                ? `Level ${selectedHatchling.level} progress`
                : "Max level"
            }
            progress={getHatchlingXpProgress(selectedHatchling.xp)}
            value={
              levelProgress?.nextLevel
                ? `${levelProgress.currentLevelXp}/${levelProgress.xpPerLevel} XP`
                : "Complete"
            }
          />
          <Text style={styles.detailCaption}>
            {selectedHatchling.xp} Pal XP | Power{" "}
            {getHatchlingPowerScore(selectedHatchling)}
            {levelProgress?.nextLevel
              ? ` | ${levelProgress.xpToNext} XP to L${levelProgress.nextLevel}`
              : " | Max level"}
          </Text>
          <View style={styles.renameCard}>
            <Text style={styles.renameLabel}>Nickname</Text>
            <TextInput
              autoCapitalize="words"
              maxLength={18}
              onChangeText={setDraftName}
              placeholder={selectedHatchling.name}
              placeholderTextColor={colors.muted}
              style={styles.renameInput}
              value={draftName}
            />
            <AppButton
              label="Save nickname"
              onPress={async () => {
                await onRenameHatchling(selectedHatchling.id, draftName);
              }}
              variant="secondary"
            />
          </View>
          <View style={styles.statGrid}>
            <Stat
              highlight={getTopStats(selectedHatchling.stats).includes("heart")}
              label="Heart"
              max={getStatBarMax(selectedHatchling.stats)}
              value={selectedHatchling.stats.heart}
            />
            <Stat
              highlight={getTopStats(selectedHatchling.stats).includes("power")}
              label="Power"
              max={getStatBarMax(selectedHatchling.stats)}
              value={selectedHatchling.stats.power}
            />
            <Stat
              highlight={getTopStats(selectedHatchling.stats).includes("resilience")}
              label="Guard"
              max={getStatBarMax(selectedHatchling.stats)}
              value={selectedHatchling.stats.resilience}
            />
            <Stat
              highlight={getTopStats(selectedHatchling.stats).includes("speed")}
              label="Speed"
              max={getStatBarMax(selectedHatchling.stats)}
              value={selectedHatchling.stats.speed}
            />
          </View>
          <View style={styles.trainingCard}>
            <Text style={styles.trainingTitle}>Training plan</Text>
            <Text style={styles.trainingText}>
              {selectedHatchling.id === data.activeHatchlingId
                ? trainingStatus?.cooldownLabel
                : "Make this Pal active before training."}
            </Text>
            <TrainingPips sessionsToday={trainingStatus?.sessionsToday ?? 0} />
            <Text style={styles.trainingHint}>
              +{trainingPreview?.xpGain ?? TRAINING_XP} XP and +
              {trainingPreview?.bondGain ?? 0} bond per session.{" "}
              {trainingPreview?.levelsGained
                ? `Next training reaches L${trainingPreview.levelAfterTraining}.`
                : `Power +${trainingPreview?.powerGain ?? 0} after the next level-up.`}{" "}
              Passive bond grows every {PASSIVE_BOND_HOURS} hours.
            </Text>
            <AppButton
              disabled={
                selectedHatchling.id === data.activeHatchlingId &&
                !trainingStatus?.canTrain
              }
              label={
                selectedHatchling.id !== data.activeHatchlingId
                  ? "Set active Pal"
                  : trainingStatus?.canTrain
                    ? "Train now"
                    : "Training cooling down"
              }
              onPress={() => {
                if (selectedHatchling.id !== data.activeHatchlingId) {
                  void onSetActiveHatchling(selectedHatchling.id);
                  return;
                }
                void onTrainActiveHatchling();
              }}
              style={
                selectedHatchling.id === data.activeHatchlingId &&
                !trainingStatus?.canTrain
                  ? styles.disabledAction
                  : undefined
              }
              variant="secondary"
            />
          </View>
          <View style={styles.memoryCard}>
            <Text style={styles.trainingTitle}>Memory log</Text>
            {selectedHatchling.memories.slice(0, 4).map((memory) => (
              <View key={memory.id} style={styles.memoryRow}>
                <Text style={styles.memoryLabel}>{memory.label}</Text>
                <Text style={styles.memoryText}>{memory.description}</Text>
                <Text style={styles.memoryDate}>
                  {new Date(memory.happenedAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.carouselActions}>
            <AppButton
              label="Previous"
              onPress={() => {
                setDraftName("");
                setSelectedIndex((index) =>
                  index === 0 ? data.collection.length - 1 : index - 1,
                );
              }}
              style={styles.carouselButton}
              variant="secondary"
            />
            <AppButton
              label="Next"
              onPress={() => {
                setDraftName("");
                setSelectedIndex((index) => (index + 1) % data.collection.length);
              }}
              style={styles.carouselButton}
              variant="secondary"
            />
          </View>
          <AppButton
            disabled={selectedHatchling.id === data.activeHatchlingId}
            label={
              selectedHatchling.id === data.activeHatchlingId
                ? "Active Pal selected"
                : "Set as active Pal"
            }
            onPress={() => onSetActiveHatchling(selectedHatchling.id)}
            style={
              selectedHatchling.id === data.activeHatchlingId
                ? styles.disabledAction
                : undefined
            }
          />
        </View>
      ) : (
        <View style={styles.emptyDetailCard}>
          <Text style={styles.promptTitle}>No Pals yet</Text>
          <Text style={styles.promptText}>
            Hatch your starter Egg to unlock individual Pal pages, stats,
            and training.
          </Text>
          <Text style={styles.promptMission}>Mission: hatch your first Pal.</Text>
          <AppButton label="Go to Hatchery" onPress={onMonsterPress} />
        </View>
      )}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Collection progress</Text>
          <Text style={styles.progressMeta}>
            {completion.unlocked}/{completion.total}
          </Text>
        </View>
        <ProgressBar progress={completion.percent} />
        <View style={styles.summaryChips}>
          {elementSummary.map((summary) => (
            <SummaryChip
              key={summary.id}
              label={capitalize(summary.id)}
              progress={summary.percent}
              value={`${summary.unlocked}/${summary.total}`}
            />
          ))}
        </View>
        <View style={styles.summaryChips}>
          {raritySummary.map((summary) => (
            <SummaryChip
              key={summary.id}
              label={capitalize(summary.id)}
              progress={summary.percent}
              value={`${summary.unlocked}/${summary.total}`}
            />
          ))}
        </View>
      </View>
      {nextMissingEntry && (
        <View style={styles.targetCard}>
          <View style={styles.targetText}>
            <Text style={styles.targetKicker}>NEXT COLLECTION TARGET</Text>
            <Text style={styles.targetTitle}>{nextMissingEntry.name}</Text>
            <Text style={styles.targetBody}>
              Missing {capitalize(nextMissingEntry.rarity)}{" "}
              {capitalize(nextMissingEntry.element)} from{" "}
              {nextMissingEntry.habitat}. Hatch matching Eggs to complete this
              page.
            </Text>
          </View>
          <View style={styles.targetAvatar}>
            <HatchlingAvatar
              element={nextMissingEntry.element}
              rarity={nextMissingEntry.rarity}
              size="small"
            />
          </View>
        </View>
      )}
      <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Collection filters</Text>
        <FilterRow
          activeValue={elementFilter}
          options={["all", ...DEX_ELEMENTS]}
          onChange={(value) => setElementFilter(value as "all" | EggElement)}
        />
        <FilterRow
          activeValue={rarityFilter}
          options={["all", ...DEX_RARITIES]}
          onChange={(value) => setRarityFilter(value as "all" | EggRarity)}
        />
        <FilterRow
          activeValue={statusFilter}
          options={["all", "owned", "missing"]}
          onChange={(value) => setStatusFilter(value as "all" | "owned" | "missing")}
        />
      </View>
      <View style={styles.grid}>
        {filteredEntries.map((entry) => (
          <DexCard collection={data.collection} entry={entry} key={entry.id} />
        ))}
      </View>
      {filteredEntries.length === 0 && (
        <View style={styles.noResultsCard}>
          <Text style={styles.promptTitle}>No matches yet</Text>
          <Text style={styles.promptText}>
            Clear a filter or keep hatching to discover this corner of the
            collection book.
          </Text>
          <AppButton
            label="Clear filters"
            onPress={() => {
              setElementFilter("all");
              setRarityFilter("all");
              setStatusFilter("all");
            }}
            variant="secondary"
          />
        </View>
      )}
      <View style={styles.promptCard}>
        <Text style={styles.promptTitle}>Collection loop</Text>
        <Text style={styles.promptText}>
          Use the Hatchery for active Eggs. Use Collection to pick who trains
          next and to track every element and rarity still missing.
        </Text>
        <AppButton label="Keep hatching" onPress={onMonsterPress} />
      </View>
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
      <View style={styles.progressBlockHeader}>
        <Text style={styles.progressBlockLabel}>{label}</Text>
        <Text style={styles.progressBlockValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
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
    <View style={[styles.stat, highlight && styles.statHighlight]}>
      <View style={styles.statHeader}>
        <Text style={styles.statValue}>{value}</Text>
        {highlight && <Text style={styles.statTag}>Best</Text>}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${Math.min(value / max, 1) * 100}%` }]} />
      </View>
    </View>
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
      <Text style={styles.trainingPipText}>
        {Math.max(TRAINING_DAILY_LIMIT - sessionsToday, 0)} left today
      </Text>
    </View>
  );
}

function SummaryChip({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View style={styles.summaryChip}>
      <View style={styles.summaryChipHeader}>
        <Text style={styles.summaryChipLabel}>{label}</Text>
        <Text style={styles.summaryChipValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
}

function FilterRow({
  activeValue,
  onChange,
  options,
}: {
  activeValue: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <View style={styles.filterRow}>
      {options.map((option) => {
        const active = option === activeValue;
        return (
          <Pressable
            accessibilityRole="button"
            key={option}
            onPress={() => onChange(option)}
            style={[styles.filterChip, active && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                active && styles.filterChipTextActive,
              ]}
            >
              {capitalize(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DexCard({
  collection,
  entry,
}: {
  collection: readonly CollectedHatchling[];
  entry: CreatureDexEntry;
}) {
  const unlocked = entry.ownedCount > 0;
  const elementColor = elementColors[entry.element];
  const bestOwned = collection
    .filter(
      (hatchling) =>
        hatchling.element === entry.element && hatchling.rarity === entry.rarity,
    )
    .sort((a, b) => getHatchlingPowerScore(b) - getHatchlingPowerScore(a))[0];

  return (
    <View
      style={[
        styles.card,
        { borderColor: elementColor },
        !unlocked && styles.lockedCard,
      ]}
    >
      <View style={!unlocked && styles.lockedAvatar}>
        <HatchlingAvatar
          element={entry.element}
          rarity={entry.rarity}
          size="small"
        />
      </View>
      <Text style={styles.cardName}>{unlocked ? entry.name : "Unknown"}</Text>
      <Text style={[styles.cardMeta, { color: elementColor }]}>
        {capitalize(entry.rarity)} | {capitalize(entry.element)}
      </Text>
      <Text style={styles.cardDescription}>
        {unlocked ? entry.description : `Hatch a ${entry.rarity} ${entry.element} Egg.`}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.status, unlocked && styles.unlockedStatus]}>
          {unlocked ? "Unlocked" : "Locked"}
        </Text>
        {bestOwned && (
          <Text style={styles.count}>
            L{bestOwned.level} | P{getHatchlingPowerScore(bestOwned)}
          </Text>
        )}
        {unlocked && <SparkleBurst />}
      </View>
      {unlocked && entry.ownedCount > 1 && (
        <Text style={styles.duplicateCount}>x{entry.ownedCount} owned</Text>
      )}
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getPalPersonality(hatchling: CollectedHatchling) {
  const elementTone = {
    ember: "bold, energetic, and happiest after training bursts",
    leaf: "steady, nurturing, and quick to bond through daily routines",
    storm: "curious, restless, and drawn to streaks and big weekly goals",
    tide: "calm, playful, and especially responsive to long walks",
  }[hatchling.element];
  const rarityTone = {
    common: "a dependable everyday companion",
    epic: "a rare presence with a dramatic little spark",
    rare: "a standout Pal that makes collection moments feel special",
    uncommon: "a bright companion with a little extra flair",
  }[hatchling.rarity];

  return `${capitalize(hatchling.name)} is ${elementTone}; ${rarityTone}.`;
}

function getPalCompanionEffect(hatchling: CollectedHatchling) {
  const effect = {
    ember: "Companion focus: training quests and active-calorie days.",
    leaf: "Companion focus: bond, streak, and care milestones.",
    storm: "Companion focus: weekly quests and leaderboard pushes.",
    tide: "Companion focus: distance, steps, and egg progress.",
  }[hatchling.element];

  return `${effect} Future builds can turn this into real passive bonuses.`;
}

function getTopStats(stats: HatchlingStats) {
  const entries = Object.entries(stats) as [keyof HatchlingStats, number][];
  const topValue = Math.max(...entries.map(([, value]) => value));
  return entries
    .filter(([, value]) => value === topValue)
    .map(([key]) => key);
}

function getStatBarMax(stats: HatchlingStats) {
  return Math.max(...Object.values(stats), 20);
}

const styles = StyleSheet.create({
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    lineHeight: 35,
    marginTop: 5,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: typography.bodyLineHeight,
    marginTop: 10,
  },
  progressCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 12,
    marginTop: 20,
    padding: 16,
  },
  detailCard: {
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    marginTop: 20,
    padding: 16,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  detailSparkles: {
    alignItems: "center",
    marginBottom: 4,
  },
  emptyDetailCard: {
    backgroundColor: colors.softPeach,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 20,
    padding: 16,
  },
  detailKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  detailName: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  detailMeta: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  detailCaption: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
  },
  moodText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  progressBlock: {
    gap: 6,
  },
  progressBlockHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressBlockLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  progressBlockValue: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  identityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  identityTitle: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  identityText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  identityEffect: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  renameCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  renameLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  renameInput: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 12,
  },
  trainingCard: {
    backgroundColor: colors.softPeach,
    borderColor: colors.ember,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  trainingTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  trainingText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  trainingHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  memoryCard: {
    backgroundColor: colors.softLavender,
    borderColor: colors.storm,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  memoryRow: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    padding: 10,
  },
  memoryLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  memoryText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  memoryDate: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  statHighlight: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
  },
  statHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  statTag: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statTrack: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
  },
  statFill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    height: "100%",
  },
  trainingPips: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  trainingPip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 10,
    width: 28,
  },
  trainingPipUsed: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  trainingPipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 4,
  },
  carouselActions: {
    flexDirection: "row",
    gap: 8,
  },
  carouselButton: {
    flex: 1,
  },
  disabledAction: {
    opacity: 0.55,
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  progressMeta: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    gap: 6,
    padding: 9,
    width: "48%",
  },
  summaryChipHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryChipLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  summaryChipValue: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  targetCard: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    padding: 14,
  },
  targetText: {
    flex: 1,
  },
  targetKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  targetTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  targetBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  targetAvatar: {
    opacity: 0.45,
  },
  filterCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    marginTop: 14,
    padding: 12,
  },
  filterTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  filterChip: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  lockedCard: {
    backgroundColor: colors.softLavender,
    borderStyle: "dashed",
  },
  lockedAvatar: {
    opacity: 0.38,
  },
  cardName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  cardMeta: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    minHeight: 45,
    textAlign: "center",
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  status: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  unlockedStatus: {
    color: colors.primary,
  },
  count: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  duplicateCount: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
    textAlign: "center",
  },
  promptCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  noResultsCard: {
    backgroundColor: colors.softLavender,
    borderColor: colors.storm,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  promptTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  promptText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
    marginTop: 6,
  },
  promptMission: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 12,
  },
});
