import { sendEndingSoonPushes } from "../routes/challenges.ts";
import { logger } from "../lib/logger.ts";

// Run every 5 minutes — frequent enough that a participant always lands well
// within the 24h-remaining window, idempotent thanks to the per-participant
// `endingSoonPushSentAt` flag.
const INTERVAL_MS = 5 * 60 * 1000;

export function startChallengePushJob(): void {
  logger.info("Challenge push job started (5-min interval)");

  const tick = async () => {
    try {
      await sendEndingSoonPushes();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "challenge_push_job_failed");
    }
  };

  setTimeout(tick, 10_000);
  setInterval(tick, INTERVAL_MS);
}
