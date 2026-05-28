import { db, playersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendWeeklyRecapNotification } from "./nutritionRecap";

// Run hourly. Idempotency is enforced per-player by `sourceId = isoWeekKey`
// inside `sendWeeklyRecapNotification`, so multiple ticks per week are safe.
const TICK_INTERVAL_MS = 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 14;

/**
 * Should the recap be delivered for the given UTC time? We aim for Sunday
 * (UTC day 0) between 14:00 and 23:59 — that's roughly Sunday morning across
 * the Americas. The idempotency check still guards against double-sends if
 * the job runs more than once in that window.
 */
function isInDeliveryWindow(now: Date): boolean {
  return now.getUTCDay() === 0 && now.getUTCHours() >= 14;
}

async function runRecapTick(now: Date = new Date()): Promise<void> {
  if (!isInDeliveryWindow(now)) return;

  const cutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const active = await db.query.playersTable.findMany({
    where: sql`${playersTable.lastActiveDate} >= ${cutoff.toISOString().slice(0, 10)}`,
    columns: { id: true },
  });

  let sent = 0;
  for (const p of active) {
    try {
      const ok = await sendWeeklyRecapNotification(p.id, now);
      if (ok) sent += 1;
    } catch (err) {
      logger.warn({ err, playerId: p.id }, "Weekly recap failed for player");
    }
  }

  if (sent > 0) {
    logger.info({ sent, considered: active.length }, "Weekly nutrition recap delivered");
  }
}

export function startWeeklyNutritionRecapJob(): void {
  logger.info("Weekly nutrition recap job started (hourly tick)");

  // Best-effort first run shortly after boot so a fresh deploy on Sunday
  // doesn't miss the window.
  setTimeout(() => { void runRecapTick(); }, 10_000);
  setInterval(() => { void runRecapTick(); }, TICK_INTERVAL_MS);
}
