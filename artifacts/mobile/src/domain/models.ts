export type OnboardingStatus = "notStarted" | "monsterCreated" | "complete";

export type HealthSource = "mock" | "appleHealth" | "healthConnect";

export interface DailyHealthSummary {
  date: string;
  steps: number;
  activeCalories: number;
  workouts: number;
  source: HealthSource;
}

export interface DailyXp {
  steps: number;
  activeCalories: number;
  workouts: number;
  total: number;
}

export interface DailyAward {
  date: string;
  xp: DailyXp;
  health: DailyHealthSummary;
}

export interface HatchUpData {
  monsterName: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastSyncedDate: string | null;
  onboardingStatus: OnboardingStatus;
  healthConnected: boolean;
  lastRewardDate: string | null;
  dailyAward: DailyAward | null;
}

export const initialHatchUpData: HatchUpData = {
  monsterName: "",
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSyncedDate: null,
  onboardingStatus: "notStarted",
  healthConnected: false,
  lastRewardDate: null,
  dailyAward: null,
};
