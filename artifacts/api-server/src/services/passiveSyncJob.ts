import { db } from "@workspace/db";
import { healthConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncGoogleFit } from "./googleFitSync";
import { logger } from "../lib/logger";

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

export function startPassiveSyncJob(): void {
  logger.info("Passive health sync job started (30-min interval)");

  const runSync = async () => {
    try {
      const connections = await db.query.healthConnectionsTable.findMany({
        where: eq(healthConnectionsTable.platform, "google_fit"),
      });

      for (const connection of connections) {
        if (!connection.accessToken) continue;
        try {
          const result = await syncGoogleFit(connection.playerId, connection);
          if (result.activitiesImported > 0) {
            logger.info(
              { playerId: connection.playerId, ...result },
              "Passive sync completed",
            );
          }
        } catch (err) {
          logger.warn({ err, playerId: connection.playerId }, "Passive sync failed for player");
        }
      }
    } catch (err) {
      logger.error({ err }, "Passive sync job error");
    }
  };

  setTimeout(runSync, 5000);
  setInterval(runSync, SYNC_INTERVAL_MS);
}
