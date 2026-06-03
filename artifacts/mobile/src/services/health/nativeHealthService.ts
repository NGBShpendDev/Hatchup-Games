import { Platform } from "react-native";
import { toDateKey } from "../../domain/date";
import type { DailyHealthSummary } from "../../domain/models";
import type { HealthService } from "./HealthService";

const IOS_READ_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKWorkoutTypeIdentifier",
] as const;

export const nativeHealthService: HealthService = {
  source: Platform.OS === "ios" ? "appleHealth" : "healthConnect",
  modeLabel: Platform.OS === "ios" ? "Apple Health" : "Health Connect",

  async requestReadPermissions() {
    if (Platform.OS === "ios") {
      return requestAppleHealthPermissions();
    }
    if (Platform.OS === "android") {
      return requestHealthConnectPermissions();
    }
    throw new Error("Native health sync is available on iOS and Android only.");
  },

  async getTodaySummary() {
    if (Platform.OS === "ios") {
      return getAppleHealthTodaySummary();
    }
    if (Platform.OS === "android") {
      return getHealthConnectTodaySummary();
    }
    throw new Error("Native health sync is available on iOS and Android only.");
  },
};

async function requestAppleHealthPermissions() {
  const healthkit = await import("@kingstinct/react-native-healthkit");
  if (!healthkit.isHealthDataAvailable()) {
    throw new Error("Apple Health is not available on this device.");
  }

  await healthkit.requestAuthorization({ toRead: IOS_READ_TYPES });
}

async function getAppleHealthTodaySummary(): Promise<DailyHealthSummary> {
  const healthkit = await import("@kingstinct/react-native-healthkit");
  const { endTime, startTime } = getTodayRange();
  const filter = {
    filter: { date: { startDate: startTime, endDate: endTime } },
  };
  const [steps, distance, activeCalories, workouts] = await Promise.all([
    healthkit.queryStatisticsForQuantity(
      "HKQuantityTypeIdentifierStepCount",
      ["cumulativeSum"],
      { ...filter, unit: "count" },
    ),
    healthkit.queryStatisticsForQuantity(
      "HKQuantityTypeIdentifierDistanceWalkingRunning",
      ["cumulativeSum"],
      { ...filter, unit: "m" },
    ),
    healthkit.queryStatisticsForQuantity(
      "HKQuantityTypeIdentifierActiveEnergyBurned",
      ["cumulativeSum"],
      { ...filter, unit: "kcal" },
    ),
    healthkit.queryWorkoutSamples({ ...filter, limit: 0 }),
  ]);

  return {
    date: toDateKey(startTime),
    steps: Math.round(steps.sumQuantity?.quantity ?? 0),
    distanceMeters: Math.round(distance.sumQuantity?.quantity ?? 0),
    activeCalories: Math.round(activeCalories.sumQuantity?.quantity ?? 0),
    workouts: workouts.length,
    source: "appleHealth",
  };
}

async function requestHealthConnectPermissions() {
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();
  if (!initialized) {
    throw new Error(
      "Health Connect is unavailable. Install or enable Health Connect, then try again.",
    );
  }

  await healthConnect.requestPermission([
    { accessType: "read", recordType: "Steps" },
    { accessType: "read", recordType: "Distance" },
    { accessType: "read", recordType: "ActiveCaloriesBurned" },
    { accessType: "read", recordType: "ExerciseSession" },
  ]);
}

async function getHealthConnectTodaySummary(): Promise<DailyHealthSummary> {
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();
  if (!initialized) {
    throw new Error(
      "Health Connect is unavailable. Install or enable Health Connect, then try again.",
    );
  }

  const { endTime, startTime } = getTodayRange();
  const timeRangeFilter = {
    operator: "between" as const,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
  const [steps, distance, activeCalories, exerciseSessions] = await Promise.all([
    healthConnect.aggregateRecord({ recordType: "Steps", timeRangeFilter }),
    healthConnect.aggregateRecord({ recordType: "Distance", timeRangeFilter }),
    healthConnect.aggregateRecord({
      recordType: "ActiveCaloriesBurned",
      timeRangeFilter,
    }),
    healthConnect.readRecords("ExerciseSession", { timeRangeFilter }),
  ]);

  return {
    date: toDateKey(startTime),
    steps: Math.round(steps.COUNT_TOTAL ?? 0),
    distanceMeters: Math.round(distance.DISTANCE?.inMeters ?? 0),
    activeCalories: Math.round(
      activeCalories.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0,
    ),
    workouts: exerciseSessions.records.length,
    source: "healthConnect",
  };
}

function getTodayRange() {
  const endTime = new Date();
  const startTime = new Date(endTime);
  startTime.setHours(0, 0, 0, 0);

  return { endTime, startTime };
}
