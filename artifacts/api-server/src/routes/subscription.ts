import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { attachEntitlement } from "../services/subscriptionGuards";
import { refreshTop10Status } from "../services/top10";
import { getEntitlement } from "../services/entitlement";

const router = Router();

/**
 * Stripe is connected lazily so the API server still boots when the integration
 * is not yet set up. Routes that need Stripe respond 503 with a clear message
 * until the connection exists.
 */
// Stripe is loaded dynamically so the API server still boots when the
// integration package isn't installed yet. We use `any` here intentionally —
// the real types come in once Stripe is connected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryGetStripe(): Promise<any | null> {
  try {
    const mod = await import("../stripeClient.js");
    return await mod.getUncachableStripeClient();
  } catch {
    return null;
  }
}

// ── GET /subscription/me — full status snapshot for the UI ────────────────────
router.get("/subscription/me", requireAuth, attachPlayer, attachEntitlement, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  const ent = req.entitlement ?? getEntitlement(player);
  res.json({
    ...ent,
    pricing: {
      monthly: { amount: 899, currency: "usd", interval: "month", label: "$8.99 / month" },
      yearly:  { amount: 8000, currency: "usd", interval: "year",  label: "$80 / year (save 26%)" },
    },
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY || !!(await tryGetStripe()),
  });
});

// ── POST /subscription/refresh-top10 — manual recheck (used after rank changes) ──
router.post("/subscription/refresh-top10", requireAuth, attachPlayer, async (req, res) => {
  await refreshTop10Status(req.playerId!);
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(getEntitlement(player));
});

// ── POST /subscription/checkout — create a Stripe Checkout session ────────────
router.post("/subscription/checkout", requireAuth, attachPlayer, async (req, res) => {
  const stripe = await tryGetStripe();
  if (!stripe) {
    res.status(503).json({ error: "stripe_not_configured", message: "Payment processing isn't connected yet. Ask the admin to enable the Stripe integration." });
    return;
  }

  const interval = (req.body?.interval as "month" | "year") ?? "month";
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  // Find the configured price by metadata (set up via seed-products script)
  const products = await stripe.products.list({ active: true, limit: 20 });
  const subProduct = products.data.find((p: { metadata?: Record<string, string> }) =>
    p.metadata?.app === "hatchup" && p.metadata?.kind === "premium");
  if (!subProduct) {
    res.status(503).json({ error: "stripe_products_missing", message: "Premium products are not yet configured. Run the seed script first." });
    return;
  }
  const prices = await stripe.prices.list({ product: subProduct.id, active: true, limit: 10 });
  const price = prices.data.find((p: { recurring?: { interval: string } }) => p.recurring?.interval === interval);
  if (!price) {
    res.status(503).json({ error: "price_missing", message: `No ${interval}ly price configured.` });
    return;
  }

  // Reuse or create the Stripe customer for this player
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
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/subscription?status=success`,
    cancel_url:  `${origin}/subscription?status=cancelled`,
    metadata: { playerId: String(player.id) },
  });

  res.json({ url: session.url, sessionId: session.id });
});

// ── POST /subscription/portal — open the Stripe customer portal ───────────────
router.post("/subscription/portal", requireAuth, attachPlayer, async (req, res) => {
  const stripe = await tryGetStripe();
  if (!stripe) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player?.stripeCustomerId) {
    res.status(400).json({ error: "no_customer", message: "No Stripe customer on file yet." });
    return;
  }
  const origin = `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`;
  const portal = await stripe.billingPortal.sessions.create({
    customer: player.stripeCustomerId,
    return_url: `${origin}/subscription`,
  });
  res.json({ url: portal.url });
});

export default router;
