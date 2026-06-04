import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
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
  getMonthlyQuests,
  getQuestCompletionRatio,
  getPalQuests,
  getQuestProgress,
  getQuestRemainingText,
  getQuestRewardKey,
  getQuestRewardLabel,
  getQuestTierLabel,
  getSeasonalQuests,
  getWeeklyQuests,
  isQuestComplete,
  type Quest as QuestModel,
  type QuestCadence,
} from "../domain/quests";
import {
  getCurrentFirstWeekMission,
  getRetentionPlan,
  type FirstWeekMission,
  type FirstWeekTarget,
} from "../domain/retention";
import { SHOP_ITEMS, type ShopItem, type ShopItemId } from "../domain/shop";
import { colors, radii, typography } from "../theme";
import type { LatestSyncGains } from "../useHatchUpApp";

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
  const monthlyQuests = getMonthlyQuests(data, todayKey);
  const seasonalQuests = getSeasonalQuests(data, todayKey);
  const palQuests = getPalQuests(data, todayKey);
  const visibleQuests =
    questCadence === "daily"
      ? quests
      : questCadence === "weekly"
        ? weeklyQuests
        : questCadence === "monthly"
          ? monthlyQuests
          : questCadence === "seasonal"
            ? seasonalQuests
            : palQuests;
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
  const weeklyChest = getWeeklyRewardChest(data, todayKey);
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
  const showStarterGuide =
    !today &&
    data.collection.length === 0 &&
    data.totalXp === 0 &&
    data.activeEggs.length > 0;

  useEffect(() => {
    setRewardDismissed(false);
  }, [latestSync]);
  const nextAction = getNextAction({
    activeHatchling,
    completedQuestCount,
    data,
    isSyncing,
    onDexPress,
    onLeaderboardPress,
    onMonsterPress,
    onSync,
    questCount: quests.length,
    readyEggCount,
    trainingStatus,
    today,
  });
  const handleMissionPress = getMissionAction({
    onDexPress,
    onLeaderboardPress,
    onMonsterPress,
    onSettingsPress,
    onSync,
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
          <Text style={styles.kicker}>TODAY'S JOURNEY</Text>
          <Text style={styles.title}>
            {activeHatchling ? activeHatchling.name : data.monsterName}
          </Text>
        </View>
        <View style={styles.streak}>
          {data.currentStreak > 0 && <SparkleBurst tone="accent" />}
          <Text style={styles.streakNumber}>{data.currentStreak}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      </View>
      {showStarterGuide && (
        <StarterGuideCard
          healthConnected={data.healthConnected}
          onHatcheryPress={onMonsterPress}
          onSettingsPress={onSettingsPress}
          onSync={onSync}
          syncing={isSyncing}
        />
      )}
      <View style={styles.heroCard}>
        {activeHatchling ? (
          <HatchlingAvatar
            element={activeHatchling.element}
            rarity={activeHatchling.rarity}
          />
        ) : (
          <MonsterAvatar stage={progression.current.id} />
        )}
        <Text style={styles.stage}>
          {activeHatchling
            ? `Active Pal | ${capitalize(activeHatchling.rarity)} ${capitalize(activeHatchling.element)}`
            : `${progression.current.label} starter Pal`}
        </Text>
        <Text style={styles.xp}>
          {activeHatchling
            ? `Level ${activeHatchling.level} | Bond ${activeHatchling.bond}/100`
            : `${data.totalXp} journey XP`}
        </Text>
        {(latestEvolution || latestSyncGains.xp.total > 0 || latestSyncGains.palXp > 0) && (
          <View style={styles.heroSparkles}>
            <SparkleBurst
              label={latestEvolution ? "LEVEL UP" : "XP GAIN"}
              tone="accent"
            />
          </View>
        )}
        <ProgressBar progress={progression.progress} />
        <Text style={styles.next}>
          {progression.next
            ? `${progression.xpToNext} journey XP until ${progression.next.label}`
            : "Final journey stage reached"}
        </Text>
      </View>
      <TodayLoopCard
        activeHatchling={activeHatchling}
        completedQuestCount={completedQuestCount}
        dailyStepGoal={ACTIVE_PROGRESSION_PROFILE.questTargets.steps}
        focusEgg={focusEgg}
        nextAction={nextAction}
        questCount={quests.length}
        readyEggCount={readyEggCount}
        rewardAvailable={showRewardFeedback}
        today={today}
        trainingStatus={trainingStatus}
      />
      <AccountProgressCard
        accountXp={data.accountXp}
        coins={data.coins}
        history={data.questRewardHistory}
      />
      {!showRewardFeedback && !today && (
        <EmptyMissionCard
          actionLabel={isSyncing ? "Syncing..." : "Collect rewards"}
          body="No rewards have been collected today. Sync movement to create the next recap."
          disabled={isSyncing}
          onPress={onSync}
          title="No rewards yet"
        />
      )}
      {showRewardFeedback && (
        <RewardFeedbackBanner
          gains={latestSyncGains}
          latestEvolution={latestEvolution}
          onDismiss={() => setRewardDismissed(true)}
        />
      )}
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
      <FirstWeekArcCard
        mission={firstWeekMission}
        onPress={handleMissionPress(firstWeekMission.target)}
      />
      <WeeklyChestCard
        chest={weeklyChest}
        onClaim={() => onClaimWeeklyChest(todayKey)}
      />
      <CoinShopCard
        activeHatchling={activeHatchling}
        coins={data.coins}
        onBuy={onBuyShopItem}
      />
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
          animate={Boolean(today?.xp.steps)}
        />
        <Metric
          label="Distance"
          value={`${todayDistanceMiles.toFixed(1)} mi`}
        />
        <Metric
          label="Energy"
          value={today?.health.activeCalories.toLocaleString() ?? "0"}
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
        label={isSyncing ? "Syncing movement..." : "Sync health data"}
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
        <Text style={styles.sectionTitle}>Eggs in Hatchery</Text>
        <Text style={styles.sectionMeta}>
          {readyEggCount}/{data.activeEggs.length} ready
          {data.pendingEggs.length > 0
            ? ` | ${data.pendingEggs.length} queued`
            : ""}
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
        <Text style={styles.sectionTitle}>Quests</Text>
        <Text style={styles.sectionMeta}>
          {visibleQuests.filter(isQuestComplete).length}/{visibleQuests.length}{" "}
          complete
          {visibleClaimableQuestCount > 0
            ? ` | ${visibleClaimableQuestCount} claimable`
            : ""}
        </Text>
      </View>
      <View style={styles.questTabs}>
        {(["daily", "weekly", "monthly", "seasonal", "pal"] as QuestCadence[]).map((cadence) => (
          <Pressable
            key={cadence}
            onPress={() => setQuestCadence(cadence)}
            style={[
              styles.questTab,
              questCadence === cadence && styles.questTabActive,
            ]}
          >
            <Text
              style={[
                styles.questTabLabel,
                questCadence === cadence && styles.questTabLabelActive,
              ]}
            >
              {capitalize(cadence)}
            </Text>
          </Pressable>
        ))}
      </View>
      <QuestBoardSummary
        cadence={questCadence}
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
    </Screen>
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

function TodayLoopCard({
  activeHatchling,
  completedQuestCount,
  dailyStepGoal,
  focusEgg,
  nextAction,
  questCount,
  readyEggCount,
  rewardAvailable,
  today,
  trainingStatus,
}: {
  activeHatchling: CollectedHatchling | null;
  completedQuestCount: number;
  dailyStepGoal: number;
  focusEgg: HatchUpData["activeEgg"] | undefined;
  nextAction: ReturnType<typeof getNextAction>;
  questCount: number;
  readyEggCount: number;
  rewardAvailable: boolean;
  today: DailyAward | null;
  trainingStatus: ReturnType<typeof getTrainingStatus> | null;
}) {
  const steps = today?.health.steps ?? 0;
  const stepProgress = Math.min(steps / dailyStepGoal, 1);
  const palXpProgress = activeHatchling
    ? getHatchlingXpProgress(activeHatchling.xp)
    : 0;
  const journeySteps = getDailyJourneySteps({
    activeHatchling,
    completedQuestCount,
    focusEgg,
    questCount,
    readyEggCount,
    rewardAvailable,
    today,
    trainingStatus,
  });

  return (
    <View style={styles.todayLoopCard}>
      <Text style={styles.actionKicker}>DAILY JOURNEY</Text>
      <Text style={styles.actionTitle}>{nextAction.title}</Text>
      <Text style={styles.actionText}>{nextAction.body}</Text>
      <AppButton
        disabled={nextAction.disabled}
        label={nextAction.label}
        onPress={nextAction.onPress}
        style={nextAction.disabled ? styles.disabledAction : undefined}
        variant={nextAction.variant}
      />
      <View style={styles.journeyList}>
        {journeySteps.map((step, index) => (
          <JourneyStep
            body={step.body}
            index={index}
            key={step.label}
            label={step.label}
            state={step.state}
          />
        ))}
      </View>
      <View style={styles.todayProgressHeader}>
        <View>
          <Text style={styles.todayProgressKicker}>TODAY PROGRESS</Text>
          <Text style={styles.todayProgressTitle}>Movement to rewards</Text>
        </View>
        <Text style={styles.todayProgressMeta}>
          {today ? "Synced today" : "Waiting for sync"}
        </Text>
      </View>
      <ProgressRow
        label="Daily steps"
        progress={stepProgress}
        value={`${steps.toLocaleString()} / ${dailyStepGoal.toLocaleString()}`}
      />
      <ProgressRow
        label="Active Egg"
        progress={focusEgg ? getEggProgress(focusEgg) : 0}
        value={
          focusEgg
            ? `${focusEgg.stepsWalked.toLocaleString()} / ${focusEgg.stepsRequired.toLocaleString()}`
            : "No Egg incubating"
        }
      />
      <ProgressRow
        label="Active Pal XP"
        progress={palXpProgress}
        value={
          activeHatchling
            ? `${activeHatchling.xp % 75} / 75 to Lv ${activeHatchling.level + 1}`
            : "Hatch a Pal to unlock"
        }
      />
      <Text style={styles.todayProgressPrivacy}>
        Read-only health data stays local for reward calculation unless you opt
        into journey board sharing.
      </Text>
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
        <Text style={styles.coinPill}>{coins.toLocaleString()} coins</Text>
      </View>
      <ProgressBar progress={levelProgress} />
      <Text style={styles.accountText}>
        {500 - (accountXp % 500)} Account XP to the next profile level.
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
                +{receipt.rewardAccountXp} XP
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.rewardHistoryEmpty}>
            Claim weekly, monthly, seasonal, or Pal quests to build a reward
            history.
          </Text>
        )}
      </View>
    </View>
  );
}

function JourneyStep({
  body,
  index,
  label,
  state,
}: {
  body: string;
  index: number;
  label: string;
  state: "active" | "done" | "pending";
}) {
  return (
    <View style={styles.journeyStep}>
      <View
        style={[
          styles.journeyStepMark,
          state === "done" && styles.journeyStepDone,
          state === "active" && styles.journeyStepActive,
        ]}
      >
        <Text
          style={[
            styles.journeyStepNumber,
            state !== "pending" && styles.journeyStepNumberActive,
          ]}
        >
          {state === "done" ? "OK" : index + 1}
        </Text>
      </View>
      <View style={styles.journeyStepText}>
        <Text style={styles.journeyStepLabel}>{label}</Text>
        <Text style={styles.journeyStepBody}>{body}</Text>
      </View>
    </View>
  );
}

function getDailyJourneySteps({
  activeHatchling,
  completedQuestCount,
  focusEgg,
  questCount,
  readyEggCount,
  rewardAvailable,
  today,
  trainingStatus,
}: {
  activeHatchling: CollectedHatchling | null;
  completedQuestCount: number;
  focusEgg: HatchUpData["activeEgg"] | undefined;
  questCount: number;
  readyEggCount: number;
  rewardAvailable: boolean;
  today: DailyAward | null;
  trainingStatus: ReturnType<typeof getTrainingStatus> | null;
}): { body: string; label: string; state: "active" | "done" | "pending" }[] {
  const synced = Boolean(today);
  const questsComplete = questCount > 0 && completedQuestCount === questCount;
  const trainReady = Boolean(activeHatchling && trainingStatus?.canTrain);

  return [
    {
      body: synced
        ? `${today?.health.steps.toLocaleString()} steps counted today.`
        : "Sync Health to turn today's movement into rewards.",
      label: "Sync movement",
      state: synced ? "done" : "active",
    },
    {
      body: rewardAvailable
        ? "Review what changed from your latest sync."
        : synced
          ? "Rewards are recorded for today."
          : "Rewards appear after your first sync.",
      label: "Open rewards",
      state: rewardAvailable ? "active" : synced ? "done" : "pending",
    },
    {
      body:
        readyEggCount > 0
          ? `${readyEggCount} Egg${readyEggCount === 1 ? "" : "s"} ready in the Hatchery.`
          : trainReady
            ? `${activeHatchling?.name} has a training session ready.`
            : focusEgg
              ? `${focusEgg.stepsWalked.toLocaleString()} / ${focusEgg.stepsRequired.toLocaleString()} steps toward the next Egg.`
              : "Hatch an Egg to meet your first Pal.",
      label: "Hatch or train",
      state: readyEggCount > 0 || trainReady ? "active" : synced ? "done" : "pending",
    },
    {
      body: questsComplete
        ? "Daily quests are complete."
        : `${Math.max(questCount - completedQuestCount, 0)} quest${questCount - completedQuestCount === 1 ? "" : "s"} left today.`,
      label: "Finish quests",
      state: questsComplete ? "done" : synced ? "active" : "pending",
    },
  ];
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

function RewardFeedbackBanner({
  gains,
  latestEvolution,
  onDismiss,
}: {
  gains: LatestSyncGains;
  latestEvolution: MonsterStage | null;
  onDismiss: () => void;
}) {
  const rewards = getRewardRows(gains, latestEvolution);

  return (
    <View style={styles.rewardBanner}>
      <View style={styles.rewardBannerHeader}>
        <View>
          <Text style={styles.rewardKicker}>WHAT CHANGED</Text>
          <Text style={styles.rewardTitle}>Your movement became progress</Text>
        </View>
        <Pressable onPress={onDismiss} style={styles.rewardDismiss}>
          <Text style={styles.rewardDismissText}>Dismiss</Text>
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
    </View>
  );
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
            {completed}/{quests.length} milestones cleared
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
          This board is complete. Check another cadence or claim ready rewards.
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
          {Math.min(quest.current, quest.target).toLocaleString()} /{" "}
          {quest.target.toLocaleString()} {quest.unit}
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

function FirstWeekArcCard({
  mission,
  onPress,
}: {
  mission: FirstWeekMission;
  onPress: () => void;
}) {
  return (
    <View style={styles.arcCard}>
      <View style={styles.arcHeader}>
        <View>
          <Text style={styles.arcKicker}>FIRST WEEK ARC</Text>
          <Text style={styles.arcTitle}>Day {mission.day}: {mission.label}</Text>
        </View>
        {mission.complete ? (
          <SparkleBurst label="DONE" tone="accent" />
        ) : (
          <Text style={styles.arcPill}>Next</Text>
        )}
      </View>
      <Text style={styles.arcBody}>{mission.message}</Text>
      <AppButton
        label={mission.complete ? "Review progress" : mission.actionLabel}
        onPress={onPress}
        variant={mission.complete ? "secondary" : "primary"}
      />
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
        Walk {chest.target.toLocaleString()} steps this week to earn a chest
        with coins, Account XP, and Egg progress.
      </Text>
      <ProgressBar progress={chest.progress} />
      <Text style={styles.chestReward}>
        +{chest.rewardCoins} coins | +{chest.rewardAccountXp} Account XP | +
        {chest.rewardEggSteps.toLocaleString()} egg steps
      </Text>
      <AppButton
        disabled={!chest.canClaim}
        label={
          chest.canClaim
            ? "Claim weekly chest"
            : chest.claimed
              ? "Chest claimed"
              : `${chest.steps.toLocaleString()} / ${chest.target.toLocaleString()} steps`
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
        <Text style={styles.coinPill}>{coins.toLocaleString()} coins</Text>
      </View>
      <Text style={styles.shopBody}>
        Buy small garden boosts for profile growth, your active Pal, or incubating
        Eggs.
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
    item.rewardAccountXp > 0 ? `+${item.rewardAccountXp} Account XP` : null,
    item.rewardPalXp > 0 ? `+${item.rewardPalXp} Pal XP` : null,
    item.rewardEggSteps > 0
      ? `+${item.rewardEggSteps.toLocaleString()} egg steps`
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
        <Text style={styles.shopBuyText}>{item.priceCoins}</Text>
      </Pressable>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  if (gains.accountXp > 0) {
    rewards.push({
      icon: "LVL",
      label: "Account XP",
      value: `+${gains.accountXp} XP`,
    });
  }
  if (gains.xp.total > 0) {
    rewards.push({
      icon: "XP",
      label: "Journey XP",
      value: `+${gains.xp.total} XP`,
    });
  }
  if (gains.palXp > 0) {
    rewards.push({
      icon: "PAL",
      label: "Active Pal XP",
      value: `+${gains.palXp} XP`,
    });
  }
  if (gains.eggSteps > 0) {
    rewards.push({
      icon: "EGG",
      label: "Egg progress",
      value: `+${gains.eggSteps.toLocaleString()} steps each`,
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
      value: `+${gains.coins}`,
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

function getNextAction({
  activeHatchling,
  completedQuestCount,
  data,
  isSyncing,
  onLeaderboardPress,
  onDexPress,
  onMonsterPress,
  onSync,
  questCount,
  readyEggCount,
  trainingStatus,
  today,
}: {
  activeHatchling: CollectedHatchling | null;
  completedQuestCount: number;
  data: HatchUpData;
  isSyncing: boolean;
  onLeaderboardPress: () => void;
  onDexPress: () => void;
  onMonsterPress: () => void;
  onSync: () => Promise<void>;
  questCount: number;
  readyEggCount: number;
  trainingStatus: ReturnType<typeof getTrainingStatus> | null;
  today: DailyAward | null;
}) {
  if (readyEggCount > 0) {
    return {
      body: "Your movement filled an Egg. Open the Hatchery and reveal your next Pal.",
      disabled: false,
      label: readyEggCount > 1 ? `Hatch ${readyEggCount} Eggs` : "Open Hatchery",
      onPress: onMonsterPress,
      title: `${readyEggCount} Egg${readyEggCount === 1 ? "" : "s"} ready`,
      variant: "primary" as const,
    };
  }

  if (!today) {
    return {
      body: "Sync once to collect journey XP, fill your Eggs, and unlock today's quests.",
      disabled: isSyncing,
      label: isSyncing ? "Syncing..." : "Collect movement",
      onPress: onSync,
      title: "Start today's loop",
      variant: "primary" as const,
    };
  }

  if (completedQuestCount < questCount) {
    return {
      body: "Move a little more, then sync again to push your quests and Eggs forward.",
      disabled: isSyncing,
      label: isSyncing ? "Syncing..." : "Sync after moving",
      onPress: onSync,
      title: `${questCount - completedQuestCount} quest${questCount - completedQuestCount === 1 ? "" : "s"} left`,
      variant: "secondary" as const,
    };
  }

  if (activeHatchling && trainingStatus?.canTrain) {
    return {
      body: `${activeHatchling.name} has a training session ready. Training is capped at three sessions per day.`,
      disabled: false,
      label: "Open Collection",
      onPress: onDexPress,
      title: "Training ready",
      variant: "secondary" as const,
    };
  }

  if (!data.leaderboardShareEnabled) {
    return {
      body: "Optional sharing lets you compare weekly steps, distance, and journey XP on the journey board.",
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
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
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
  todayLoopCard: {
    backgroundColor: colors.softPeach,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
    padding: 16,
  },
  goalCard: {
    backgroundColor: colors.softLavender,
    borderColor: colors.storm,
    borderWidth: 1,
    borderRadius: radii.card,
    gap: 10,
    marginBottom: 22,
    padding: 16,
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
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
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
    backgroundColor: colors.softPeach,
    borderColor: colors.ember,
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
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 12,
    marginBottom: 22,
    padding: 16,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
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
    fontSize: 18,
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
    gap: 8,
  },
  rewardRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 11,
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
    backgroundColor: colors.softPeach,
    borderColor: colors.rewardGold,
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
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
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
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
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
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
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
    backgroundColor: colors.softLavender,
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
