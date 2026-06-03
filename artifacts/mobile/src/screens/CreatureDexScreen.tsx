import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import {
  getCreatureDexEntries,
  getDexCompletion,
  type CreatureDexEntry,
} from "../domain/creatureDex";
import type { HatchUpData } from "../domain/models";
import { colors } from "../theme";

interface Props {
  data: HatchUpData;
  onHomePress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onSettingsPress: () => void;
}

export function CreatureDexScreen({
  data,
  onHomePress,
  onLeaderboardPress,
  onMonsterPress,
  onSettingsPress,
}: Props) {
  const entries = getCreatureDexEntries(data.collection);
  const completion = getDexCompletion(data.collection);

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
      <Text style={styles.kicker}>CREATURE DEX</Text>
      <Text style={styles.title}>Collect every HatchUp companion.</Text>
      <Text style={styles.body}>
        Hatch eggs through movement to unlock new elemental creatures. Locked
        entries show silhouettes so testers always know what is left to find.
      </Text>
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Dex completion</Text>
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
        <Text style={styles.promptTitle}>Art-ready build</Text>
        <Text style={styles.promptText}>
          The Dex is wired for the real creature art pack. Use the prompt guide
          in the repo to generate transparent PNG assets, then swap the fallback
          avatars for images.
        </Text>
        <AppButton label="Keep hatching" onPress={onMonsterPress} />
      </View>
    </Screen>
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
        {unlocked ? entry.description : `Hatch a ${entry.rarity} ${entry.element} egg.`}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.status, unlocked && styles.unlockedStatus]}>
          {unlocked ? "Unlocked" : "Locked"}
        </Text>
        {unlocked && <Text style={styles.count}>x{entry.ownedCount}</Text>}
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
});
