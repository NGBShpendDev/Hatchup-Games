import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";

const router = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryGetStripe(): Promise<any | null> {
  try {
    const mod = await import("../stripeClient.js");
    return await mod.getUncachableStripeClient();
  } catch {
    return null;
  }
}

const SHIELD_PACKS = {
  single: { amount: 300,  quantity: 1,  label: "Streak Shield",              description: "1 Streak Shield — auto-protects your streak if you miss a day." },
  bundle: { amount: 2000, quantity: 10, label: "Streak Shield Bundle (×10)", description: "10 Streak Shields — auto-protect your streak on any missed day." },
} as const;

// POST /shields/checkout — create a Stripe Checkout session for a shield pack
router.post("/shields/checkout", requireAuth, attachPlayer, async (req, res) => {
  const stripe = await tryGetStripe();
  if (!stripe) {
    res.status(503).json({ error: "stripe_not_configured", message: "Payment processing isn't connected yet." });
    return;
  }

  const pack = (req.body?.pack ?? "single") as "single" | "bundle";
  if (!SHIELD_PACKS[pack]) {
    res.status(400).json({ error: "invalid_pack", message: "Pack must be 'single' or 'bundle'." });
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

  const { amount, quantity, label, description } = SHIELD_PACKS[pack];
  const origin = `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: label, description },
        unit_amount: amount,
      },
      quantity: 1,
    }],
    success_url: `${origin}/subscription?status=shield_success`,
    cancel_url:  `${origin}/subscription`,
    metadata: { playerId: String(player.id), pack, quantity: String(quantity) },
  });

  req.log.info({ playerId: player.id, pack, sessionId: session.id }, "shield_checkout_created");
  res.json({ url: session.url, sessionId: session.id });
});

export default router;
