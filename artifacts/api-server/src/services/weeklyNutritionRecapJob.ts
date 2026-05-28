import { db, playersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendWeeklyRecapNotification } from "./nutritionRecap";
import { shouldDeliverForPlayer } from "./recapSchedule";

// Run hourly. Idempotency is enforced per-player by `sourceId = isoWeekKey`
// inside `sendWeeklyRecapNotification`, so multiple ticks per week are safe.
const TICK_INTERVAL_MS = 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 14;

async function runRecapTick(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const active = await db.query.playersTable.findMany({
    where: and(
      sql`${playersTable.lastActiveDate} >= ${cutoff.toISOString().slice(0, 10)}`,
      eq(playersTable.weeklyRecapEnabled, true),
    ),
    columns: {
      id: true,
      weeklyRecapDayOfWeek: true,
      weeklyRecapHourLocal: true,
      weeklyRecapTzOffsetMinutes: true,
      weeklyRecapTimezone: true,
    },
  });

  let sent = 0;
  let considered = 0;
  for (const p of active) {
    const due = shouldDeliverForPlayer(now, {
      dayOfWeek: p.weeklyRecapDayOfWeek,
      hourLocal: p.weeklyRecapHourLocal,
      tzOffsetMinutes: p.weeklyRecapTzOffsetMinutes,
      timezone: p.weeklyRecapTimezone,
    });
    if (!due) continue;
    considered += 1;
    try {
      const ok = await sendWeeklyRecapNotification(p.id, now);
      if (ok) sent += 1;
    } catch (err) {
      logger.warn({ err, playerId: p.id }, "Weekly recap failed for player");
    }
  }

  if (sent > 0) {
    logger.info({ sent, considered, eligible: active.length }, "Weekly nutrition recap delivered");
  }
}

export function startWeeklyNutritionRecapJob(): void {
  logger.info("Weekly nutrition recap job started (hourly tick)");

  // Best-effort first run shortly after boot so a fresh deploy doesn't miss
  // the current delivery hour.
  setTimeout(() => { void runRecapTick(); }, 10_000);
  setInterval(() => { void runRecapTick(); }, TICK_INTERVAL_MS);
}
