import { getActivitySummary } from "./history";
import type { HatchUpData } from "./models";
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

export const DISTANCE_MILES_PER_STEP = 0.000473;
export const METERS_PER_MILE = 1609.344;

const betaRivals: Omit<LeaderboardEntry, "rank">[] = [
  {
    id: "rival-a",
    displayName: "Nova",
    distanceMiles: stepsToMiles(46800),
    isUser: false,
    monsterStage: "Teen",
    steps: 46800,
    totalXp: 620,
  },
  {
    id: "rival-b",
    displayName: "Mika",
    distanceMiles: stepsToMiles(31200),
    isUser: false,
    monsterStage: "Baby",
    steps: 31200,
    totalXp: 410,
  },
  {
    id: "rival-c",
    displayName: "Ren",
    distanceMiles: stepsToMiles(22400),
    isUser: false,
    monsterStage: "Baby",
    steps: 22400,
    totalXp: 255,
  },
  {
    id: "rival-d",
    displayName: "Kai",
    distanceMiles: stepsToMiles(14800),
    isUser: false,
    monsterStage: "Egg",
    steps: 14800,
    totalXp: 120,
  },
];

export function getUserLeaderboardStats(data: HatchUpData, today: string) {
  const activity = getActivitySummary(data.activityHistory, today, 7);
  const stage = getMonsterStage(data.totalXp);

  return {
    distanceMiles: getDistanceMiles(activity.days),
    monsterStage: stage.label,
    steps: activity.steps,
    totalXp: data.totalXp,
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
    ? [userEntry, ...betaRivals]
    : betaRivals;

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
