import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, coinTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";

const router = Router();

async function tryGetStripe(): Promise<any | null> {
  try {
    const mod = await import("../stripeClient.js");
    return await mod.getUncachableStripeClient();
  } catch {
    return null;
  }
}

async function getStripePublishableKey(): Promise<string | null> {
  try {
    const mod = await import("../stripeClient.js");
    return await mod.getStripePublishableKey();
  } catch {
    return null;
  }
}

export const COIN_PACKS = [
  { id: "starter",   coins: 1000,  price: 1000,  label: "Starter Pack",    description: "1,000 coins to spend in-game.",              badge: null },
  { id: "explorer",  coins: 5000,  price: 4000,  label: "Explorer Pack",   description: "5,000 coins — great for regular players.",    badge: "Best Value" },
  { id: "mega",      coins: 12000, price: 8000,  label: "Mega Pack",       description: "12,000 coins — power up your game.",          badge: "50% Bonus" },
  { id: "legendary", coins: 25000, price: 15000, label: "Legendary Pack",  description: "25,000 coins — ultimate coin stash.",         badge: "Most Coins" },
] as const;

export type CoinPackId = typeof COIN_PACKS[number]["id"];

export const SHOP_ITEMS = {
  incubator_slot: { cost: 300, label: "Extra Egg Slot",    description: "One extra incubator slot (max 5 total)." },
  streak_shield:  { cost: 200, label: "Streak Shield",     description: "Protects your streak if you miss a day." },
} as const;

const MAX_EXTRA_INCUBATOR = 5;
const BASE_INCUBATOR_SLOTS = 3;

// ── GET /shop/coin-packs ─────────────────────────────────────────────────────
router.get("/shop/coin-packs", async (_req, res) => {
  const publishableKey = await getStripePublishableKey();
  res.json({
    packs: COIN_PACKS,
    items: SHOP_ITEMS,
    stripePublishableKey: publishableKey,
    stripeConfigured: !!publishableKey,
  });
});

// ── POST /shop/coin-packs/checkout ───────────────────────────────────────────
// Creates a Stripe Checkout session for a coin pack.
// Apple Pay + Google Pay are automatically offered by Stripe when the customer's
// device supports it (automatic_payment_methods: enabled handles this).
router.post("/shop/coin-packs/checkout", requireAuth, attachPlayer, async (req, res) => {
  const stripe = await tryGetStripe();
  if (!stripe) {
    res.status(503).json({ error: "stripe_not_configured", message: "Payment processing isn't connected yet." });
    return;
  }

  const { packId } = req.body as { packId?: string };
  const pack = COIN_PACKS.find((p) => p.id === packId);
  if (!pack) {
    res.status(400).json({ error: "invalid_pack", message: `Pack must be one of: ${COIN_PACKS.map((p) => p.id).join(", ")}` });
    return;
  }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "not_found" }); return; }

  let customerId = player.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { playerId: String(player.id), clerkId: player.clerkId ?? "" },
      name: player.displayName ?? player.username,
    });
    customerId = customer.id;
    await db.update(playersTable).set({ stripeCustomerId: customerId }).where(eq(playersTable.id, player.id));
  }

  const origin = `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    automatic_payment_methods: { enabled: true },
    customer: customerId,
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: pack.label,
          description: pack.description,
          metadata: { app: "hatchup", kind: "coin_pack", packId: pack.id },
        },
        unit_amount: pack.price,
      },
      quantity: 1,
    }],
    success_url: `${origin}/shop?status=coins_success&pack=${pack.id}`,
    cancel_url:  `${origin}/shop`,
    metadata: {
      kind: "coin_pack",
      packId: pack.id,
      coinsAmount: String(pack.coins),
      playerId: String(player.id),
    },
  });

  req.log.info({ playerId: player.id, packId: pack.id, coins: pack.coins, sessionId: session.id }, "coin_pack_checkout_created");
  res.json({ url: session.url, sessionId: session.id });
});

// ── POST /shop/buy-incubator-slot ────────────────────────────────────────────
// Spend 300 coins for one extra incubator slot (max 5 total extra).
router.post("/shop/buy-incubator-slot", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "not_found" }); return; }

  const COST = SHOP_ITEMS.incubator_slot.cost;
  const totalSlots = BASE_INCUBATOR_SLOTS + player.extraIncubatorSlots;

  if (player.extraIncubatorSlots >= MAX_EXTRA_INCUBATOR) {
    res.status(400).json({
      error: "max_slots_reached",
      message: `You already have the maximum of ${BASE_INCUBATOR_SLOTS + MAX_EXTRA_INCUBATOR} incubator slots.`,
    });
    return;
  }

  if ((player.coins ?? 0) < COST) {
    res.status(400).json({
      error: "insufficient_coins",
      message: `You need ${COST} coins but only have ${player.coins ?? 0}.`,
      coinsNeeded: COST,
      coinsAvailable: player.coins ?? 0,
    });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(playersTable).set({
      coins: sql`${playersTable.coins} - ${COST}`,
      extraIncubatorSlots: sql`${playersTable.extraIncubatorSlots} + 1`,
    }).where(eq(playersTable.id, player.id));

    await tx.insert(coinTransactionsTable).values({
      playerId: player.id,
      type: "spend",
      amount: -COST,
      description: `Purchased extra incubator slot (slot ${totalSlots + 1})`,
    });
  });

  const updated = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, player.id),
    columns: { coins: true, extraIncubatorSlots: true },
  });

  req.log.info({ playerId: player.id, coinsSpent: COST, newSlots: updated?.extraIncubatorSlots }, "incubator_slot_coin_purchase");
  res.json({
    ok: true,
    totalSlots: BASE_INCUBATOR_SLOTS + (updated?.extraIncubatorSlots ?? player.extraIncubatorSlots + 1),
    extraIncubatorSlots: updated?.extraIncubatorSlots ?? player.extraIncubatorSlots + 1,
    coinsSpent: COST,
    coinsRemaining: updated?.coins ?? (player.coins ?? 0) - COST,
  });
});

export default router;
