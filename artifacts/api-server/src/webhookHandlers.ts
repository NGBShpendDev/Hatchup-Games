/**
 * Minimal Stripe webhook handler. Per the stripe skill, we just hand the raw
 * payload + signature to stripe-replit-sync, which keeps our local `stripe.*`
 * schema in sync with Stripe automatically.
 *
 * We additionally project subscription state onto our own `players` table
 * (paidUntil, stripeSubscriptionId) so the entitlement resolver can read it
 * without joining stripe schema tables on every request.
 */
import { getStripeSync, getUncachableStripeClient } from "./stripeClient.ts";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.ts";

export const WebhookHandlers = {
  async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Mirror subscription state into our players table for fast entitlement reads
    try {
      const stripe = await getUncachableStripeClient();
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        await sync.getWebhookSecret(),
      );
      await projectSubscriptionState(event);
    } catch (err) {
      logger.warn({ err }, "stripe_event_projection_failed");
    }
  },
};

async function projectSubscriptionState(event: import("stripe").default.Event): Promise<void> {
  const type = event.type;
  if (!type.startsWith("customer.subscription.")) return;

  const sub = event.data.object as import("stripe").default.Subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.stripeCustomerId, customerId),
  });
  if (!player) return;

  const active = sub.status === "active" || sub.status === "trialing";
  const periodEnd = sub.items.data[0]?.current_period_end ?? 0;
  const paidUntil = active && periodEnd ? new Date(periodEnd * 1000) : null;

  await db
    .update(playersTable)
    .set({
      stripeSubscriptionId: sub.id,
      paidUntil,
      subscriptionTier: active ? "premium" : "free",
      subscriptionSource: active ? "paid" : "expired",
    })
    .where(eq(playersTable.id, player.id));

  logger.info({ playerId: player.id, status: sub.status, paidUntil }, "stripe_sub_projected");
}
