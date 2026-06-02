import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { EggAvatar } from "../components/EggAvatar";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { toDateKey } from "../domain/date";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import { getActivitySummary, type ActivityDay } from "../domain/history";
import type { DailyAward, DailyXp, HatchUpData } from "../domain/models";
import { getProgression, type MonsterStage } from "../domain/progression";
import { ACTIVE_PROGRESSION_PROFILE } from "../domain/progressionConfig";
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
  latestSyncGains: { eggSteps: number; xp: DailyXp };
  latestEvolution: MonsterStage | null;
  onMonsterPress: () => void;
  onSettingsPress: () => void;
  onSync: () => Promise<void>;
}

export function HomeScreen({
  data,
  error,
  isSyncing,
  latestSync,
  latestSyncGains,
  latestEvolution,
  onMonsterPress,
  onSettingsPress,
  onSync,
}: Props) {
  const todayKey = toDateKey(new Date());
  const progression = getProgression(data.totalXp);
  const today =
    latestSync?.date === todayKey
      ? latestSync
      : data.dailyAward?.date === todayKey
        ? data.dailyAward
        : null;
  const eggProgress = getEggProgress(data.activeEgg);
  const eggReady = isEggReady(data.activeEgg);
  const quests = getDailyQuests(today);
  const activity = getActivitySummary(data.activityHistory, todayKey);

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
        <Text style={styles.sectionMeta}>
          {ACTIVE_PROGRESSION_PROFILE.xp.dailyMax} XP daily max
        </Text>
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
      {latestSync?.date === todayKey && (
        <View style={styles.syncReceipt}>
          <Text style={styles.syncReceiptTitle}>Movement collected</Text>
          <Text style={styles.syncReceiptText}>
            +{latestSyncGains.xp.total} XP and +
            {latestSyncGains.eggSteps.toLocaleString()} incubator steps
          </Text>
          <Text style={styles.syncReceiptBreakdown}>
            {getRewardBreakdown(latestSyncGains.xp)}
          </Text>
          {latestEvolution && (
            <Text style={styles.evolutionReceipt}>
              {capitalize(latestEvolution)} evolution unlocked!
            </Text>
          )}
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.syncNote}>
        {data.lastSyncedDate
          ? `Last synced ${new Date(data.lastSyncedDate).toLocaleTimeString(
              [],
              {
                hour: "numeric",
                minute: "2-digit",
              },
            )}`
          : "Sync once to collect today's XP."}
      </Text>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your last 7 days</Text>
        <Text style={styles.sectionMeta}>{activity.activeDays}/7 active</Text>
      </View>
      <View style={styles.activityCard}>
        <View style={styles.activityStats}>
          <ActivityStat label="Steps" value={activity.steps.toLocaleString()} />
          <ActivityStat label="XP earned" value={String(activity.xp)} />
        </View>
        <View style={styles.chart}>
          {activity.days.map((day) => (
            <ActivityBar day={day} key={day.date} />
          ))}
        </View>
      </View>
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
            {capitalize(data.activeEgg.rarity)}{" "}
            {capitalize(data.activeEgg.element)} egg
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

function Metric({
  label,
  value,
  xp,
}: {
  label: string;
  value: string;
  xp: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricXp}>+{xp} XP</Text>
    </View>
  );
}

function ActivityStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.activityValue}>{value}</Text>
      <Text style={styles.activityLabel}>{label}</Text>
    </View>
  );
}

function ActivityBar({ day }: { day: ActivityDay }) {
  const xp = day.award?.xp.total ?? 0;
  const fillHeight =
    xp > 0
      ? Math.max(
          12,
          Math.round((xp / ACTIVE_PROGRESSION_PROFILE.xp.dailyMax) * 62),
        )
      : 6;

  return (
    <View style={styles.chartDay}>
      <View style={styles.chartTrack}>
        <View
          style={[
            styles.chartFill,
            { height: fillHeight },
            xp === 0 && styles.chartFillEmpty,
          ]}
        />
      </View>
      <Text style={styles.chartLabel}>{day.dayLabel}</Text>
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
        {quest.rewardXp > 0 && (
          <Text style={styles.questReward}>Reward: +{quest.rewardXp} XP</Text>
        )}
      </View>
      <Text
        style={[styles.questStatus, complete && styles.questStatusComplete]}
      >
        {complete ? "Done" : "Active"}
      </Text>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getRewardBreakdown(xp: DailyXp) {
  const movement = xp.steps + xp.activeCalories + xp.workouts;
  const parts = [`Movement +${movement}`];
  if (xp.quests > 0) parts.push(`Quests +${xp.quests}`);
  if (xp.firstSync > 0) parts.push(`Daily sync +${xp.firstSync}`);
  return parts.join(" | ");
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
  syncReceipt: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    marginTop: 10,
    padding: 12,
  },
  syncReceiptTitle: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  syncReceiptText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  syncReceiptBreakdown: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
  },
  evolutionReceipt: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 7,
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
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginBottom: 22,
    padding: 14,
  },
  activityStats: {
    flexDirection: "row",
    gap: 28,
    marginBottom: 15,
  },
  activityValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  activityLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  chart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    height: 82,
    justifyContent: "space-between",
  },
  chartDay: {
    alignItems: "center",
    flex: 1,
    gap: 5,
  },
  chartTrack: {
    alignItems: "center",
    height: 62,
    justifyContent: "flex-end",
    width: "100%",
  },
  chartFill: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    width: "70%",
  },
  chartFillEmpty: {
    backgroundColor: colors.line,
  },
  chartLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
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
  questReward: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
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
