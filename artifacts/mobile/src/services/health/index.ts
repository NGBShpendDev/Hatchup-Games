import type { HealthService } from "./HealthService";
import { mockHealthService } from "./mockHealthService";
import { nativeHealthService } from "./nativeHealthService";

export const healthService: HealthService =
  process.env.EXPO_PUBLIC_HEALTH_MODE === "native"
    ? nativeHealthService
    : mockHealthService;
