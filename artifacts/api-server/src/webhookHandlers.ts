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
import { playersTable, stripeShieldFulfillmentsTable, stripeIncubatorFulfillmentsTable, coinTransactionsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
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
      await projectShieldGrant(event);
      await projectIncubatorGrant(event);
      await projectCoinPackGrant(event);
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

async function projectShieldGrant(event: import("stripe").default.Event): Promise<void> {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as import("stripe").default.Checkout.Session;
  const { pack, playerId, quantity } = session.metadata ?? {};
  if (!pack || !playerId || (pack !== "single" && pack !== "bundle")) return;

  // Only fulfill after confirmed, settled payment
  if (session.payment_status !== "paid") {
    logger.warn({ sessionId: session.id, paymentStatus: session.payment_status }, "stripe_shield_skipped_unconfirmed_payment");
    return;
  }

  const shields = parseInt(quantity ?? (pack === "bundle" ? "10" : "1"), 10);
  const id = parseInt(playerId, 10);

  // Idempotency guard: skip if this checkout session was already fulfilled
  const existing = await db.query.stripeShieldFulfillmentsTable.findFirst({
    where: eq(stripeShieldFulfillmentsTable.checkoutSessionId, session.id),
  });
  if (existing) {
    logger.warn({ sessionId: session.id, eventId: event.id }, "stripe_shield_duplicate_skipped");
    return;
  }

  // Record fulfillment and credit shields atomically
  await db.transaction(async (tx) => {
    await tx.insert(stripeShieldFulfillmentsTable).values({
      checkoutSessionId: session.id,
      stripeEventId: event.id,
      playerId: id,
      pack,
      shields,
    });
    await tx
      .update(playersTable)
      .set({ streakShields: sql`${playersTable.streakShields} + ${shields}` })
      .where(eq(playersTable.id, id));
  });

  logger.info({ playerId: id, pack, shields, sessionId: session.id, eventId: event.id }, "stripe_shield_granted");
}

async function projectIncubatorGrant(event: import("stripe").default.Event): Promise<void> {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as import("stripe").default.Checkout.Session;
  const { kind, playerId } = session.metadata ?? {};
  if (kind !== "extra_incubator" || !playerId) return;

  if (session.payment_status !== "paid") {
    logger.warn({ sessionId: session.id, paymentStatus: session.payment_status }, "stripe_incubator_skipped_unconfirmed_payment");
    return;
  }

  const id = parseInt(playerId, 10);

  // Idempotency guard
  const existing = await db.query.stripeIncubatorFulfillmentsTable.findFirst({
    where: eq(stripeIncubatorFulfillmentsTable.checkoutSessionId, session.id),
  });
  if (existing) {
    logger.warn({ sessionId: session.id, eventId: event.id }, "stripe_incubator_duplicate_skipped");
    return;
  }

  const MAX_EXTRA = 5;

  await db.transaction(async (tx) => {
    await tx.insert(stripeIncubatorFulfillmentsTable).values({
      checkoutSessionId: session.id,
      stripeEventId: event.id,
      playerId: id,
    });
    // Increment extra slots, capped at MAX_EXTRA
    await tx
      .update(playersTable)
      .set({ extraIncubatorSlots: sql`LEAST(${MAX_EXTRA}, ${playersTable.extraIncubatorSlots} + 1)` })
      .where(eq(playersTable.id, id));
  });

  logger.info({ playerId: id, sessionId: session.id, eventId: event.id }, "stripe_incubator_granted");
}

async function projectCoinPackGrant(event: import("stripe").default.Event): Promise<void> {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as import("stripe").default.Checkout.Session;
  const { kind, playerId, coinsAmount } = session.metadata ?? {};
  if (kind !== "coin_pack" || !playerId || !coinsAmount) return;

  if (session.payment_status !== "paid") {
    logger.warn({ sessionId: session.id, paymentStatus: session.payment_status }, "coin_pack_skipped_unconfirmed_payment");
    return;
  }

  const coins = parseInt(coinsAmount, 10);
  const id = parseInt(playerId, 10);
  if (!coins || !id) return;

  // Idempotency guard via coin_transactions stripe_session_id
  const existing = await db.query.coinTransactionsTable.findFirst({
    where: and(
      eq(coinTransactionsTable.stripeSessionId, session.id),
      eq(coinTransactionsTable.type, "purchase")
    ),
  });
  if (existing) {
    logger.warn({ sessionId: session.id, eventId: event.id }, "coin_pack_duplicate_skipped");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(coinTransactionsTable).values({
      playerId: id,
      type: "purchase",
      amount: coins,
      description: `Coin pack purchase — ${coins.toLocaleString()} coins`,
      stripeSessionId: session.id,
    });
    await tx
      .update(playersTable)
      .set({ coins: sql`${playersTable.coins} + ${coins}` })
      .where(eq(playersTable.id, id));
  });

  logger.info({ playerId: id, coins, sessionId: session.id, eventId: event.id }, "coin_pack_granted");
}
