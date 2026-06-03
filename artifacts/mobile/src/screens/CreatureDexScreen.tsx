import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import {
  getCreatureDexEntries,
  getDexCompletion,
  type CreatureDexEntry,
} from "../domain/creatureDex";
import {
  getActiveHatchling,
  getHatchlingPowerScore,
  getHatchlingXpProgress,
  getTimeAdjustedHatchling,
  getTrainingStatus,
  PASSIVE_BOND_HOURS,
  TRAINING_XP,
} from "../domain/hatchlings";
import type { HatchUpData } from "../domain/models";
import { colors } from "../theme";

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
  const activeHatchling = getActiveHatchling(data);
  const initialIndex = Math.max(
    data.collection.findIndex((item) => item.id === activeHatchling?.id),
    0,
  );
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [draftName, setDraftName] = useState("");
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
          <ProgressBar progress={selectedHatchling.bond / 100} />
          <ProgressBar progress={getHatchlingXpProgress(selectedHatchling.xp)} />
          <Text style={styles.detailCaption}>
            {selectedHatchling.xp} Pal XP | Power{" "}
            {getHatchlingPowerScore(selectedHatchling)}
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
            <Stat label="Heart" value={selectedHatchling.stats.heart} />
            <Stat label="Power" value={selectedHatchling.stats.power} />
            <Stat label="Guard" value={selectedHatchling.stats.resilience} />
            <Stat label="Speed" value={selectedHatchling.stats.speed} />
          </View>
          <View style={styles.trainingCard}>
            <Text style={styles.trainingTitle}>Training cooldown</Text>
            <Text style={styles.trainingText}>
              {selectedHatchling.id === data.activeHatchlingId
                ? trainingStatus?.cooldownLabel
                : "Make this Pal active before training."}
            </Text>
            <Text style={styles.trainingHint}>
              +{TRAINING_XP} XP per session. Passive bond grows every{" "}
              {PASSIVE_BOND_HOURS} hours.
            </Text>
            <AppButton
              disabled={
                selectedHatchling.id !== data.activeHatchlingId ||
                !trainingStatus?.canTrain
              }
              label={
                selectedHatchling.id !== data.activeHatchlingId
                  ? "Set active Pal"
                  : trainingStatus?.canTrain
                    ? "Train now"
                    : "Training cooling down"
              }
              onPress={onTrainActiveHatchling}
              style={
                selectedHatchling.id !== data.activeHatchlingId ||
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
                ? "Training now"
                : "Train this Pal"
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
      </View>
      <View style={styles.grid}>
        {entries.map((entry) => (
          <DexCard entry={entry} key={entry.id} />
        ))}
      </View>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DexCard({ entry }: { entry: CreatureDexEntry }) {
  const unlocked = entry.ownedCount > 0;

  return (
    <View style={[styles.card, !unlocked && styles.lockedCard]}>
      <View style={!unlocked && styles.lockedAvatar}>
        <HatchlingAvatar
          element={entry.element}
          rarity={entry.rarity}
          size="small"
        />
      </View>
      <Text style={styles.cardName}>{unlocked ? entry.name : "Unknown"}</Text>
      <Text style={styles.cardMeta}>
        {capitalize(entry.rarity)} | {capitalize(entry.element)}
      </Text>
      <Text style={styles.cardDescription}>
        {unlocked ? entry.description : `Hatch a ${entry.rarity} ${entry.element} Egg.`}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.status, unlocked && styles.unlockedStatus]}>
          {unlocked ? "Unlocked" : "Locked"}
        </Text>
        {unlocked && <Text style={styles.count}>x{entry.ownedCount}</Text>}
        {unlocked && <SparkleBurst />}
      </View>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 35,
    marginTop: 5,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: 20,
    padding: 16,
  },
  detailCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 22,
    gap: 10,
    marginTop: 20,
    padding: 16,
  },
  detailSparkles: {
    alignItems: "center",
    marginBottom: 4,
  },
  emptyDetailCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
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
  renameCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
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
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 12,
  },
  trainingCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
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
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    gap: 8,
    padding: 12,
  },
  memoryRow: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 13,
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
    borderRadius: 14,
    padding: 10,
    width: "48%",
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
    marginBottom: 12,
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 10,
    width: "48%",
  },
  lockedCard: {
    opacity: 0.68,
  },
  lockedAvatar: {
    opacity: 0.34,
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
  },
  unlockedStatus: {
    color: colors.primary,
  },
  count: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  promptCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    marginTop: 18,
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
