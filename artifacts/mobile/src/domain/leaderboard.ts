import { getActivitySummary } from "./history";
import { MOCK_LEADERBOARD_RIVALS } from "./leaderboardMockData";
import type { HatchUpData } from "./models";
import { getWeeklyChallengeXpWithTrait } from "./palTraits";
import { getMonsterStage } from "./progression";

export type LeaderboardMetric = "steps" | "distance" | "xp";

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  distanceMiles: number;
  isUser: boolean;
  monsterStage: string;
  rank: number;
  steps: number;
  totalXp: number;
}

export interface LeaderboardValidation {
  flags: string[];
  isValid: boolean;
}

export const DISTANCE_MILES_PER_STEP = 0.000473;
export const METERS_PER_MILE = 1609.344;

export function getUserLeaderboardStats(data: HatchUpData, today: string) {
  const activity = getActivitySummary(data.activityHistory, today, 7);
  const stage = getMonsterStage(data.totalXp);
  const activePal =
    data.collection.find((item) => item.id === data.activeHatchlingId) ??
    data.collection[0] ??
    null;

  return {
    distanceMiles: getDistanceMiles(activity.days),
    monsterStage: stage.label,
    steps: activity.steps,
    totalXp: getWeeklyChallengeXpWithTrait(activePal, data.totalXp),
  };
}

export function getLeaderboardEntries(
  data: HatchUpData,
  today: string,
  metric: LeaderboardMetric,
): LeaderboardEntry[] {
  const userStats = getUserLeaderboardStats(data, today);
  const userEntry: Omit<LeaderboardEntry, "rank"> = {
    id: "you",
    displayName:
      data.leaderboardAlias.trim() || data.monsterName.trim() || "You",
    isUser: true,
    ...userStats,
  };
  const entries = data.leaderboardShareEnabled
    ? [userEntry, ...MOCK_LEADERBOARD_RIVALS]
    : MOCK_LEADERBOARD_RIVALS;

  return entries
    .sort(
      (left, right) =>
        getMetricValue(right, metric) - getMetricValue(left, metric),
    )
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export function getMetricValue(
  entry: Pick<LeaderboardEntry, "distanceMiles" | "steps" | "totalXp">,
  metric: LeaderboardMetric,
) {
  if (metric === "distance") return entry.distanceMiles;
  if (metric === "xp") return entry.totalXp;
  return entry.steps;
}

export function validateLeaderboardStats(
  entry: Pick<LeaderboardEntry, "distanceMiles" | "steps" | "totalXp">,
): LeaderboardValidation {
  const flags: string[] = [];

  if (entry.steps > 250000) flags.push("weekly_steps_too_high");
  if (entry.distanceMiles > 200) flags.push("weekly_distance_too_high");
  if (entry.steps > 0 && entry.distanceMiles / entry.steps > 0.0025) {
    flags.push("distance_step_ratio_high");
  }
  if (entry.totalXp > 10000) flags.push("xp_review_required");

  return {
    flags,
    isValid: flags.length === 0,
  };
}

export function stepsToMiles(steps: number) {
  return Number((steps * DISTANCE_MILES_PER_STEP).toFixed(1));
}

function getDistanceMiles(days: ReturnType<typeof getActivitySummary>["days"]) {
  const nativeMeters = days.reduce(
    (total, day) => total + (day.award?.health.distanceMeters ?? 0),
    0,
  );

  if (nativeMeters > 0) {
    return metersToMiles(nativeMeters);
  }

  const steps = days.reduce(
    (total, day) => total + (day.award?.health.steps ?? 0),
    0,
  );
  return stepsToMiles(steps);
}

export function metersToMiles(meters: number) {
  return Number((meters / METERS_PER_MILE).toFixed(1));
}
