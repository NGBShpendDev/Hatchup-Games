import type { DailyHealthSummary, HealthSource } from "../../domain/models";

export interface HealthService {
  readonly source: HealthSource;
  readonly modeLabel: string;
  requestReadPermissions(): Promise<void>;
  getTodaySummary(): Promise<DailyHealthSummary>;
}
