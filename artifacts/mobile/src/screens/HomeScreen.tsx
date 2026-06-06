import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import { PageTitle, SegmentedControl } from "../components/ui";
import {
  ENABLE_SHOP,
  ENABLE_WEEKLY_CHEST,
} from "../config/features";
import {
  getCollectionNudge,
  getEggProgressMessage,
  getReturnTomorrowMessage,
  getScreenLoopSubtitle,
} from "../content/coreLoopCopy";
import { toDateKey } from "../domain/date";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import {
  getActiveHatchling,
  getHatchlingXpProgress,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import { getActivitySummary, type ActivityDay } from "../domain/history";
import { metersToMiles, stepsToMiles } from "../domain/leaderboard";
import type {
  CollectedHatchling,
  DailyAward,
  DailyXp,
  HatchUpData,
  QuestRewardReceipt,
} from "../domain/models";
import { getProgression, type MonsterStage } from "../domain/progression";
import { ACTIVE_PROGRESSION_PROFILE } from "../domain/progressionConfig";
import { getWeeklyRewardChest } from "../domain/rewardChests";
import {
  getClaimableQuestCount,
  getDailyQuests,
  getNextQuestSuggestions,
  getQuestCompletionRatio,
  getQuestProgress,
  getQuestRemainingText,
  getQuestRewardKey,
  getQuestRewardLabel,
  getQuestTierLabel,
  getWeeklyQuests,
  isQuestComplete,
  type Quest as QuestModel,
  type QuestCadence,
} from "../domain/quests";
import {
  getCurrentFirstWeekMission,
  getFirstWeekMissions,
  getRetentionPlan,
  type FirstWeekMission,
  type FirstWeekTarget,
} from "../domain/retention";
import { SHOP_ITEMS, type ShopItem, type ShopItemId } from "../domain/shop";
import { colors, radii, typography } from "../theme";
import type { LatestSyncGains } from "../useHatchUpApp";
import {
  formatDistanceMiles,
  formatNumber,
  formatPercent,
  formatSteps,
} from "../utils/format";
import {
  impactSyncSuccess,
  notifySyncSuccess,
  notifySyncWarning,
} from "../utils/haptics";
import { CardEntrance, SyncSuccessShimmer } from "../utils/animations";

interface Props {
  data: HatchUpData;
  error: string | null;
  isSyncing: boolean;
  latestSync: DailyAward | null;
  latestSyncGains: LatestSyncGains;
  latestEvolution: MonsterStage | null;
  onBuyShopItem: (itemId: ShopItemId) => Promise<boolean>;
  onClaimWeeklyChest: (today: string) => Promise<boolean>;
  onClaimQuestReward: (quest: QuestModel, today: string) => Promise<boolean>;
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
  onBuyShopItem,
  onClaimWeeklyChest,
  onClaimQuestReward,
  onDexPress,
  onLeaderboardPress,
  onMonsterPress,
  onSettingsPress,
  onSync,
}: Props) {
  const [questCadence, setQuestCadence] = useState<QuestCadence>("daily");
  const [rewardDismissed, setRewardDismissed] = useState(false);
  const lastErrorRef = useRef(error);
  const wasSyncingRef = useRef(isSyncing);
  const todayKey = toDateKey(new Date());
  const progression = getProgression(data.totalXp);
  const today =
    latestSync?.date === todayKey
      ? latestSync
      : data.dailyAward?.date === todayKey
        ? data.dailyAward
        : null;
  const quests = getDailyQuests(today);
  const weeklyQuests = getWeeklyQuests(data, todayKey);
  const enabledQuestCadences: QuestCadence[] = ["daily", "weekly"];
  const activeQuestCadence = enabledQuestCadences.includes(questCadence)
    ? questCadence
    : "daily";
  const visibleQuests =
    activeQuestCadence === "daily"
      ? quests
      : weeklyQuests;
  const visibleQuestCompletion = getQuestCompletionRatio(visibleQuests);
  const visibleClaimableQuestCount = getClaimableQuestCount(
    visibleQuests,
    todayKey,
    data.claimedQuestRewards,
  );
  const nextQuestSuggestions = getNextQuestSuggestions(visibleQuests);
  const activity = getActivitySummary(data.activityHistory, todayKey);
  const readyEggCount = data.activeEggs.filter(isEggReady).length;
  const completedQuestCount = quests.filter(isQuestComplete).length;
  const todayDistanceMiles = getTodayDistanceMiles(today);
  const retention = getRetentionPlan(data, todayKey);
  const firstWeekMission = getCurrentFirstWeekMission(data, todayKey);
  const firstWeekMissions = getFirstWeekMissions(data, todayKey);
  const weeklyChest = getWeeklyRewardChest(data, todayKey);
  const effectiveWeeklyChest = {
    ...weeklyChest,
    canClaim: ENABLE_WEEKLY_CHEST && weeklyChest.canClaim,
  };
  const activeHatchlingRaw = getActiveHatchling(data);
  const activeHatchling = activeHatchlingRaw
    ? getTimeAdjustedHatchling(activeHatchlingRaw)
    : null;
  const focusEgg =
    data.activeEggs.find((egg) => !isEggReady(egg)) ?? data.activeEggs[0];
  const trainingStatus = activeHatchling
    ? getTrainingStatus(activeHatchling)
    : null;
  const showRewardFeedback =
    !rewardDismissed &&
    hasSyncRewards(latestSyncGains) &&
    (latestSync?.date === todayKey ||
      latestSyncGains.accountXp > 0 ||
      latestSyncGains.coins > 0);
  useEffect(() => {
    setRewardDismissed(false);
  }, [latestSync]);
  useEffect(() => {
    if (wasSyncingRef.current && !isSyncing) {
      if (!error && hasSyncRewards(latestSyncGains)) {
        if (readyEggCount > 0) {
          void notifySyncSuccess();
        } else {
          void impactSyncSuccess();
        }
      }
    }

    wasSyncingRef.current = isSyncing;
  }, [error, isSyncing, latestSyncGains, readyEggCount]);
  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      void notifySyncWarning();
    }

    lastErrorRef.current = error;
  }, [error]);
  const handleMissionPress = getMissionAction({
    onDexPress,
    onLeaderboardPress,
    onMonsterPress,
    onSettingsPress,
    onSync,
  });
  const firstWeekMissionAction = handleMissionPress(firstWeekMission.target);
  const claimableQuest = getFirstClaimableQuest(
    [...quests, ...weeklyQuests],
    todayKey,
    data.claimedQuestRewards,
  );
  const nextAction = getNextAction({
    activeHatchling,
    claimableQuest,
    data,
    firstWeekMission,
    firstWeekMissionAction,
    isSyncing,
    onClaimQuestReward,
    onClaimWeeklyChest,
    onDexPress,
    onMonsterPress,
    onSync,
    rewardAvailable: showRewardFeedback,
    readyEggCount,
    trainingStatus,
    today,
    todayKey,
    weeklyChest: effectiveWeeklyChest,
  });
  const syncResultAction = getSyncResultAction({
    activeHatchling,
    gains: latestSyncGains,
    onDexPress,
    onMonsterPress,
    readyEggCount,
  });
  const handleSyncResultAction = () => {
    setRewardDismissed(true);
    syncResultAction.onPress();
  };

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
      <PageTitle
        eyebrow="Today's journey"
        right={
          <View style={styles.streak}>
            {data.currentStreak > 0 && <SparkleBurst tone="accent" />}
            <Text style={styles.streakNumber}>{data.currentStreak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
        }
        title={activeHatchling ? activeHatchling.name : data.monsterName}
      />
      <DailyHeroCard
        activeHatchling={activeHatchling}
        focusEgg={focusEgg}
        latestEvolution={latestEvolution}
        latestSyncGains={latestSyncGains}
        progression={progression}
        today={today}
      />
      <NextActionCard nextAction={nextAction} />
      {today && (
        <SyncSummaryCard
          focusEgg={focusEgg}
          gains={latestSyncGains}
          today={today}
        />
      )}
      <SyncResultBottomSheet
        gains={latestSyncGains}
        latestEvolution={latestEvolution}
        onClose={() => setRewardDismissed(true)}
        onPrimaryAction={handleSyncResultAction}
        primaryLabel={syncResultAction.label}
        visible={showRewardFeedback}
      />
      <TodaySummaryRow
        focusEgg={focusEgg}
        movementXp={today?.xp.total ?? 0}
        today={today}
      />
      <WeeklyGoalCard
        chest={effectiveWeeklyChest}
        onClaim={() => onClaimWeeklyChest(todayKey)}
        retention={retention}
      />
      <CollapsibleSection
        badge={formatSteps(today?.health.steps ?? 0)}
        subtitle="Detailed movement stats are here when you want the full breakdown."
        title="Movement details"
      >
        <View style={styles.metrics}>
          <Metric
            label="Steps"
            value={formatNumber(today?.health.steps ?? 0)}
            xp={today?.xp.steps ?? 0}
            animate={Boolean(today?.xp.steps)}
          />
          <Metric
            label="Distance"
            value={formatDistanceMiles(todayDistanceMiles)}
          />
          <Metric
            label="Energy"
            value={formatNumber(today?.health.activeCalories ?? 0)}
            xp={today?.xp.activeCalories ?? 0}
            animate={Boolean(today?.xp.activeCalories)}
          />
          <Metric
            label="Workouts"
            value={String(today?.health.workouts ?? 0)}
            xp={today?.xp.workouts ?? 0}
            animate={Boolean(today?.xp.workouts)}
          />
        </View>
        <AppButton
          label={isSyncing ? "Syncing movement..." : "Sync movement"}
          onPress={onSync}
        />
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
            : "Sync movement once to start today's Egg progress."}
        </Text>
      </CollapsibleSection>
      <CollapsibleSection
        badge={
          visibleClaimableQuestCount > 0
            ? `${visibleClaimableQuestCount} claimable`
            : `${visibleQuests.filter(isQuestComplete).length}/${visibleQuests.length}`
        }
        subtitle="Small goals that help today's Egg and Pal grow."
        title="Quests"
      >
        <SegmentedControl
          onChange={setQuestCadence}
          options={enabledQuestCadences.map((cadence) => ({
            label: capitalize(cadence),
            value: cadence,
          }))}
          value={activeQuestCadence}
        />
        <DailyMissionSummaryCard
          completedQuestCount={completedQuestCount}
          firstWeekMission={firstWeekMission}
          firstWeekMissions={firstWeekMissions}
          onFirstWeekPress={firstWeekMissionAction}
          questCount={quests.length}
        />
        <QuestBoardSummary
          cadence={activeQuestCadence}
          claimableCount={visibleClaimableQuestCount}
          completion={visibleQuestCompletion}
          quests={visibleQuests}
          suggestions={nextQuestSuggestions}
        />
        <View style={styles.questList}>
          {visibleQuests.map((quest) => (
            <Quest
              claimed={data.claimedQuestRewards.includes(
                getQuestRewardKey(quest, todayKey),
              )}
              key={quest.id}
              onClaim={() => onClaimQuestReward(quest, todayKey)}
              quest={quest}
            />
          ))}
        </View>
      </CollapsibleSection>
      <CollapsibleSection
        badge={`${activity.activeDays}/7 active`}
        subtitle="Review the recent movement that fed your Eggs, quests, and streak."
        title="Last 7 days"
      >
        <View style={styles.activityCard}>
          <View style={styles.activityStats}>
            <ActivityStat label="Steps" value={formatNumber(activity.steps)} />
            <ActivityStat label="Journey XP" value={formatNumber(activity.xp)} />
          </View>
          <View style={styles.chart}>
            {activity.days.map((day) => (
              <ActivityBar day={day} key={day.date} />
            ))}
          </View>
        </View>
      </CollapsibleSection>
      {ENABLE_SHOP && (
        <CollapsibleSection
          badge={`${formatNumber(data.coins)} coins`}
          subtitle="Boosts stay available, but the daily loop stays first."
          title="Coin shop"
        >
          <CoinShopCard
            activeHatchling={activeHatchling}
            coins={data.coins}
            onBuy={onBuyShopItem}
          />
        </CollapsibleSection>
      )}
    </Screen>
  );
}

function DailyHeroCard({
  activeHatchling,
  focusEgg,
  latestEvolution,
  latestSyncGains,
  progression,
  today,
}: {
  activeHatchling: CollectedHatchling | null;
  focusEgg: HatchUpData["activeEgg"] | undefined;
  latestEvolution: MonsterStage | null;
  latestSyncGains: LatestSyncGains;
  progression: ReturnType<typeof getProgression>;
  today: DailyAward | null;
}) {
  const showingEgg = Boolean(focusEgg);

  return (
    <CardEntrance style={styles.heroCard}>
      {focusEgg ? (
        <EggAvatar element={focusEgg.element} rarity={focusEgg.rarity} />
      ) : activeHatchling ? (
        <HatchlingAvatar
          element={activeHatchling.element}
          level={activeHatchling.level}
          rarity={activeHatchling.rarity}
        />
      ) : (
        <MonsterAvatar stage={progression.current.id} />
      )}
      <Text style={styles.stage}>
        {focusEgg
          ? `${capitalize(focusEgg.rarity)} ${capitalize(focusEgg.element)} Egg`
          : activeHatchling
            ? `Active Pal | ${capitalize(activeHatchling.rarity)} ${capitalize(activeHatchling.element)}`
            : `${progression.current.label} starter Pal`}
      </Text>
      <Text style={styles.xp}>
        {focusEgg
          ? `${formatPercent(getEggProgress(focusEgg))} hatch progress`
          : activeHatchling
            ? `Level ${activeHatchling.level} | Bond ${activeHatchling.bond}/100`
            : `${progression.current.label} journey`}
      </Text>
      {(latestEvolution || latestSyncGains.xp.total > 0 || latestSyncGains.palXp > 0) && (
        <View style={styles.heroSparkles}>
          <SparkleBurst
            label={latestEvolution ? "LEVEL UP" : showingEgg ? "EGG PROGRESS" : "XP GAIN"}
            tone="accent"
          />
        </View>
      )}
      <ProgressBar
        progress={
          focusEgg
            ? getEggProgress(focusEgg)
            : activeHatchling
              ? getHatchlingXpProgress(activeHatchling.xp)
              : progression.progress
        }
      />
      <Text style={styles.next}>
        {getDailyHeroMessage({
          activeHatchling,
          focusEgg,
          latestSyncGains,
          today,
        })}
      </Text>
      <Text style={styles.loopPromise}>{getScreenLoopSubtitle("home")}</Text>
    </CardEntrance>
  );
}

function TodaySummaryRow({
  focusEgg,
  movementXp,
  today,
}: {
  focusEgg: HatchUpData["activeEgg"] | undefined;
  movementXp: number;
  today: DailyAward | null;
}) {
  const todayDistanceMiles = getTodayDistanceMiles(today);

  return (
    <View style={styles.summaryRow}>
      <SummaryTile
        label="Steps"
        value={formatNumber(today?.health.steps ?? 0)}
      />
      <SummaryTile label="Distance" value={formatDistanceMiles(todayDistanceMiles)} />
      <SummaryTile label="Journey XP" value={`+${formatNumber(movementXp)}`} />
      <SummaryTile
        label="Egg progress"
        value={focusEgg ? formatPercent(getEggProgress(focusEgg)) : "None"}
      />
    </View>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function WeeklyGoalCard({
  chest,
  onClaim,
  retention,
}: {
  chest: ReturnType<typeof getWeeklyRewardChest>;
  onClaim: () => Promise<boolean>;
  retention: ReturnType<typeof getRetentionPlan>;
}) {
  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View style={styles.goalHeaderText}>
          <Text style={styles.goalKicker}>WEEKLY GOAL</Text>
          <Text style={styles.goalTitle}>{retention.label}</Text>
        </View>
        <Text style={styles.goalMeta}>
          {formatNumber(retention.weeklySteps)} /{" "}
          {formatNumber(retention.weeklyGoalSteps)}
        </Text>
      </View>
      <ProgressBar progress={retention.progress} />
      <Text style={styles.goalText}>{retention.message}</Text>
      {ENABLE_WEEKLY_CHEST && (
        <View style={styles.weeklyChestTeaser}>
          <View style={styles.weeklyChestText}>
            <Text style={styles.weeklyChestTitle}>
              {chest.canClaim ? "Weekly chest ready" : "Weekly chest progress"}
            </Text>
            <Text style={styles.weeklyChestBody}>
              {chest.canClaim
                ? `Claim ${formatNumber(chest.rewardCoins)} coins, ${formatNumber(chest.rewardAccountXp)} Journey XP, and ${formatNumber(chest.rewardEggSteps)} Egg progress.`
                : `${formatPercent(chest.progress)} toward coins, Journey XP, and Egg progress.`}
            </Text>
          </View>
          {chest.canClaim ? (
            <AppButton
              label="Claim"
              onPress={() => {
                void onClaim();
              }}
              style={styles.weeklyChestButton}
            />
          ) : (
            <View style={[styles.weeklyChestButton, styles.statusPill]}>
              <Text style={styles.statusPillText}>
                {formatPercent(chest.progress)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function StarterGuideCard({
  healthConnected,
  onHatcheryPress,
  onSettingsPress,
  onSync,
  syncing,
}: {
  healthConnected: boolean;
  onHatcheryPress: () => void;
  onSettingsPress: () => void;
  onSync: () => Promise<void>;
  syncing: boolean;
}) {
  return (
    <View style={styles.starterGuideCard}>
      <Text style={styles.starterGuideKicker}>STARTER GUIDE</Text>
      <Text style={styles.starterGuideTitle}>Your Egg is waiting.</Text>
      <Text style={styles.starterGuideBody}>
        {healthConnected
          ? "Sync your first movement recap to fill the starter Egg and unlock your first rewards."
          : "Connect health when you are ready. Until then, you can preview your Hatchery and learn the loop."}
      </Text>
      <View style={styles.starterGuideActions}>
        <AppButton
          disabled={syncing}
          label={
            healthConnected
              ? syncing
                ? "Syncing..."
                : "Sync first rewards"
              : "Connect in Settings"
          }
          onPress={healthConnected ? onSync : onSettingsPress}
          style={styles.starterGuideButton}
        />
        <AppButton
          label="View Hatchery"
          onPress={onHatcheryPress}
          style={styles.starterGuideButton}
          variant="secondary"
        />
      </View>
    </View>
  );
}

function NextActionCard({
  nextAction,
}: {
  nextAction: ReturnType<typeof getNextAction>;
}) {
  return (
    <View style={styles.nextActionCard}>
      <View style={styles.nextActionHeader}>
        <View>
          <Text style={styles.actionKicker}>NEXT ACTION</Text>
          <Text style={styles.actionTitle}>{nextAction.title}</Text>
        </View>
        {nextAction.priority <= 3 && <SparkleBurst label="NOW" tone="accent" />}
      </View>
      <Text style={styles.actionText}>{nextAction.body}</Text>
      <AppButton
        disabled={nextAction.disabled}
        label={nextAction.label}
        onPress={nextAction.onPress}
        style={nextAction.disabled ? styles.disabledAction : undefined}
        variant={nextAction.variant}
      />
    </View>
  );
}

function SyncSummaryCard({
  focusEgg,
  gains,
  today,
}: {
  focusEgg: HatchUpData["activeEgg"] | undefined;
  gains: LatestSyncGains;
  today: DailyAward;
}) {
  const eggProgress = gains.eggSteps > 0
    ? `+${formatSteps(gains.eggSteps)}`
    : focusEgg
      ? formatPercent(getEggProgress(focusEgg))
      : "No Egg";

  return (
    <View style={styles.syncSummaryCard}>
      <View style={styles.syncSummaryHeader}>
        <View>
          <Text style={styles.syncSummaryKicker}>SYNCED TODAY</Text>
          <Text style={styles.syncSummaryTitle}>Movement saved</Text>
        </View>
        {hasSyncRewards(gains) && <SparkleBurst tone="accent" />}
      </View>
      <View style={styles.syncSummaryRow}>
        <SummaryTile label="Steps" value={formatSteps(today.health.steps)} />
        <SummaryTile
          label="XP"
          value={`+${formatNumber(gains.xp.total || today.xp.total)}`}
        />
        <SummaryTile label="Egg progress" value={eggProgress} />
      </View>
    </View>
  );
}

function DailySnapshotStrip({
  activeHatchling,
  claimableRewards,
  focusEgg,
  readyEggCount,
  today,
}: {
  activeHatchling: CollectedHatchling | null;
  claimableRewards: number;
  focusEgg: HatchUpData["activeEgg"] | undefined;
  readyEggCount: number;
  today: DailyAward | null;
}) {
  return (
    <View style={styles.snapshotStrip}>
      <SnapshotPill
        label="Sync"
        tone={today ? "ready" : "default"}
        value={today ? "Done today" : "Not yet"}
      />
      <SnapshotPill
        label="Egg"
        tone={readyEggCount > 0 ? "ready" : "default"}
        value={
          readyEggCount > 0
            ? `${readyEggCount} ready`
            : focusEgg
              ? formatPercent(getEggProgress(focusEgg))
              : "Empty"
        }
      />
      <SnapshotPill
        label="Pal"
        tone={activeHatchling ? "ready" : "default"}
        value={activeHatchling ? `Lv ${activeHatchling.level}` : "Hatch one"}
      />
      <SnapshotPill
        label="Rewards"
        tone={claimableRewards > 0 ? "ready" : "default"}
        value={claimableRewards > 0 ? `${claimableRewards} ready` : "None"}
      />
    </View>
  );
}

function SnapshotPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "default" | "ready";
  value: string;
}) {
  return (
    <View style={[styles.snapshotPill, tone === "ready" && styles.snapshotPillReady]}>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={[styles.snapshotValue, tone === "ready" && styles.snapshotValueReady]}>
        {value}
      </Text>
    </View>
  );
}

function TodayProgressCard({
  activeHatchling,
  dailyStepGoal,
  focusEgg,
  today,
}: {
  activeHatchling: CollectedHatchling | null;
  dailyStepGoal: number;
  focusEgg: HatchUpData["activeEgg"] | undefined;
  today: DailyAward | null;
}) {
  const steps = today?.health.steps ?? 0;
  const stepProgress = Math.min(steps / dailyStepGoal, 1);
  const palXpProgress = activeHatchling
    ? getHatchlingXpProgress(activeHatchling.xp)
    : 0;

  return (
    <View style={styles.todayProgressCard}>
      <View style={styles.todayProgressHeader}>
        <View>
          <Text style={styles.todayProgressKicker}>TODAY PROGRESS</Text>
          <Text style={styles.todayProgressTitle}>Movement powers hatching</Text>
        </View>
        <Text style={styles.todayProgressMeta}>
          {today ? "Synced today" : "Waiting for sync"}
        </Text>
      </View>
      <ProgressRow
        label="Daily steps"
        progress={stepProgress}
        value={`${formatNumber(steps)} / ${formatNumber(dailyStepGoal)}`}
      />
      <ProgressRow
        label="Active Egg"
        progress={focusEgg ? getEggProgress(focusEgg) : 0}
        value={
          focusEgg
            ? `${formatNumber(focusEgg.stepsWalked)} / ${formatNumber(focusEgg.stepsRequired)}`
            : "No Egg incubating"
        }
      />
      <ProgressRow
        label="Pal XP"
        progress={palXpProgress}
        value={
          activeHatchling
            ? `${formatNumber(activeHatchling.xp % 75)} / 75 to Lv ${activeHatchling.level + 1}`
            : "Hatch a Pal to unlock"
        }
      />
      <Text style={styles.todayProgressPrivacy}>
        Your movement powers today's hatch progress. Private health details stay
        off rankings unless you choose to share a public score.
      </Text>
    </View>
  );
}

function DailyMissionSummaryCard({
  completedQuestCount,
  firstWeekMission,
  firstWeekMissions,
  onFirstWeekPress,
  questCount,
}: {
  completedQuestCount: number;
  firstWeekMission: FirstWeekMission;
  firstWeekMissions: FirstWeekMission[];
  onFirstWeekPress: () => void;
  questCount: number;
}) {
  const dailyProgress = questCount > 0 ? completedQuestCount / questCount : 0;

  return (
    <View style={styles.dailyMissionCard}>
      <View style={styles.dailyMissionHeader}>
        <View>
          <Text style={styles.dailyMissionKicker}>DAILY MISSION SUMMARY</Text>
          <Text style={styles.dailyMissionTitle}>
            {completedQuestCount}/{questCount} daily quests complete
          </Text>
        </View>
        <Text style={styles.arcPill}>Day {firstWeekMission.day}</Text>
      </View>
      <ProgressBar progress={dailyProgress} />
      <View style={styles.firstWeekFocus}>
        <Text style={styles.firstWeekKicker}>First-week focus</Text>
        <Text style={styles.firstWeekTitle}>{firstWeekMission.label}</Text>
        <Text style={styles.firstWeekBody}>
          {getFirstWeekMissionWhy(firstWeekMission)}
        </Text>
        <AppButton
          label={
            firstWeekMission.complete
              ? "Review journey"
              : firstWeekMission.actionLabel
          }
          onPress={onFirstWeekPress}
          variant={firstWeekMission.complete ? "secondary" : "primary"}
        />
      </View>
      <View style={styles.firstWeekPips}>
        {firstWeekMissions.map((mission) => (
          <View
            key={mission.day}
            style={[
              styles.firstWeekPip,
              mission.complete && styles.firstWeekPipDone,
              mission.day === firstWeekMission.day && styles.firstWeekPipActive,
            ]}
          >
            <Text
              style={[
                styles.firstWeekPipText,
                (mission.complete || mission.day === firstWeekMission.day) &&
                  styles.firstWeekPipTextActive,
              ]}
            >
              {mission.day}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AccountProgressCard({
  accountXp,
  coins,
  history,
}: {
  accountXp: number;
  coins: number;
  history: QuestRewardReceipt[];
}) {
  const accountLevel = Math.floor(accountXp / 500) + 1;
  const levelProgress = (accountXp % 500) / 500;
  const recentHistory = history.slice(0, 3);

  return (
    <View style={styles.accountCard}>
      <View style={styles.accountHeader}>
        <View>
          <Text style={styles.accountKicker}>PLAYER PROGRESSION</Text>
          <Text style={styles.accountTitle}>Account Lv {accountLevel}</Text>
        </View>
        <Text style={styles.coinPill}>{formatNumber(coins)} coins</Text>
      </View>
      <ProgressBar progress={levelProgress} />
      <Text style={styles.accountText}>
        {formatNumber(500 - (accountXp % 500))} Journey XP to the next trainer level from
        movement, hatching, and quest rewards.
      </Text>
      <View style={styles.rewardHistoryPanel}>
        <Text style={styles.rewardHistoryTitle}>Recent quest claims</Text>
        {recentHistory.length > 0 ? (
          recentHistory.map((receipt) => (
            <View key={receipt.id} style={styles.rewardHistoryRow}>
              <View style={styles.rewardHistoryText}>
                <Text style={styles.rewardHistoryLabel}>{receipt.label}</Text>
                <Text style={styles.rewardHistoryMeta}>
                  Tier {receipt.tier} | {capitalize(receipt.cadence)}
                </Text>
              </View>
              <Text style={styles.rewardHistoryValue}>
                +{formatNumber(receipt.rewardAccountXp)} Journey XP
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.rewardHistoryEmpty}>
            Claim quests to turn movement into Egg progress, Pal growth, and a
            reason to return tomorrow.
          </Text>
        )}
      </View>
    </View>
  );
}

function ProgressRow({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressRowHeader}>
        <View style={styles.progressRowTitle}>
          <Text style={styles.progressRowLabel}>{label}</Text>
          {progress > 0 && <SparkleBurst />}
        </View>
        <Text style={styles.progressRowValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
}

function SyncResultBottomSheet({
  gains,
  latestEvolution,
  onClose,
  onPrimaryAction,
  primaryLabel,
  visible,
}: {
  gains: LatestSyncGains;
  latestEvolution: MonsterStage | null;
  onClose: () => void;
  onPrimaryAction: () => void;
  primaryLabel: string;
  visible: boolean;
}) {
  const rewards = getRewardRows(gains, latestEvolution);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.syncModalRoot}>
        <Pressable
          accessibilityLabel="Close sync result"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.syncModalBackdrop}
        />
        <View style={styles.syncSheet}>
          <SyncSuccessShimmer active={visible} style={styles.syncSheetShimmer} />
          <View style={styles.syncSheetHandle} />
          <View style={styles.rewardBannerHeader}>
            <View style={styles.syncSheetTitleBlock}>
              <Text style={styles.rewardKicker}>SYNC COMPLETE</Text>
              <Text style={styles.rewardTitle}>
                Your movement became progress
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Dismiss sync result"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.rewardDismiss}
            >
              <Text style={styles.rewardDismissText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.rewardRows}>
            {rewards.map((reward) => (
              <View key={reward.label} style={styles.rewardRow}>
                <Text style={styles.rewardIcon}>{reward.icon}</Text>
                <View style={styles.rewardBody}>
                  <Text style={styles.rewardLabel}>{reward.label}</Text>
                  <Text style={styles.rewardValue}>{reward.value}</Text>
                </View>
                <SparkleBurst tone="accent" />
              </View>
            ))}
          </View>
          <Text style={styles.rewardBreakdown}>{getRewardBreakdown(gains.xp)}</Text>
          <Text style={styles.rewardNextStep}>{getRewardNextStep(gains)}</Text>
          <AppButton
            label={primaryLabel}
            onPress={onPrimaryAction}
            style={styles.syncSheetPrimary}
          />
        </View>
      </View>
    </Modal>
  );
}

function getSyncResultAction({
  activeHatchling,
  gains,
  onDexPress,
  onMonsterPress,
  readyEggCount,
}: {
  activeHatchling: CollectedHatchling | null;
  gains: LatestSyncGains;
  onDexPress: () => void;
  onMonsterPress: () => void;
  readyEggCount: number;
}) {
  if (readyEggCount > 0) {
    return {
      label: readyEggCount === 1 ? "Hatch Egg" : `Hatch ${readyEggCount} Eggs`,
      onPress: onMonsterPress,
    };
  }

  if (gains.eggSteps > 0 || gains.eggsAwarded > 0) {
    return {
      label: "Open Hatchery",
      onPress: onMonsterPress,
    };
  }

  if (activeHatchling && gains.palXp > 0) {
    return {
      label: "View Pal",
      onPress: onDexPress,
    };
  }

  return {
    label: "Done for today",
    onPress: () => undefined,
  };
}

function Metric({
  animate,
  label,
  value,
  xp,
}: {
  animate?: boolean;
  label: string;
  value: string;
  xp?: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {xp !== undefined && (
        <View style={styles.metricXpRow}>
          <Text style={styles.metricXp}>+{xp} XP</Text>
          {animate && <SparkleBurst />}
        </View>
      )}
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

function QuestBoardSummary({
  cadence,
  claimableCount,
  completion,
  quests,
  suggestions,
}: {
  cadence: QuestCadence;
  claimableCount: number;
  completion: number;
  quests: QuestModel[];
  suggestions: QuestModel[];
}) {
  const completed = quests.filter(isQuestComplete).length;

  return (
    <View style={styles.questSummaryCard}>
      <View style={styles.questSummaryHeader}>
        <View>
          <Text style={styles.questSummaryKicker}>
            {capitalize(cadence)} quest board
          </Text>
          <Text style={styles.questSummaryTitle}>
            {completed}/{quests.length} loop goals cleared
          </Text>
        </View>
        <Text
          style={[
            styles.questSummaryPill,
            claimableCount > 0 && styles.questSummaryPillReady,
          ]}
        >
          {claimableCount > 0 ? `${claimableCount} ready` : "On track"}
        </Text>
      </View>
      <ProgressBar progress={completion} />
      {suggestions.length > 0 ? (
        <View style={styles.questSuggestionList}>
          <Text style={styles.questSuggestionKicker}>Next up</Text>
          {suggestions.map((quest) => (
            <View key={quest.id} style={styles.questSuggestion}>
              <View style={styles.questSuggestionBody}>
                <Text style={styles.questSuggestionTitle}>{quest.label}</Text>
                <Text style={styles.questSuggestionMeta}>
                  {getQuestRemainingText(quest)} | {getQuestTierLabel(quest)}
                </Text>
              </View>
              <Text style={styles.questSuggestionReward}>
                {getQuestRewardLabel(quest)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.questSummaryDone}>
          This board is complete. Return tomorrow for the next movement loop.
        </Text>
      )}
    </View>
  );
}

function Quest({
  claimed,
  onClaim,
  quest,
}: {
  claimed: boolean;
  onClaim: () => Promise<boolean>;
  quest: QuestModel;
}) {
  const complete = isQuestComplete(quest);
  const claimable = quest.cadence !== "daily" && complete && !claimed;

  return (
    <View style={[styles.quest, claimable && styles.questReady]}>
      <View style={[styles.questDot, complete && styles.questDotComplete]} />
      <View style={styles.questBody}>
        <View style={styles.questTitleRow}>
          <Text style={styles.questLabel}>{quest.label}</Text>
          <Text style={styles.questTier}>{getQuestTierLabel(quest)}</Text>
        </View>
        <Text style={styles.questCaption}>
          {formatQuestValue(Math.min(quest.current, quest.target))} /{" "}
          {formatQuestValue(quest.target)} {quest.unit}
        </Text>
        <ProgressBar progress={getQuestProgress(quest)} />
        {!complete && (
          <Text style={styles.questRemaining}>
            {getQuestRemainingText(quest)}
          </Text>
        )}
        <Text style={styles.questReward}>{getQuestRewardLabel(quest)}</Text>
      </View>
      {claimable ? (
        <Pressable
          onPress={() => {
            void onClaim();
          }}
          style={styles.questClaim}
        >
          <Text style={styles.questClaimText}>Claim</Text>
        </Pressable>
      ) : (
        <Text
          style={[styles.questStatus, complete && styles.questStatusComplete]}
        >
          {claimed ? "Claimed" : complete ? "Ready" : "Active"}
        </Text>
      )}
      {complete && <SparkleBurst />}
    </View>
  );
}

function EmptyMissionCard({
  actionLabel,
  body,
  disabled,
  onPress,
  title,
}: {
  actionLabel: string;
  body: string;
  disabled?: boolean;
  onPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.emptyMissionCard}>
      <View style={styles.emptyMissionText}>
        <Text style={styles.emptyMissionTitle}>{title}</Text>
        <Text style={styles.emptyMissionBody}>{body}</Text>
      </View>
      <AppButton
        disabled={disabled}
        label={actionLabel}
        onPress={onPress}
        style={disabled ? styles.disabledAction : undefined}
        variant="secondary"
      />
    </View>
  );
}

function AdvancedSectionIntro({
  mission,
}: {
  mission: FirstWeekMission;
}) {
  const unlockedCopy = getAdvancedSectionCopy(mission);

  return (
    <View style={styles.advancedIntroCard}>
      <View style={styles.arcHeader}>
        <View>
          <Text style={styles.arcKicker}>NEXT JOURNEY LAYERS</Text>
          <Text style={styles.arcTitle}>{unlockedCopy.title}</Text>
        </View>
        <Text style={styles.arcPill}>Day {mission.day}/7</Text>
      </View>
      <Text style={styles.arcBody}>{unlockedCopy.body}</Text>
    </View>
  );
}

function WeeklyChestCard({
  chest,
  onClaim,
}: {
  chest: ReturnType<typeof getWeeklyRewardChest>;
  onClaim: () => Promise<boolean>;
}) {
  return (
    <View style={styles.chestCard}>
      <View style={styles.chestHeader}>
        <View>
          <Text style={styles.chestKicker}>WEEKLY REWARD</Text>
          <Text style={styles.chestTitle}>{chest.label}</Text>
        </View>
        {chest.canClaim ? (
          <SparkleBurst label="READY" tone="accent" />
        ) : (
          <Text style={styles.chestPill}>
            {chest.claimed ? "Claimed" : "Locked"}
          </Text>
        )}
      </View>
      <Text style={styles.chestBody}>
        Move {formatSteps(chest.target)} this week to earn a chest
        with coins, Journey XP, and Egg progress for your next hatch.
      </Text>
      <ProgressBar progress={chest.progress} />
      <Text style={styles.chestReward}>
        +{formatNumber(chest.rewardCoins)} coins | +{formatNumber(chest.rewardAccountXp)} Journey XP | +
        {formatNumber(chest.rewardEggSteps)} Egg progress
      </Text>
      <AppButton
        disabled={!chest.canClaim}
        label={
          chest.canClaim
            ? "Claim weekly chest"
            : chest.claimed
              ? "Chest claimed"
              : `${formatNumber(chest.steps)} / ${formatNumber(chest.target)} steps`
        }
        onPress={() => {
          void onClaim();
        }}
        style={!chest.canClaim ? styles.disabledAction : undefined}
        variant={chest.canClaim ? "primary" : "secondary"}
      />
    </View>
  );
}

function CoinShopCard({
  activeHatchling,
  coins,
  onBuy,
}: {
  activeHatchling: CollectedHatchling | null;
  coins: number;
  onBuy: (itemId: ShopItemId) => Promise<boolean>;
}) {
  return (
    <View style={styles.shopCard}>
      <View style={styles.shopHeader}>
        <View>
          <Text style={styles.shopKicker}>COIN SHOP</Text>
          <Text style={styles.shopTitle}>Spend what quests earn</Text>
        </View>
        <Text style={styles.coinPill}>{formatNumber(coins)} coins</Text>
      </View>
      <Text style={styles.shopBody}>
        Spend quest coins on boosts that support the same loop: profile growth,
        Pal XP, and Egg progress.
      </Text>
      {SHOP_ITEMS.map((item) => (
        <ShopRow
          activeHatchling={activeHatchling}
          coins={coins}
          item={item}
          key={item.id}
          onBuy={onBuy}
        />
      ))}
    </View>
  );
}

function ShopRow({
  activeHatchling,
  coins,
  item,
  onBuy,
}: {
  activeHatchling: CollectedHatchling | null;
  coins: number;
  item: ShopItem;
  onBuy: (itemId: ShopItemId) => Promise<boolean>;
}) {
  const disabled = coins < item.priceCoins || (item.rewardPalXp > 0 && !activeHatchling);
  const effect = [
    item.rewardAccountXp > 0 ? `+${formatNumber(item.rewardAccountXp)} Journey XP` : null,
    item.rewardPalXp > 0 ? `+${formatNumber(item.rewardPalXp)} Pal XP` : null,
    item.rewardEggSteps > 0
      ? `+${formatNumber(item.rewardEggSteps)} Egg progress`
      : null,
  ].filter(Boolean).join(" | ");

  return (
    <View style={styles.shopRow}>
      <View style={styles.shopRowText}>
        <Text style={styles.shopItemName}>{item.label}</Text>
        <Text style={styles.shopItemBody}>{item.body}</Text>
        <Text style={styles.shopItemEffect}>{effect}</Text>
      </View>
      <Pressable
        disabled={disabled}
        onPress={() => {
          void onBuy(item.id);
        }}
        style={[styles.shopBuy, disabled && styles.shopBuyDisabled]}
      >
        <Text style={styles.shopBuyText}>{formatNumber(item.priceCoins)}</Text>
      </Pressable>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatQuestValue(value: number) {
  return Number.isInteger(value) ? formatNumber(value) : value.toFixed(1);
}

function getRewardBreakdown(xp: DailyXp) {
  if (xp.total === 0) return "Bonus reward applied outside the daily health XP cap.";
  const movement = xp.steps + xp.activeCalories + xp.workouts;
  const parts = [`Movement +${movement}`];
  if (xp.quests > 0) parts.push(`Quests +${xp.quests}`);
  if (xp.firstSync > 0) parts.push(`Daily sync +${xp.firstSync}`);
  return parts.join(" | ");
}

function getRewardNextStep(gains: LatestSyncGains) {
  if (gains.eggSteps > 0) {
    return "Next: check the Hatchery for Eggs that are ready or close.";
  }
  if (gains.palXp > 0) {
    return "Next: visit Collection to review your active Pal progress.";
  }
  if (gains.eggsAwarded > 0) {
    return "Next: bonus Eggs are waiting for a Hatchery slot.";
  }
  return "Next: move a little more and sync again when you are ready.";
}

function getRewardRows(gains: LatestSyncGains, latestEvolution: MonsterStage | null) {
  const rewards: { icon: string; label: string; value: string }[] = [];
  const journeyXp = gains.accountXp + gains.xp.total;
  if (journeyXp > 0) {
    rewards.push({
      icon: "XP",
      label: "Journey XP",
      value: `+${formatNumber(journeyXp)} XP`,
    });
  }
  if (gains.palXp > 0) {
    rewards.push({
      icon: "PAL",
      label: "Pal XP",
      value: `+${formatNumber(gains.palXp)} XP`,
    });
  }
  if (gains.eggSteps > 0) {
    rewards.push({
      icon: "EGG",
      label: "Egg progress",
      value: `+${formatNumber(gains.eggSteps)} steps each`,
    });
  }
  if (gains.eggsAwarded > 0) {
    rewards.push({
      icon: "NEW",
      label: "Bonus Eggs",
      value: `+${gains.eggsAwarded} Egg${gains.eggsAwarded === 1 ? "" : "s"}`,
    });
  }
  if (gains.coins > 0) {
    rewards.push({
      icon: "$",
      label: "Coins",
      value: `+${formatNumber(gains.coins)}`,
    });
  } else if (gains.coins < 0) {
    rewards.push({
      icon: "$",
      label: "Coins spent",
      value: `${gains.coins}`,
    });
  }
  if (gains.streakProgressed) {
    rewards.push({
      icon: "STR",
      label: "Streak progress",
      value: "Day counted",
    });
  }
  if (latestEvolution) {
    rewards.push({
      icon: "EVO",
      label: "Journey stage",
      value: `${capitalize(latestEvolution)} unlocked`,
    });
  }

  return rewards.length > 0
    ? rewards
    : [{ icon: "OK", label: "Synced", value: "No new rewards yet" }];
}

function hasSyncRewards(gains: LatestSyncGains) {
  return (
    gains.accountXp > 0 ||
    gains.xp.total > 0 ||
    gains.eggSteps > 0 ||
    gains.palXp > 0 ||
    gains.eggsAwarded > 0 ||
    gains.coins > 0 ||
    gains.streakProgressed
  );
}

function getTodayDistanceMiles(today: DailyAward | null) {
  if (!today) return 0;
  if ((today.health.distanceMeters ?? 0) > 0) {
    return metersToMiles(today.health.distanceMeters ?? 0);
  }
  return stepsToMiles(today.health.steps);
}

function getFirstClaimableQuest(
  quests: QuestModel[],
  todayKey: string,
  claimedQuestRewards: string[],
) {
  return quests.find(
    (quest) =>
      isQuestComplete(quest) &&
      !claimedQuestRewards.includes(getQuestRewardKey(quest, todayKey)),
  );
}

function getNextAction({
  activeHatchling,
  claimableQuest,
  data,
  firstWeekMission,
  firstWeekMissionAction,
  isSyncing,
  onClaimQuestReward,
  onClaimWeeklyChest,
  onDexPress,
  onMonsterPress,
  onSync,
  rewardAvailable,
  readyEggCount,
  trainingStatus,
  today,
  todayKey,
  weeklyChest,
}: {
  activeHatchling: CollectedHatchling | null;
  claimableQuest: QuestModel | undefined;
  data: HatchUpData;
  firstWeekMission: FirstWeekMission;
  firstWeekMissionAction: () => void;
  isSyncing: boolean;
  onClaimQuestReward: (quest: QuestModel, today: string) => Promise<boolean>;
  onClaimWeeklyChest: (today: string) => Promise<boolean>;
  onDexPress: () => void;
  onMonsterPress: () => void;
  onSync: () => Promise<void>;
  rewardAvailable: boolean;
  readyEggCount: number;
  trainingStatus: ReturnType<typeof getTrainingStatus> | null;
  today: DailyAward | null;
  todayKey: string;
  weeklyChest: ReturnType<typeof getWeeklyRewardChest>;
}) {
  if (readyEggCount > 0) {
    return {
      body: "Your movement filled an Egg. Open the Hatchery and reveal your next Pal.",
      disabled: false,
      label: readyEggCount > 1 ? `Hatch ${readyEggCount} Eggs` : "Open Hatchery",
      onPress: onMonsterPress,
      priority: 1,
      title: `${readyEggCount} Egg${readyEggCount === 1 ? "" : "s"} ready`,
      variant: "primary" as const,
    };
  }

  if (!today) {
    return {
      body: activeHatchling
        ? "Sync once to turn today's movement into Pal XP, Egg progress, and quest rewards."
        : "Sync once to turn today's movement into Egg progress and quest rewards.",
      disabled: isSyncing,
      label: isSyncing ? "Syncing..." : "Sync movement",
      onPress: onSync,
      priority: 2,
      title: "Start today's loop",
      variant: "primary" as const,
    };
  }

  if (weeklyChest.canClaim) {
    return {
      body: "Your weekly movement chest is ready. Claim it for coins, trainer XP, and Egg progress.",
      disabled: false,
      label: "Claim weekly chest",
      onPress: () => {
        void onClaimWeeklyChest(todayKey);
      },
      priority: 3,
      title: "Reward ready",
      variant: "primary" as const,
    };
  }

  if (claimableQuest) {
    return {
      body: `${claimableQuest.label} is complete. Claim it to grow your Pal, Eggs, and trainer card.`,
      disabled: false,
      label: "Claim quest reward",
      onPress: () => {
        void onClaimQuestReward(claimableQuest, todayKey);
      },
      priority: 3,
      title: "Quest reward ready",
      variant: "primary" as const,
    };
  }

  if (rewardAvailable) {
    return {
      body: activeHatchling
        ? "Your movement just became Pal XP, Egg progress, coins, or streak growth."
        : "Your movement just became Egg progress, coins, or streak growth.",
      disabled: false,
      label: "Review progress",
      onPress: activeHatchling ? onDexPress : onMonsterPress,
      priority: 3,
      title: "New progress landed",
      variant: "secondary" as const,
    };
  }

  if (!activeHatchling && data.collection.length > 0) {
    return {
      body: "You have a hatched Pal, but no favorite is active yet. Pick one so future movement can grow it.",
      disabled: false,
      label: "Pick active Pal",
      onPress: onDexPress,
      priority: 4,
      title: "Choose your favorite Pal",
      variant: "primary" as const,
    };
  }

  if (activeHatchling && trainingStatus?.canTrain) {
    return {
      body: `${activeHatchling.name} has a training session ready. Training is capped at three sessions per day.`,
      disabled: false,
      label: "Open Collection",
      onPress: onDexPress,
      priority: 4,
      title: "Training ready",
      variant: "secondary" as const,
    };
  }

  if (!firstWeekMission.complete) {
    return {
      body: getFirstWeekMissionWhy(firstWeekMission),
      disabled: false,
      label: firstWeekMission.actionLabel,
      onPress: firstWeekMissionAction,
      priority: 5,
      title: `Day ${firstWeekMission.day}: ${firstWeekMission.label}`,
      variant: "secondary" as const,
    };
  }

  return {
    body: `${getReturnTomorrowMessage(data.currentStreak)} ${getCollectionNudge(data.collection.length)}`,
    disabled: false,
    label: "Come back tomorrow",
    onPress: onDexPress,
    priority: 6,
    title: "Today's loop is complete",
    variant: "secondary" as const,
  };
}

function getDailyHeroMessage({
  activeHatchling,
  focusEgg,
  latestSyncGains,
  today,
}: {
  activeHatchling: CollectedHatchling | null;
  focusEgg: HatchUpData["activeEgg"] | undefined;
  latestSyncGains: LatestSyncGains;
  today: DailyAward | null;
}) {
  if (!today) return "Sync movement to start today.";
  if (focusEgg && latestSyncGains.eggSteps > 0) {
    return `Your movement added ${formatSteps(latestSyncGains.eggSteps)} of Egg progress today.`;
  }
  if (focusEgg) {
    return `Your Egg is ${formatPercent(getEggProgress(focusEgg))} ready to hatch.`;
  }
  if (activeHatchling && latestSyncGains.palXp > 0) {
    return `Your movement added ${formatNumber(latestSyncGains.palXp)} Pal XP today.`;
  }
  if (activeHatchling) {
    return `${activeHatchling.name} is ready for tomorrow's movement loop.`;
  }
  return "Your movement synced today. Hatch or choose a Pal to keep growing.";
}

function getFirstWeekMissionWhy(mission: FirstWeekMission) {
  if (mission.day === 1) {
    return "Move and sync so your first Egg gains progress. This is the core HatchUp loop.";
  }
  if (mission.day === 2) {
    return "Hatching shows what your movement did: it turns Egg progress into a new Pal.";
  }
  if (mission.day === 3) {
    return "Training makes your Pal feel personal and gives you a reason to return tomorrow.";
  }
  if (mission.day === 4) {
    return "Badges remember your journey as you move, hatch, and collect.";
  }
  if (mission.day === 5) {
    return "A collection goal gives every hatch and training session a purpose.";
  }
  if (mission.day === 6) {
    return "Ranks are optional, but this is where weekly movement can become a friendly challenge.";
  }
  return "The weekly reward closes your first loop and gives you a reason to return tomorrow.";
}

function getAdvancedSectionCopy(mission: FirstWeekMission) {
  if (mission.day <= 1) {
    return {
      body: "The rest of Home is still here, but your best path is simple: move, sync, and hatch.",
      title: "Advanced systems unlock naturally",
    };
  }
  if (mission.day === 2) {
    return {
      body: "Collection and training matter most now. Quests, chests, and boosts support that daily loop.",
      title: "Collection is opening up",
    };
  }
  if (mission.day <= 4) {
    return {
      body: "Rewards and badges now show what your movement did for your Pal, Eggs, and trainer card.",
      title: "Rewards are becoming useful",
    };
  }
  if (mission.day === 5) {
    return {
      body: "Ranks are optional and sharing-controlled. Use them when you want your weekly movement to become friendly competition.",
      title: "Ranks are now optional",
    };
  }
  return {
    body: "You have seen the core loop. Use quests, chests, boosts, and ranks to choose tomorrow's reason to move.",
    title: "Full weekly loop is available",
  };
}

function getNextActionReason(priority: number) {
  if (priority === 1) return "Recommended because a hatch is ready now.";
  if (priority === 2) return "Recommended because today has not been rewarded yet.";
  if (priority === 3) return "Recommended because progress is waiting to be claimed.";
  if (priority === 4) return "Recommended because your active Pal can grow today.";
  if (priority === 5) return "Recommended because it advances the first-week journey.";
  return "Recommended because collection goals keep the loop moving.";
}

function getMissionAction({
  onDexPress,
  onLeaderboardPress,
  onMonsterPress,
  onSettingsPress,
  onSync,
}: {
  onDexPress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onSettingsPress: () => void;
  onSync: () => Promise<void>;
}) {
  return (target: FirstWeekTarget) => {
    if (target === "collection") return onDexPress;
    if (target === "hatchery") return onMonsterPress;
    if (target === "leaderboard") return onLeaderboardPress;
    if (target === "profile") return onSettingsPress;
    return () => {
      void onSync();
    };
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
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    marginTop: 3,
  },
  streak: {
    alignItems: "center",
    backgroundColor: colors.rewardGold,
    borderColor: colors.accent,
    borderRadius: radii.card,
    borderWidth: 1,
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
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    marginBottom: 12,
    padding: 18,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  starterGuideCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 9,
    marginBottom: 14,
    padding: 16,
    shadowColor: colors.cardShadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  starterGuideKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  starterGuideTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
  },
  starterGuideBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  starterGuideActions: {
    flexDirection: "row",
    gap: 8,
  },
  starterGuideButton: {
    flex: 1,
  },
  heroSparkles: {
    alignItems: "center",
    marginBottom: 8,
  },
  loopPromise: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 10,
  },
  nextActionCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 12,
    marginBottom: 12,
    padding: 16,
  },
  nextActionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionReason: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  syncSummaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
    padding: 12,
  },
  syncSummaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  syncSummaryKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  syncSummaryTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  syncSummaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  summaryTile: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 11,
    width: "23%",
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
    textAlign: "center",
  },
  snapshotStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  snapshotPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  snapshotPillReady: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  snapshotLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  snapshotValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3,
  },
  snapshotValueReady: {
    color: colors.primaryDeep,
  },
  todayProgressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
    padding: 16,
  },
  dailyMissionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 12,
    marginBottom: 14,
    padding: 16,
  },
  dailyMissionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dailyMissionKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  dailyMissionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  firstWeekFocus: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  firstWeekKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  firstWeekTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  firstWeekBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  firstWeekPips: {
    flexDirection: "row",
    gap: 7,
  },
  firstWeekPip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 7,
  },
  firstWeekPipActive: {
    backgroundColor: colors.rewardGold,
    borderColor: colors.accent,
  },
  firstWeekPipDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDeep,
  },
  firstWeekPipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  firstWeekPipTextActive: {
    color: colors.primaryDeep,
  },
  goalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.card,
    gap: 10,
    marginBottom: 14,
    padding: 16,
  },
  goalHeaderText: {
    flex: 1,
  },
  goalKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  weeklyChestTeaser: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  weeklyChestText: {
    flex: 1,
  },
  weeklyChestTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  weeklyChestBody: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  weeklyChestButton: {
    minWidth: 96,
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  statusPillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginBottom: 18,
    padding: 16,
  },
  accountHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  accountKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  accountTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  coinPill: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  accountText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  rewardHistoryPanel: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  rewardHistoryTitle: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  rewardHistoryRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  rewardHistoryText: {
    flex: 1,
  },
  rewardHistoryLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  rewardHistoryMeta: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  rewardHistoryValue: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  rewardHistoryEmpty: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  arcCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 12,
    marginBottom: 22,
    padding: 16,
  },
  advancedIntroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
    padding: 16,
  },
  chestCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 11,
    marginBottom: 14,
    padding: 16,
  },
  chestHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chestKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  chestTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  chestPill: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chestBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  chestReward: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  shopCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginBottom: 22,
    padding: 16,
  },
  shopHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  shopKicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  shopTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  shopBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  shopRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  shopRowText: {
    flex: 1,
  },
  shopItemName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  shopItemBody: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  shopItemEffect: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
  },
  shopBuy: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  shopBuyDisabled: {
    backgroundColor: colors.line,
  },
  shopBuyText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  arcHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  arcKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  arcTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 4,
  },
  arcPill: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  arcBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  todayProgressHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  todayProgressKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  todayProgressTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  todayProgressMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  todayProgressPrivacy: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  journeyList: {
    gap: 8,
    marginTop: 2,
  },
  journeyStep: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 11,
  },
  journeyStepMark: {
    alignItems: "center",
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  journeyStepActive: {
    backgroundColor: colors.accent,
  },
  journeyStepDone: {
    backgroundColor: colors.primary,
  },
  journeyStepNumber: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  journeyStepNumberActive: {
    color: "#FFFFFF",
  },
  journeyStepText: {
    flex: 1,
  },
  journeyStepLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  journeyStepBody: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  progressRow: {
    gap: 7,
  },
  progressRowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressRowTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  progressRowLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  progressRowValue: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  rewardBanner: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    marginBottom: 12,
    padding: 12,
    shadowColor: colors.cardShadow,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  rewardBannerHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rewardKicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  rewardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  rewardDismiss: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  rewardDismissText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  rewardRows: {
    gap: 6,
  },
  rewardRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 9,
  },
  rewardIcon: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 30,
    textAlign: "center",
  },
  rewardBody: {
    flex: 1,
  },
  rewardLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  rewardValue: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  rewardBreakdown: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  rewardNextStep: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  syncModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  syncModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(32, 49, 42, 0.38)",
  },
  syncSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderTopLeftRadius: radii.hero,
    borderTopRightRadius: radii.hero,
    borderWidth: 1,
    gap: 11,
    paddingBottom: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: "relative",
    shadowColor: colors.cardShadow,
    shadowOffset: { height: -10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  syncSheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 4,
    width: 42,
  },
  syncSheetShimmer: {
    borderTopLeftRadius: radii.hero,
    borderTopRightRadius: radii.hero,
  },
  syncSheetTitleBlock: {
    flex: 1,
    paddingRight: 10,
  },
  syncSheetPrimary: {
    marginTop: 2,
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
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
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
  metricXpRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
  },
  emptyMissionCard: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
    padding: 14,
  },
  emptyMissionText: {
    flex: 1,
  },
  emptyMissionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyMissionBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  syncNote: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 9,
    textAlign: "center",
  },
  syncReceipt: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
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
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
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
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
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
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
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
  questTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  questTab: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexGrow: 1,
    paddingVertical: 10,
    minWidth: "31%",
  },
  questTabActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  questTabLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  questTabLabelActive: {
    color: "#FFFFFF",
  },
  questSummaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
    padding: 14,
  },
  questSummaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  questSummaryKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  questSummaryTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 3,
  },
  questSummaryPill: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  questSummaryPillReady: {
    backgroundColor: colors.rewardGold,
    color: colors.primaryDeep,
  },
  questSuggestionList: {
    gap: 8,
  },
  questSuggestionKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  questSuggestion: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  questSuggestionBody: {
    flex: 1,
  },
  questSuggestionTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  questSuggestionMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  questSuggestionReward: {
    color: colors.primary,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "900",
    maxWidth: 112,
    textAlign: "right",
  },
  questSummaryDone: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  quest: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  questReady: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
  },
  questDot: {
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 14,
    width: 14,
  },
  questDotComplete: {
    backgroundColor: colors.rewardGold,
  },
  questBody: {
    flex: 1,
    gap: 6,
  },
  questTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  questLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  questTier: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  questCaption: {
    color: colors.muted,
    fontSize: 11,
  },
  questRemaining: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
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
    color: colors.primaryDeep,
  },
  questClaim: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  questClaimText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
});
