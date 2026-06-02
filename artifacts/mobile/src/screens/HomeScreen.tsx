import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { EggAvatar } from "../components/EggAvatar";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import type { DailyAward, HatchUpData } from "../domain/models";
import { getProgression } from "../domain/progression";
import {
  getDailyQuests,
  getQuestProgress,
  isQuestComplete,
  type DailyQuest,
} from "../domain/quests";
import { colors } from "../theme";

interface Props {
  data: HatchUpData;
  error: string | null;
  isSyncing: boolean;
  latestSync: DailyAward | null;
  onMonsterPress: () => void;
  onSettingsPress: () => void;
  onSync: () => Promise<void>;
}

export function HomeScreen({
  data,
  error,
  isSyncing,
  latestSync,
  onMonsterPress,
  onSettingsPress,
  onSync,
}: Props) {
  const progression = getProgression(data.totalXp);
  const today = latestSync ?? data.dailyAward;
  const eggProgress = getEggProgress(data.activeEgg);
  const eggReady = isEggReady(data.activeEgg);
  const quests = getDailyQuests(today);

  return (
    <Screen
      footer={
        <BottomNav
          active="home"
          onHomePress={() => undefined}
          onMonsterPress={onMonsterPress}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TODAY WITH</Text>
          <Text style={styles.title}>{data.monsterName}</Text>
        </View>
        <View style={styles.streak}>
          <Text style={styles.streakNumber}>{data.currentStreak}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      </View>
      <View style={styles.heroCard}>
        <MonsterAvatar stage={progression.current.id} />
        <Text style={styles.stage}>{progression.current.label} stage</Text>
        <Text style={styles.xp}>{data.totalXp} total XP</Text>
        <ProgressBar progress={progression.progress} />
        <Text style={styles.next}>
          {progression.next
            ? `${progression.xpToNext} XP until ${progression.next.label}`
            : "Final evolution reached"}
        </Text>
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today's movement</Text>
        <Text style={styles.sectionMeta}>100 XP daily max</Text>
      </View>
      <View style={styles.metrics}>
        <Metric
          label="Steps"
          value={today?.health.steps.toLocaleString() ?? "0"}
          xp={today?.xp.steps ?? 0}
        />
        <Metric
          label="Active cal"
          value={today?.health.activeCalories.toLocaleString() ?? "0"}
          xp={today?.xp.activeCalories ?? 0}
        />
        <Metric
          label="Workouts"
          value={String(today?.health.workouts ?? 0)}
          xp={today?.xp.workouts ?? 0}
        />
      </View>
      <AppButton
        label={isSyncing ? "Syncing movement..." : "Sync health data"}
        onPress={onSync}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.syncNote}>
        {data.lastSyncedDate
          ? `Last synced ${new Date(data.lastSyncedDate).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : "Sync once to collect today's XP."}
      </Text>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Incubator</Text>
        <Text style={styles.sectionMeta}>{data.eggsHatched} hatched</Text>
      </View>
      <View style={styles.incubatorCard}>
        <EggAvatar
          element={data.activeEgg.element}
          rarity={data.activeEgg.rarity}
          size="small"
        />
        <View style={styles.incubatorBody}>
          <Text style={styles.eggTitle}>
            {capitalize(data.activeEgg.rarity)} {capitalize(data.activeEgg.element)} egg
          </Text>
          <Text style={styles.eggCaption}>
            {eggReady
              ? "Ready to hatch in your monster tab."
              : `${data.activeEgg.stepsWalked.toLocaleString()} / ${data.activeEgg.stepsRequired.toLocaleString()} steps`}
          </Text>
          <ProgressBar progress={eggProgress} />
        </View>
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Daily quests</Text>
        <Text style={styles.sectionMeta}>
          {quests.filter(isQuestComplete).length}/{quests.length} complete
        </Text>
      </View>
      <View style={styles.questList}>
        {quests.map((quest) => (
          <Quest key={quest.id} quest={quest} />
        ))}
      </View>
    </Screen>
  );
}

function Metric({ label, value, xp }: { label: string; value: string; xp: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricXp}>+{xp} XP</Text>
    </View>
  );
}

function Quest({ quest }: { quest: DailyQuest }) {
  const complete = isQuestComplete(quest);

  return (
    <View style={styles.quest}>
      <View style={[styles.questDot, complete && styles.questDotComplete]} />
      <View style={styles.questBody}>
        <Text style={styles.questLabel}>{quest.label}</Text>
        <Text style={styles.questCaption}>
          {Math.min(quest.current, quest.target).toLocaleString()} /{" "}
          {quest.target.toLocaleString()} {quest.unit}
        </Text>
        <ProgressBar progress={getQuestProgress(quest)} />
      </View>
      <Text style={[styles.questStatus, complete && styles.questStatusComplete]}>
        {complete ? "Done" : "Active"}
      </Text>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 3,
  },
  streak: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  streakNumber: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  streakLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    marginBottom: 22,
    padding: 18,
  },
  stage: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  xp: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 12,
    marginTop: 5,
    textAlign: "center",
  },
  next: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 9,
    textAlign: "center",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  metric: {
    backgroundColor: colors.surface,
    borderRadius: 15,
    flex: 1,
    padding: 12,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  metricValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  metricXp: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  syncNote: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 9,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 9,
    textAlign: "center",
  },
  incubatorCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
    padding: 14,
  },
  incubatorBody: {
    flex: 1,
    gap: 8,
  },
  eggTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  eggCaption: {
    color: colors.muted,
    fontSize: 12,
  },
  questList: {
    gap: 8,
  },
  quest: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 15,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  questDot: {
    backgroundColor: colors.line,
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  questDotComplete: {
    backgroundColor: colors.primary,
  },
  questBody: {
    flex: 1,
    gap: 6,
  },
  questLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  questCaption: {
    color: colors.muted,
    fontSize: 11,
  },
  questStatus: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  questStatusComplete: {
    color: colors.primary,
  },
});
