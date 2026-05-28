/**
 * Seed Stripe with HatchUp Premium product + prices.
 *
 * Usage:  pnpm --filter @workspace/scripts exec tsx src/seed-stripe-products.ts
 *
 * Idempotent: looks up the product by metadata.app=hatchup, metadata.kind=premium
 * before creating. Re-run after pricing changes — it adds new prices but leaves
 * old ones inactive instead of deleting (Stripe immutability).
 */
import Stripe from "stripe";

async function getStripe(): Promise<Stripe> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", process.env.REPLIT_DEPLOYMENT === "1" ? "production" : "development");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } });
  const data = await res.json();
  const secret = data.items?.[0]?.settings?.secret;
  if (!secret) throw new Error("Stripe connection not found");
  return new Stripe(secret, { apiVersion: "2025-08-27.basil" });
}

async function main(): Promise<void> {
  const stripe = await getStripe();

  // Find or create the premium product
  const existing = await stripe.products.list({ active: true, limit: 100 });
  let product = existing.data.find(p => p.metadata?.app === "hatchup" && p.metadata?.kind === "premium");

  if (!product) {
    product = await stripe.products.create({
      name: "HatchUp Premium",
      description: "Unlimited Hatchlings, unlimited AI coach, all leaderboards, premium cosmetics. Never pay-to-win.",
      metadata: { app: "hatchup", kind: "premium" },
    });
    console.log("Created product:", product.id);
  } else {
    console.log("Product already exists:", product.id);
  }

  // Ensure both prices exist
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });

  if (!prices.data.find(p => p.recurring?.interval === "month" && p.unit_amount === 899)) {
    const p = await stripe.prices.create({
      product: product.id,
      unit_amount: 899,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { app: "hatchup", tier: "monthly" },
    });
    console.log("Created monthly price:", p.id);
  } else {
    console.log("Monthly price already exists");
  }

  if (!prices.data.find(p => p.recurring?.interval === "year" && p.unit_amount === 8000)) {
    const p = await stripe.prices.create({
      product: product.id,
      unit_amount: 8000,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { app: "hatchup", tier: "yearly" },
    });
    console.log("Created yearly price:", p.id);
  } else {
    console.log("Yearly price already exists");
  }

  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
