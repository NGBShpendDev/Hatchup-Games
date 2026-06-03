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
import { metersToMiles, stepsToMiles } from "../domain/leaderboard";
import type { DailyAward, DailyXp, HatchUpData } from "../domain/models";
import { getProgression, type MonsterStage } from "../domain/progression";
import { ACTIVE_PROGRESSION_PROFILE } from "../domain/progressionConfig";
import {
  getDailyQuests,
  getQuestProgress,
  isQuestComplete,
  type DailyQuest,
} from "../domain/quests";
import { getRetentionPlan } from "../domain/retention";
import { colors } from "../theme";

interface Props {
  data: HatchUpData;
  error: string | null;
  isSyncing: boolean;
  latestSync: DailyAward | null;
  latestSyncGains: { eggSteps: number; xp: DailyXp };
  latestEvolution: MonsterStage | null;
  onDexPress: () => void;
  onLeaderboardPress: () => void;
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
  onDexPress,
  onLeaderboardPress,
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
  const quests = getDailyQuests(today);
  const activity = getActivitySummary(data.activityHistory, todayKey);
  const readyEggCount = data.activeEggs.filter(isEggReady).length;
  const completedQuestCount = quests.filter(isQuestComplete).length;
  const todayDistanceMiles = getTodayDistanceMiles(today);
  const retention = getRetentionPlan(data, todayKey);
  const nextAction = getNextAction({
    completedQuestCount,
    data,
    isSyncing,
    onLeaderboardPress,
    onMonsterPress,
    onSync,
    questCount: quests.length,
    readyEggCount,
    today,
  });

  return (
    <Screen
      footer={
        <BottomNav
          active="home"
          onDexPress={onDexPress}
          onHomePress={() => undefined}
          onLeaderboardPress={onLeaderboardPress}
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
      <View style={styles.actionCard}>
        <Text style={styles.actionKicker}>NEXT BEST ACTION</Text>
        <Text style={styles.actionTitle}>{nextAction.title}</Text>
        <Text style={styles.actionText}>{nextAction.body}</Text>
        <AppButton
          disabled={nextAction.disabled}
          label={nextAction.label}
          onPress={nextAction.onPress}
          style={nextAction.disabled ? styles.disabledAction : undefined}
          variant={nextAction.variant}
        />
      </View>
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>{retention.label}</Text>
          <Text style={styles.goalMeta}>
            {retention.weeklySteps.toLocaleString()} /{" "}
            {retention.weeklyGoalSteps.toLocaleString()}
          </Text>
        </View>
        <ProgressBar progress={retention.progress} />
        <Text style={styles.goalText}>{retention.message}</Text>
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
          label="Distance"
          value={`${todayDistanceMiles.toFixed(1)} mi`}
        />
        <Metric
          label="Energy"
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
            {latestSyncGains.eggSteps.toLocaleString()} steps to each egg
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
        <Text style={styles.sectionMeta}>
          {readyEggCount}/{data.activeEggs.length} ready
        </Text>
      </View>
      <View style={styles.incubatorStack}>
        {data.activeEggs.map((egg, index) => (
          <View style={styles.incubatorCard} key={egg.id}>
            <EggAvatar element={egg.element} rarity={egg.rarity} size="small" />
            <View style={styles.incubatorBody}>
              <Text style={styles.eggTitle}>
                Slot {index + 1}: {capitalize(egg.rarity)} {capitalize(egg.element)}
              </Text>
              <Text style={styles.eggCaption}>
                {isEggReady(egg)
                  ? "Ready to hatch in your Hatchery."
                  : `${egg.stepsWalked.toLocaleString()} / ${egg.stepsRequired.toLocaleString()} steps`}
              </Text>
              <ProgressBar progress={getEggProgress(egg)} />
            </View>
          </View>
        ))}
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
  xp?: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {xp !== undefined && <Text style={styles.metricXp}>+{xp} XP</Text>}
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

function getTodayDistanceMiles(today: DailyAward | null) {
  if (!today) return 0;
  if ((today.health.distanceMeters ?? 0) > 0) {
    return metersToMiles(today.health.distanceMeters ?? 0);
  }
  return stepsToMiles(today.health.steps);
}

function getNextAction({
  completedQuestCount,
  data,
  isSyncing,
  onLeaderboardPress,
  onMonsterPress,
  onSync,
  questCount,
  readyEggCount,
  today,
}: {
  completedQuestCount: number;
  data: HatchUpData;
  isSyncing: boolean;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onSync: () => Promise<void>;
  questCount: number;
  readyEggCount: number;
  today: DailyAward | null;
}) {
  if (readyEggCount > 0) {
    return {
      body: "Your movement filled an incubator slot. Hatch it now, then see what rarity rolls next.",
      disabled: false,
      label: readyEggCount > 1 ? `Hatch ${readyEggCount} eggs` : "Open Hatchery",
      onPress: onMonsterPress,
      title: `${readyEggCount} egg${readyEggCount === 1 ? "" : "s"} ready`,
      variant: "primary" as const,
    };
  }

  if (!today) {
    return {
      body: "Sync once to collect XP, fill your eggs, and unlock today's quests.",
      disabled: isSyncing,
      label: isSyncing ? "Syncing..." : "Collect movement",
      onPress: onSync,
      title: "Start today's loop",
      variant: "primary" as const,
    };
  }

  if (completedQuestCount < questCount) {
    return {
      body: "Move a little more, then sync again to push your quests and eggs forward.",
      disabled: isSyncing,
      label: isSyncing ? "Syncing..." : "Sync after moving",
      onPress: onSync,
      title: `${questCount - completedQuestCount} quest${questCount - completedQuestCount === 1 ? "" : "s"} left`,
      variant: "secondary" as const,
    };
  }

  if (!data.leaderboardShareEnabled) {
    return {
      body: "Optional sharing lets you compare weekly steps, distance, and XP in beta rankings.",
      disabled: false,
      label: "View Rankings",
      onPress: onLeaderboardPress,
      title: "Try the leaderboard",
      variant: "secondary" as const,
    };
  }

  return {
    body: "You collected today's rewards. Keep the streak alive tomorrow or move more to climb ranks.",
    disabled: false,
    label: "View Rankings",
    onPress: onLeaderboardPress,
    title: "Daily loop complete",
    variant: "secondary" as const,
  };
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
    marginBottom: 12,
    padding: 18,
  },
  actionCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    gap: 10,
    marginBottom: 22,
    padding: 16,
  },
  goalCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    gap: 10,
    marginBottom: 22,
    padding: 16,
  },
  goalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  goalMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  goalText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  actionKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  actionTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
  },
  actionText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  disabledAction: {
    opacity: 0.58,
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  metric: {
    backgroundColor: colors.surface,
    borderRadius: 15,
    padding: 12,
    width: "48%",
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
    padding: 14,
  },
  incubatorStack: {
    gap: 8,
    marginBottom: 22,
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
