import { getActivitySummary } from "./history";
import { metersToMiles, stepsToMiles } from "./leaderboard";
import type { DailyAward, DailyHealthSummary, HatchUpData } from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  type ProgressionProfile,
} from "./progressionConfig";
import { formatNumber } from "../utils/format";

export type QuestCadence = "daily" | "weekly" | "monthly" | "seasonal" | "pal";

export interface Quest {
  cadence: QuestCadence;
  id: string;
  label: string;
  current: number;
  previousTarget: number;
  rewardAccountXp: number;
  rewardBond: number;
  rewardCoins: number;
  rewardEggSteps: number;
  rewardProgressionBonus: boolean;
  rewardStreakBonus: boolean;
  target: number;
  tier: number;
  totalTiers: number;
  unit: string;
  rewardXp: number;
}

interface QuestTier {
  label: string;
  rewardAccountXp?: number;
  rewardBond?: number;
  rewardCoins?: number;
  rewardEggSteps?: number;
  rewardProgressionBonus?: boolean;
  rewardStreakBonus?: boolean;
  rewardXp: number;
  target: number;
}

export function getDailyQuests(
  award: DailyAward | null,
  profile = ACTIVE_PROGRESSION_PROFILE,
): Quest[] {
  const distanceMiles = getAwardDistanceMiles(award);
  const baseReward = profile.xp.questXp;

  return [
    getTieredQuest("daily", "steps", award?.health.steps ?? 0, "steps", [
      tier("Take a long walk", profile.questTargets.steps, baseReward),
      tier("Push the route", profile.questTargets.steps * 2, questReward(baseReward, 10)),
      tier("Hit 10K steps", 10000, questReward(baseReward, 25)),
      tier("Crush 15K steps", 15000, questReward(baseReward, 40)),
      tier("Legend walk", 20000, questReward(baseReward, 60)),
    ]),
    getTieredQuest(
      "daily",
      "activeCalories",
      award?.health.activeCalories ?? 0,
      "active cal",
      [
        tier("Get moving", profile.questTargets.activeCalories, baseReward),
        tier("Heat up", profile.questTargets.activeCalories * 2, questReward(baseReward, 10)),
        tier("Burn bright", 500, questReward(baseReward, 25)),
        tier("High-energy day", 750, questReward(baseReward, 40)),
        tier("Firestarter", 1000, questReward(baseReward, 60)),
      ],
    ),
    getTieredQuest("daily", "workouts", award?.health.workouts ?? 0, "workout", [
      tier("Complete a workout", profile.questTargets.workouts, baseReward),
      tier("Double session", 2, questReward(baseReward, 20)),
      tier("Triple trainer", 3, questReward(baseReward, 40)),
      tier("Five-session feat", 5, questReward(baseReward, 70)),
    ]),
    getTieredQuest("daily", "distance", distanceMiles, "mile", [
      tier("Cover ground", 1, baseReward),
      tier("Two-mile trail", 2, questReward(baseReward, 10)),
      tier("5K journey", 3.1, questReward(baseReward, 25)),
      tier("Five-mile roam", 5, questReward(baseReward, 40)),
      tier("Ten-mile odyssey", 10, questReward(baseReward, 70)),
    ]),
    getTieredQuest("daily", "firstSync", award ? 1 : 0, "sync", [
      tier("Sync movement", 1, baseReward, { rewardStreakBonus: true }),
    ]),
  ];
}

export function getCompletedQuestXp(
  summary: DailyHealthSummary,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
) {
  const award: DailyAward = {
    date: summary.date,
    health: summary,
    xp: {
      steps: 0,
      activeCalories: 0,
      workouts: 0,
      quests: 0,
      firstSync: 0,
      total: 0,
    },
  };

  return getDailyQuestLines(award, profile).reduce((total, questLine) => {
    return (
      total +
      questLine.tiers
        .filter((questTier) => questLine.current >= questTier.target)
        .reduce((lineTotal, questTier) => lineTotal + questTier.rewardXp, 0)
    );
  }, 0);
}

function getDailyQuestLines(
  award: DailyAward,
  profile: ProgressionProfile,
): { current: number; tiers: QuestTier[] }[] {
  const distanceMiles = getAwardDistanceMiles(award);
  const baseReward = profile.xp.questXp;

  return [
    {
      current: award.health.steps,
      tiers: [
        tier("Take a long walk", profile.questTargets.steps, baseReward),
        tier("Push the route", profile.questTargets.steps * 2, questReward(baseReward, 10)),
        tier("Hit 10K steps", 10000, questReward(baseReward, 25)),
        tier("Crush 15K steps", 15000, questReward(baseReward, 40)),
        tier("Legend walk", 20000, questReward(baseReward, 60)),
      ],
    },
    {
      current: award.health.activeCalories,
      tiers: [
        tier("Get moving", profile.questTargets.activeCalories, baseReward),
        tier("Heat up", profile.questTargets.activeCalories * 2, questReward(baseReward, 10)),
        tier("Burn bright", 500, questReward(baseReward, 25)),
        tier("High-energy day", 750, questReward(baseReward, 40)),
        tier("Firestarter", 1000, questReward(baseReward, 60)),
      ],
    },
    {
      current: award.health.workouts,
      tiers: [
        tier("Complete a workout", profile.questTargets.workouts, baseReward),
        tier("Double session", 2, questReward(baseReward, 20)),
        tier("Triple trainer", 3, questReward(baseReward, 40)),
        tier("Five-session feat", 5, questReward(baseReward, 70)),
      ],
    },
    {
      current: distanceMiles,
      tiers: [
        tier("Cover ground", 1, baseReward),
        tier("Two-mile trail", 2, questReward(baseReward, 10)),
        tier("5K journey", 3.1, questReward(baseReward, 25)),
        tier("Five-mile roam", 5, questReward(baseReward, 40)),
        tier("Ten-mile odyssey", 10, questReward(baseReward, 70)),
      ],
    },
    {
      current: 1,
      tiers: [tier("Sync movement", 1, baseReward)],
    },
  ];
}

export function getWeeklyQuests(data: HatchUpData, today: string): Quest[] {
  const activity = getActivitySummary(data.activityHistory, today, 7);
  const focusElement = getQuestFocusElement(data);
  const focusElementCount = data.collection.filter(
    (item) => item.element === focusElement,
  ).length;
  const focusElementTraining = data.collection
    .filter((item) => item.element === focusElement)
    .reduce((total, item) => total + item.trainingSessions.length, 0);

  return [
    getTieredQuest("weekly", "weeklySteps", activity.steps, "steps", [
      tier("Hit the weekly hatch goal", data.weeklyGoalSteps, 0, reward(75, 40, 500)),
      tier("Weekly overachiever", data.weeklyGoalSteps + 15000, 0, reward(125, 70, 900)),
      tier("Big week walker", data.weeklyGoalSteps + 35000, 0, reward(200, 120, 1400)),
      tier("Legendary week", data.weeklyGoalSteps + 65000, 0, reward(320, 200, 2200)),
    ]),
    getTieredQuest(
      "weekly",
      "weeklyActiveDays",
      activity.activeDays,
      "active days",
      [
        tier("Move on three days", 3, 0, reward(60, 35, 300)),
        tier("Five active days", 5, 0, reward(110, 65, 650)),
        tier("Full-week streak", 7, 0, {
          ...reward(180, 110, 1100),
          rewardStreakBonus: true,
        }),
      ],
    ),
    getTieredQuest("weekly", "weeklyHatches", data.eggsHatched, "hatches", [
      tier("Grow the collection", 2, 0, {
        ...reward(70, 45, 500),
        rewardProgressionBonus: true,
      }),
      tier("Hatch four Pals", 4, 0, {
        ...reward(135, 85, 900),
        rewardProgressionBonus: true,
      }),
      tier("Hatch seven Pals", 7, 0, {
        ...reward(225, 150, 1600),
        rewardProgressionBonus: true,
      }),
    ]),
    getTieredQuest("weekly", "weeklyElementTeam", focusElementCount, "Pals", [
      tier(`Meet a ${capitalize(focusElement)} Pal`, 1, 0, {
        ...reward(50, 30, 250),
        rewardProgressionBonus: true,
      }),
      tier(`Build a ${capitalize(focusElement)} pair`, 2, 0, {
        ...reward(100, 65, 650),
        rewardProgressionBonus: true,
      }),
      tier(`${capitalize(focusElement)} circle`, 4, 0, {
        ...reward(175, 120, 1300),
        rewardProgressionBonus: true,
      }),
    ]),
    getTieredQuest("weekly", "weeklyElementTraining", focusElementTraining, "sessions", [
      tier(`Train a ${capitalize(focusElement)} Pal`, 1, 0, {
        ...reward(50, 30, 250),
        rewardBond: 2,
      }),
      tier(`${capitalize(focusElement)} practice week`, 3, 0, {
        ...reward(115, 75, 750),
        rewardBond: 4,
      }),
      tier(`${capitalize(focusElement)} training camp`, 6, 0, {
        ...reward(190, 130, 1400),
        rewardBond: 6,
      }),
    ]),
  ];
}

export function getMonthlyQuests(data: HatchUpData, today: string): Quest[] {
  const activity = getActivitySummary(data.activityHistory, today, 30);
  const uniqueElements = new Set(data.collection.map((item) => item.element)).size;
  const highBondPals = data.collection.filter((item) => item.bond >= 50).length;

  return [
    getTieredQuest("monthly", "monthlySteps", activity.steps, "steps", [
      tier("Walk a launch-month journey", data.weeklyGoalSteps * 4, 0, reward(250, 160, 1800)),
      tier("Long-route month", data.weeklyGoalSteps * 6, 0, reward(425, 280, 3200)),
      tier("Marathon month", data.weeklyGoalSteps * 8, 0, reward(700, 460, 5200)),
    ]),
    getTieredQuest("monthly", "monthlyCollection", data.collection.length, "Pals", [
      tier("Build your Pal team", 6, 0, reward(220, 140, 1600)),
      tier("Collect twelve Pals", 12, 0, reward(400, 260, 3000)),
      tier("Fill a full page", 20, 0, reward(680, 440, 5200)),
    ]),
    getTieredQuest("monthly", "monthlyStreak", data.longestStreak, "days", [
      tier("Reach a seven-day streak", 7, 0, reward(200, 120, 1500)),
      tier("Two-week ritual", 14, 0, reward(375, 240, 2800)),
      tier("Month-long momentum", 30, 0, reward(750, 500, 6000)),
    ]),
    getTieredQuest("monthly", "monthlyElementDex", uniqueElements, "elements", [
      tier("Discover two elements", 2, 0, reward(180, 110, 1200)),
      tier("Discover three elements", 3, 0, reward(320, 210, 2400)),
      tier("Discover all elements", 4, 0, reward(560, 380, 4600)),
    ]),
    getTieredQuest("monthly", "monthlyBondCircle", highBondPals, "Pals", [
      tier("Bond with one Pal", 1, 0, reward(180, 110, 1200)),
      tier("Trusted trio", 3, 0, reward(360, 240, 2800)),
      tier("Six close companions", 6, 0, reward(640, 430, 5000)),
    ]),
  ];
}

export function getSeasonalQuests(data: HatchUpData, today: string): Quest[] {
  const season = getActiveSeason(today);
  const activity = getActivitySummary(data.activityHistory, today, 30);
  const seasonalPals = data.collection.filter(
    (item) => item.element === season.element,
  ).length;
  const seasonalTraining = data.collection
    .filter((item) => item.element === season.element)
    .reduce((total, item) => total + item.trainingSessions.length, 0);
  const rareOrBetter = data.collection.filter(
    (item) => item.rarity === "rare" || item.rarity === "epic",
  ).length;

  return [
    getTieredQuest("seasonal", "seasonalSteps", activity.steps, "steps", [
      tier(`${season.label} trail`, 25000, 0, reward(150, 90, 1000)),
      tier(`${season.label} expedition`, 75000, 0, reward(320, 210, 2400)),
      tier(`${season.label} odyssey`, 150000, 0, reward(620, 420, 5000)),
    ]),
    getTieredQuest("seasonal", "seasonalElement", seasonalPals, "Pals", [
      tier(`Find a ${capitalize(season.element)} Pal`, 1, 0, reward(120, 75, 800)),
      tier(`${capitalize(season.element)} duo`, 2, 0, reward(260, 170, 2000)),
      tier(`${capitalize(season.element)} habitat`, 4, 0, reward(520, 350, 4200)),
    ]),
    getTieredQuest("seasonal", "seasonalTraining", seasonalTraining, "sessions", [
      tier(`${capitalize(season.element)} drills`, 3, 0, reward(140, 90, 900)),
      tier(`${capitalize(season.element)} mastery`, 9, 0, reward(300, 200, 2300)),
      tier(`${capitalize(season.element)} academy`, 18, 0, reward(575, 390, 4800)),
    ]),
    getTieredQuest("seasonal", "seasonalRare", rareOrBetter, "rare+ Pals", [
      tier("Spot a rare spark", 1, 0, reward(150, 100, 1000)),
      tier("Rare season trio", 3, 0, reward(340, 230, 2600)),
      tier("Collector season", 7, 0, reward(700, 480, 5600)),
    ]),
  ];
}

export function getPalQuests(data: HatchUpData, today: string): Quest[] {
  const activePal =
    data.collection.find((item) => item.id === data.activeHatchlingId) ??
    data.collection[0];
  const prefix = activePal ? `${activePal.name}` : "Your first Pal";
  const palId = activePal?.id ?? "none";

  return [
    getTieredQuest("pal", `pal-${palId}-level`, activePal?.level ?? 0, "level", [
      tier(`${prefix} reaches Lv 3`, 3, 0, reward(80, 45, 500)),
      tier(`${prefix} reaches Lv 5`, 5, 0, reward(150, 95, 1000)),
      tier(`${prefix} reaches Lv 10`, 10, 0, reward(320, 220, 2500)),
      tier(`${prefix} reaches Lv 20`, 20, 0, reward(650, 450, 5200)),
    ]),
    getTieredQuest("pal", `pal-${palId}-bond`, activePal?.bond ?? 0, "bond", [
      tier(`Bond with ${prefix}`, 25, 0, {
        ...reward(80, 45, 500),
        rewardBond: 2,
      }),
      tier(`${prefix} trusts you`, 50, 0, {
        ...reward(160, 100, 1200),
        rewardBond: 4,
      }),
      tier(`${prefix} best friend`, 100, 0, {
        ...reward(350, 240, 2800),
        rewardBond: 8,
      }),
    ]),
    getTieredQuest("pal", `pal-${palId}-training`, activePal?.trainingSessions.length ?? 0, "sessions", [
      tier(`Train ${prefix}`, 3, 0, {
        ...reward(90, 55, 600),
        rewardBond: 2,
      }),
      tier(`${prefix} practice arc`, 10, 0, {
        ...reward(210, 140, 1600),
        rewardBond: 5,
      }),
      tier(`${prefix} mastery arc`, 25, 0, {
        ...reward(480, 330, 3900),
        rewardBond: 10,
      }),
    ]),
    getTieredQuest("pal", `pal-${palId}-xp`, activePal?.xp ?? 0, "Pal XP", [
      tier(`${prefix} earns 75 XP`, 75, 0, reward(70, 40, 400)),
      tier(`${prefix} earns 250 XP`, 250, 0, reward(170, 110, 1300)),
      tier(`${prefix} earns 750 XP`, 750, 0, reward(390, 270, 3200)),
    ]),
  ];
}

export function getCompletedQuestCount(
  summary: DailyHealthSummary,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
) {
  return getDailyQuests(
    {
      date: summary.date,
      health: summary,
      xp: {
        steps: 0,
        activeCalories: 0,
        workouts: 0,
        quests: 0,
        firstSync: 0,
        total: 0,
      },
    },
    profile,
  )
    .filter((quest) => quest.cadence === "daily")
    .filter(isQuestComplete).length;
}

export function getQuestProgress(quest: Quest) {
  const tierSpan = Math.max(quest.target - quest.previousTarget, 1);
  return Math.min(
    Math.max((quest.current - quest.previousTarget) / tierSpan, 0),
    1,
  );
}

export function getQuestCompletionRatio(quests: readonly Quest[]) {
  if (quests.length === 0) return 0;
  return quests.filter(isQuestComplete).length / quests.length;
}

export function getClaimableQuestCount(
  quests: readonly Quest[],
  today: string,
  claimedKeys: readonly string[],
) {
  return quests.filter(
    (quest) =>
      quest.cadence !== "daily" &&
      isQuestComplete(quest) &&
      !claimedKeys.includes(getQuestRewardKey(quest, today)),
  ).length;
}

export function getNextQuestSuggestions(quests: readonly Quest[], limit = 3) {
  return [...quests]
    .filter((quest) => !isQuestComplete(quest))
    .sort(
      (a, b) =>
        getQuestProgress(b) - getQuestProgress(a) ||
        getQuestRemaining(a) - getQuestRemaining(b),
    )
    .slice(0, limit);
}

export function getQuestTierLabel(quest: Quest) {
  return `Tier ${quest.tier} of ${quest.totalTiers}`;
}

export function getQuestRemainingText(quest: Quest) {
  if (isQuestComplete(quest)) return "Ready to claim";
  const remaining = getQuestRemaining(quest);
  return `${formatQuestAmount(remaining)} ${formatQuestUnit(quest.unit, remaining)} left`;
}

export function isQuestComplete(quest: Quest) {
  return quest.current >= quest.target;
}

function getQuestRemaining(quest: Quest) {
  return Math.max(quest.target - quest.current, 0);
}

function formatQuestAmount(value: number) {
  return Number.isInteger(value) ? formatNumber(value) : value.toFixed(1);
}

function formatQuestUnit(unit: string, value: number) {
  if (value === 1) return unit;
  if (unit.endsWith("s")) return unit;
  return `${unit}s`;
}

function getTieredQuest(
  cadence: QuestCadence,
  id: string,
  current: number,
  unit: string,
  tiers: QuestTier[],
): Quest {
  const sortedTiers = [...tiers].sort((a, b) => a.target - b.target);
  const tierIndex = sortedTiers.findIndex(
    (questTier) => current < questTier.target,
  );
  const selectedIndex = tierIndex === -1 ? sortedTiers.length - 1 : tierIndex;
  const selected = sortedTiers[selectedIndex];
  const previousTarget = sortedTiers[selectedIndex - 1]?.target ?? 0;

  return {
    cadence,
    current,
    id,
    label: selected.label,
    previousTarget,
    rewardAccountXp: selected.rewardAccountXp ?? 0,
    rewardBond: selected.rewardBond ?? 0,
    rewardCoins: selected.rewardCoins ?? 0,
    rewardEggSteps: selected.rewardEggSteps ?? 0,
    rewardProgressionBonus: selected.rewardProgressionBonus ?? false,
    rewardStreakBonus: selected.rewardStreakBonus ?? false,
    rewardXp: selected.rewardXp,
    target: selected.target,
    tier: selectedIndex + 1,
    totalTiers: sortedTiers.length,
    unit,
  };
}

function tier(
  label: string,
  target: number,
  rewardXp: number,
  rewards: Partial<
    Pick<
      QuestTier,
      | "rewardAccountXp"
      | "rewardBond"
      | "rewardCoins"
      | "rewardEggSteps"
      | "rewardProgressionBonus"
      | "rewardStreakBonus"
    >
  > = {},
): QuestTier {
  return {
    label,
    rewardXp: Math.max(rewardXp, 0),
    target: Math.max(target, 1),
    ...rewards,
  };
}

function questReward(baseReward: number, bonus: number) {
  return baseReward > 0 ? baseReward + bonus : 0;
}

function reward(
  rewardAccountXp: number,
  rewardCoins: number,
  rewardEggSteps: number,
) {
  return { rewardAccountXp, rewardCoins, rewardEggSteps };
}

export function getQuestRewardKey(quest: Quest, today: string) {
  return `${getQuestPeriodKey(quest.cadence, today)}:${quest.id}:tier-${quest.tier}`;
}

export function getQuestRewardLabel(quest: Quest) {
  const rewards = getQuestRewardParts(quest);
  return rewards.length > 0 ? rewards.join(", ") : "Milestone tracker";
}

export function getQuestRewardParts(quest: Quest) {
  const rewards: string[] = [];
  if (quest.rewardAccountXp > 0) {
    rewards.push(`+${formatNumber(quest.rewardAccountXp)} Journey XP`);
  }
  if (quest.rewardCoins > 0) rewards.push(`+${formatNumber(quest.rewardCoins)} coins`);
  if (quest.rewardEggSteps > 0) {
    rewards.push(`+${formatNumber(quest.rewardEggSteps)} Egg progress`);
  }
  if (quest.rewardBond > 0) rewards.push(`+${formatNumber(quest.rewardBond)} Bond`);
  if (quest.rewardXp > 0) rewards.push(`+${formatNumber(quest.rewardXp)} Journey XP`);
  if (quest.rewardStreakBonus) rewards.push("Streak progress");
  if (quest.rewardProgressionBonus) rewards.push("Collection progress");
  return rewards;
}

function getQuestPeriodKey(cadence: QuestCadence, today: string) {
  if (cadence === "daily") return `day-${today}`;
  if (cadence === "monthly") return `month-${today.slice(0, 7)}`;
  if (cadence === "seasonal") {
    const season = getActiveSeason(today);
    return `season-${season.id}-${today.slice(0, 4)}`;
  }

  const date = new Date(`${today}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return `week-${date.toISOString().slice(0, 10)}`;
}

function getActiveSeason(today: string) {
  const month = Number(today.slice(5, 7));
  if (month >= 3 && month <= 5) {
    return { element: "leaf" as const, id: "leafbloom", label: "Leafbloom" };
  }
  if (month >= 6 && month <= 8) {
    return { element: "tide" as const, id: "tidesurge", label: "Tidesurge" };
  }
  if (month >= 9 && month <= 11) {
    return { element: "storm" as const, id: "stormcall", label: "Stormcall" };
  }
  return { element: "ember" as const, id: "emberfall", label: "Emberfall" };
}

function getQuestFocusElement(data: HatchUpData) {
  const active = data.collection.find(
    (item) => item.id === data.activeHatchlingId,
  );
  return active?.element ?? data.starterEggElement ?? "leaf";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getAwardDistanceMiles(award: DailyAward | null) {
  if (!award) return 0;
  if ((award.health.distanceMeters ?? 0) > 0) {
    return metersToMiles(award.health.distanceMeters ?? 0);
  }
  return stepsToMiles(award.health.steps);
}
