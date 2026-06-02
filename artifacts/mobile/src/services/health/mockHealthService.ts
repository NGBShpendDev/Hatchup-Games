import { toDateKey } from "../../domain/date";
import type { HealthService } from "./HealthService";

let syncCount = 0;

export const mockHealthService: HealthService = {
  source: "mock",
  modeLabel: "Demo health data",

  async requestReadPermissions() {
    return Promise.resolve();
  },

  async getTodaySummary() {
    syncCount += 1;

    return {
      date: toDateKey(new Date()),
      steps: 3500 + syncCount * 750,
      activeCalories: 210 + syncCount * 50,
      workouts: syncCount >= 2 ? 2 : 1,
      source: "mock",
    };
  },
};
