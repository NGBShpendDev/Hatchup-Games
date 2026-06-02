import { Platform } from "react-native";
import type { HealthService } from "./HealthService";

const message =
  "Native health sync is configured but not installed yet. Use EXPO_PUBLIC_HEALTH_MODE=mock until the HealthKit and Health Connect adapters are added.";

// Keep the native implementation read-only: HealthKit step count, active energy,
// and workouts on iOS; Health Connect StepsRecord, ActiveCaloriesBurnedRecord,
// and ExerciseSessionRecord on Android. Aggregate cumulative Android steps so
// multiple sources do not double count movement.
export const nativeHealthService: HealthService = {
  source: Platform.OS === "ios" ? "appleHealth" : "healthConnect",
  modeLabel: Platform.OS === "ios" ? "Apple Health" : "Health Connect",

  async requestReadPermissions() {
    throw new Error(message);
  },

  async getTodaySummary() {
    throw new Error(message);
  },
};
