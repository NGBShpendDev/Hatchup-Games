import { db, playersTable } from "@workspace/db";
import { and, isNotNull, lt } from "drizzle-orm";
import { logger } from "../lib/logger.ts";

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 60 * 1000;

/**
 * Null out any expired email verification tokens. Safe to run repeatedly:
 * the WHERE clause only matches rows whose `emailVerificationExpiresAt` is
 * strictly in the past, so already-cleared rows (where the column is NULL)
 * are skipped.
 */
export async function sweepExpiredEmailVerifications(
  now: Date = new Date(),
): Promise<{ cleared: number }> {
  const expired = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(
      and(
        isNotNull(playersTable.emailVerificationExpiresAt),
        lt(playersTable.emailVerificationExpiresAt, now),
      ),
    );

  if (expired.length === 0) return { cleared: 0 };

  await db
    .update(playersTable)
    .set({
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    })
    .where(
      and(
        isNotNull(playersTable.emailVerificationExpiresAt),
        lt(playersTable.emailVerificationExpiresAt, now),
      ),
    );

  logger.info(
    { cleared: expired.length },
    "email_verification_sweep_completed",
  );
  return { cleared: expired.length };
}

export function startEmailVerificationSweepJob(): void {
  logger.info("Email verification sweep job started (6h interval)");

  const tick = async () => {
    try {
      await sweepExpiredEmailVerifications();
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        "email_verification_sweep_failed",
      );
    }
  };

  setTimeout(tick, INITIAL_DELAY_MS);
  setInterval(tick, TICK_INTERVAL_MS);
}
