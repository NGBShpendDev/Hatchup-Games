import { createServer } from "http";
import app from "./app.ts";
import { logger } from "./lib/logger.ts";
import { attachBattleWss } from "./services/matchmakingQueue.ts";
import { getStripeSync } from "./stripeClient.ts";
import { initPushNotifications } from "./services/pushNotifications.ts";
import { startChallengePushJob } from "./services/challengePushJob.ts";

/**
 * Initialize Stripe sync — migrations, managed webhook, and backfill.
 * Best-effort: if the Stripe connection isn't available (e.g. local dev
 * without secrets) we log and continue so the API still boots.
 */
async function initStripe(): Promise<void> {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL required for Stripe sync");

    await runMigrations({ databaseUrl });

    const stripeSync = await getStripeSync();
    const baseDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (baseDomain) {
      await stripeSync.findOrCreateManagedWebhook(`https://${baseDomain}/api/stripe/webhook`);
    }
    await stripeSync.syncBackfill();
    logger.info("Stripe sync initialized");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Stripe sync not initialized (continuing without it)");
  }
}

void initStripe();
void initPushNotifications().then(() => startChallengePushJob());

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Wrap Express in an HTTP server so WebSockets can share the same port
const server = createServer(app);
attachBattleWss(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
