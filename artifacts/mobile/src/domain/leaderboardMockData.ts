import type { LeaderboardEntry } from "./leaderboard";

const DISTANCE_MILES_PER_STEP = 0.000473;

// TODO: Replace these local challenge entries and reward previews with backend
// leaderboard data once public weekly challenges are live.
export const MOCK_LEADERBOARD_RIVALS: Omit<LeaderboardEntry, "rank">[] = [
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

export const WEEKLY_CHALLENGE_REWARDS = [
  {
    label: "Top 3",
    value: "+500 coins + Epic Egg boost",
  },
  {
    label: "Top 10",
    value: "+250 coins + Rare Egg boost",
  },
  {
    label: "Participation",
    value: "+50 coins after one shared sync",
  },
] as const;

function stepsToMiles(steps: number) {
  return Number((steps * DISTANCE_MILES_PER_STEP).toFixed(1));
}
