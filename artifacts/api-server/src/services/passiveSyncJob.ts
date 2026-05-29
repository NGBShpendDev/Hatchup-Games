import { db } from "@workspace/db";
import { healthConnectionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { syncGoogleFit } from "./googleFitSync.ts";
import { syncFitbit } from "./fitbitSync.ts";
import { syncGarmin } from "./garminSync.ts";
import { syncOura } from "./ouraSync.ts";
import { logger } from "../lib/logger.ts";

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

// Platforms that are synced passively via polling (apple_health is push-only)
const POLL_PLATFORMS = ["google_fit", "fitbit", "garmin", "oura"] as const;
type PollPlatform = typeof POLL_PLATFORMS[number];

const PLATFORM_SYNC_FNS: Record<PollPlatform, (playerId: number, conn: any) => Promise<{ activitiesImported: number; xpEarned: number }>> = {
  google_fit: syncGoogleFit,
  fitbit:     syncFitbit,
  garmin:     syncGarmin,
  oura:       syncOura,
};

export function startPassiveSyncJob(): void {
  logger.info("Passive health sync job started (30-min interval, platforms: google_fit, fitbit, garmin, oura)");

  const runSync = async () => {
    try {
      const connections = await db.query.healthConnectionsTable.findMany({
        where: inArray(healthConnectionsTable.platform, POLL_PLATFORMS as unknown as string[]),
      });

      for (const connection of connections) {
        if (!connection.accessToken) continue;
        const platform = connection.platform as PollPlatform;
        const syncFn = PLATFORM_SYNC_FNS[platform];
        if (!syncFn) continue;

        try {
          const result = await syncFn(connection.playerId, connection);
          if (result.activitiesImported > 0) {
            logger.info(
              { playerId: connection.playerId, platform, ...result },
              "Passive sync completed",
            );
          }
        } catch (err) {
          logger.warn({ err, playerId: connection.playerId, platform }, "Passive sync failed for player");
        }
      }
    } catch (err) {
      logger.error({ err }, "Passive sync job error");
    }
  };

  setTimeout(runSync, 5000);
  setInterval(runSync, SYNC_INTERVAL_MS);
}
