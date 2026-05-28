// End-to-end coverage for the subscription pipeline that doesn't require
// a live Stripe checkout:
//
//   1. Webhook projection — a `customer.subscription.created` event mirrored
//      through `WebhookHandlers.processWebhook` must update the matching
//      `players` row with `paidUntil`, `stripeSubscriptionId`,
//      `subscriptionTier="premium"`, `subscriptionSource="paid"`.
//
//   2. Free-tier cap — `enforceHatchlingCap` must 402 the 7th hatchling
//      for a free player whose entitlement caps storage at 6.
//
// The actual Stripe Checkout -> redirect -> webhook flow is exercised by a
// manual Playwright pass (see commit message); this file locks in the two
// server-side contracts that are most likely to silently regress.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory player store ──────────────────────────────────────────────────
interface PlayerRow {
  id: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paidUntil: Date | null;
  subscriptionTier: string;
  subscriptionSource: string;
}
const players = new Map<number, PlayerRow>();

interface HatchlingRow { id: number; playerId: number }
const hatchlings: HatchlingRow[] = [];

const col = (name: string) => ({ __col: name }) as const;
const playersTable = {
  id: col("players.id"),
  stripeCustomerId: col("players.stripeCustomerId"),
};
const hatchlingsTable = { playerId: col("hatchlings.playerId") };

type Predicate = Record<string, unknown>;
const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where: Predicate }) => {
        const id = args.where["players.id"] as number | undefined;
        if (id != null) return players.get(id);
        const cust = args.where["players.stripeCustomerId"] as string | undefined;
        if (cust != null) {
          for (const p of players.values()) {
            if (p.stripeCustomerId === cust) return p;
          }
        }
        return undefined;
      },
    },
    hatchlingsTable: {
      findMany: async (args: { where: Predicate }) => {
        const pid = args.where["hatchlings.playerId"] as number | undefined;
        return hatchlings.filter((h) => h.playerId === pid);
      },
    },
  },
  update(_table: unknown) {
    return {
      set(values: Partial<PlayerRow>) {
        return {
          async where(pred: Predicate) {
            const id = pred["players.id"] as number | undefined;
            if (id == null) return;
            const row = players.get(id);
            if (!row) return;
            Object.assign(row, values);
          },
        };
      },
    };
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable,
    hatchlingsTable,
    playerLocationTable: {},
    playerArtifactsTable: {},
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __col: string }, val: unknown): Predicate => ({ [c.__col]: val }),
    and: (...parts: Predicate[]) => Object.assign({}, ...parts),
    or: (...parts: Predicate[]) => Object.assign({}, ...parts),
    gt: () => ({} as Predicate),
    lt: () => ({} as Predicate),
    gte: () => ({} as Predicate),
    lte: () => ({} as Predicate),
    ne: () => ({} as Predicate),
    desc: (c: unknown) => ({ __desc: c }),
    asc: (c: unknown) => ({ __asc: c }),
    inArray: () => ({} as Predicate),
    notInArray: () => ({} as Predicate),
    sql: () => ({} as Predicate),
  },
});

// Webhook handler depends on stripeClient — stub both helpers so no real
// Stripe SDK is loaded.
const SECRET = "whsec_test_dummy";
const VALID_SIG = "t=1,v1=test";

mock.module("../../stripeClient.ts", {
  namedExports: {
    getStripeSync: async () => ({
      // Real stripe-replit-sync verifies the signature before mirroring the
      // event into the stripe.* schema. Reject non-VALID_SIG calls so the
      // HTTP route surfaces the same 400 a real bad-signature request would.
      processWebhook: async (_payload: Buffer, sig: string) => {
        if (sig !== VALID_SIG) throw new Error("Invalid stripe signature (sync stub)");
      },
      getWebhookSecret: async () => SECRET,
    }),
    getUncachableStripeClient: async () => ({
      webhooks: {
        // The real `constructEvent` verifies the signature against the
        // payload + secret. For the test we accept any signature equal to
        // VALID_SIG (so we can prove the route checks the header) and just
        // parse the JSON payload back into an Event.
        constructEvent: (payload: Buffer, sig: string, _secret: string) => {
          if (sig !== VALID_SIG) {
            throw new Error("Invalid stripe signature (test stub)");
          }
          return JSON.parse(payload.toString("utf8")) as import("stripe").default.Event;
        },
      },
    }),
  },
});

mock.module(new URL("../../lib/logger.ts", import.meta.url).href, {
  namedExports: { logger: { warn() {}, info() {}, error() {}, debug() {} } },
});

// ── Imports that depend on the mocks above ──────────────────────────────────
const { WebhookHandlers } = await import("../../webhookHandlers.ts");
const { enforceHatchlingCap } = await import("../../services/subscriptionGuards.ts");
const express = (await import("express")).default;

function eventBuf(event: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify(event));
}

function subEvent(
  type: string,
  body: { id: string; customer: string; status: string; current_period_end: number },
): Record<string, unknown> {
  return {
    id: `evt_${body.id}`,
    type,
    data: {
      object: {
        id: body.id,
        customer: body.customer,
        status: body.status,
        items: { data: [{ current_period_end: body.current_period_end }] },
      },
    },
  };
}

function basePlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 1,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    paidUntil: null,
    subscriptionTier: "free",
    subscriptionSource: "expired",
    ...overrides,
  };
}

beforeEach(() => {
  players.clear();
  hatchlings.length = 0;
});

// ── Webhook projection ──────────────────────────────────────────────────────
describe("WebhookHandlers.processWebhook → players projection (handler)", () => {
  it("projects an active subscription onto paidUntil + subscriptionTier=premium", async () => {
    const p = basePlayer({ id: 42, stripeCustomerId: "cus_TEST_42" });
    players.set(p.id, p);

    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    await WebhookHandlers.processWebhook(
      eventBuf(subEvent("customer.subscription.created", {
        id: "sub_TEST_1", customer: "cus_TEST_42", status: "active", current_period_end: periodEnd,
      })),
      VALID_SIG,
    );

    const updated = players.get(42)!;
    assert.equal(updated.subscriptionTier, "premium");
    assert.equal(updated.subscriptionSource, "paid");
    assert.equal(updated.stripeSubscriptionId, "sub_TEST_1");
    assert.ok(updated.paidUntil instanceof Date);
    assert.equal(updated.paidUntil!.getTime(), periodEnd * 1000);
  });

  it("downgrades the player when the subscription is canceled/inactive", async () => {
    const p = basePlayer({
      id: 7,
      stripeCustomerId: "cus_TEST_7",
      stripeSubscriptionId: "sub_old",
      paidUntil: new Date(Date.now() + 86_400_000),
      subscriptionTier: "premium",
      subscriptionSource: "paid",
    });
    players.set(p.id, p);

    await WebhookHandlers.processWebhook(
      eventBuf(subEvent("customer.subscription.deleted", {
        id: "sub_old", customer: "cus_TEST_7", status: "canceled", current_period_end: 0,
      })),
      VALID_SIG,
    );

    const updated = players.get(7)!;
    assert.equal(updated.subscriptionTier, "free");
    assert.equal(updated.subscriptionSource, "expired");
    assert.equal(updated.paidUntil, null);
  });

  it("ignores events for unknown customers without throwing", async () => {
    await assert.doesNotReject(
      WebhookHandlers.processWebhook(
        eventBuf(subEvent("customer.subscription.created", {
          id: "sub_x", customer: "cus_NOT_IN_DB", status: "active", current_period_end: 1,
        })),
        VALID_SIG,
      ),
    );
  });

  it("skips non-subscription event types", async () => {
    const p = basePlayer({ id: 9, stripeCustomerId: "cus_9" });
    players.set(p.id, p);
    await WebhookHandlers.processWebhook(
      eventBuf({ id: "evt_4", type: "invoice.paid", data: { object: { customer: "cus_9" } } }),
      VALID_SIG,
    );

    const updated = players.get(9)!;
    assert.equal(updated.subscriptionTier, "free"); // unchanged
    assert.equal(updated.stripeSubscriptionId, null);
  });
});

// ── HTTP-level webhook route (mirrors the wiring in app.ts) ──────────────────
const { logger: routeLogger } = await import("../../lib/logger.ts");

describe("POST /api/stripe/webhook (HTTP route)", () => {
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  before(async () => {
    const app = express();
    // Mirror app.ts: raw body parser registered before the route so we receive
    // the unmodified Buffer for signature verification.
    app.post(
      "/api/stripe/webhook",
      express.raw({ type: "application/json" }),
      async (req, res) => {
        const signature = req.headers["stripe-signature"];
        if (!signature) { res.status(400).json({ error: "Missing signature" }); return; }
        const sig = Array.isArray(signature) ? signature[0] : signature;
        try {
          await WebhookHandlers.processWebhook(req.body as Buffer, sig);
          res.status(200).json({ received: true });
        } catch (err) {
          routeLogger.error({ err }, "stripe_webhook_processing_failed");
          res.status(400).json({ error: "Webhook processing failed" });
        }
      },
    );
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  after(async () => { await closeServer(); });

  it("400s when the stripe-signature header is missing", async () => {
    const res = await fetch(`${baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "evt_x", type: "customer.subscription.created" }),
    });
    assert.equal(res.status, 400);
  });

  it("posts customer.subscription.created and projects players.paidUntil + subscriptionTier=premium", async () => {
    const p = basePlayer({ id: 101, stripeCustomerId: "cus_HTTP_101" });
    players.set(p.id, p);
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    const res = await fetch(`${baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": VALID_SIG },
      body: JSON.stringify(subEvent("customer.subscription.created", {
        id: "sub_HTTP_1", customer: "cus_HTTP_101", status: "active", current_period_end: periodEnd,
      })),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });

    const updated = players.get(101)!;
    assert.equal(updated.subscriptionTier, "premium");
    assert.equal(updated.subscriptionSource, "paid");
    assert.equal(updated.stripeSubscriptionId, "sub_HTTP_1");
    assert.equal(updated.paidUntil!.getTime(), periodEnd * 1000);
  });

  it("400s when the signature does not verify", async () => {
    const res = await fetch(`${baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "definitely-wrong" },
      body: JSON.stringify(subEvent("customer.subscription.created", {
        id: "sub_bad", customer: "cus_HTTP_101", status: "active", current_period_end: 1,
      })),
    });
    assert.equal(res.status, 400);
  });
});

// ── Free-tier cap enforcement ───────────────────────────────────────────────
describe("enforceHatchlingCap (POST /hatchlings)", () => {
  function runMiddleware(req: Record<string, unknown>): Promise<{ status?: number; body?: unknown; nextCalled: boolean }> {
    return new Promise((resolve) => {
      let status: number | undefined;
      let body: unknown;
      const res = {
        status(code: number) { status = code; return res; },
        json(payload: unknown) { body = payload; resolve({ status, body, nextCalled: false }); return res; },
      };
      enforceHatchlingCap(
        req as unknown as Parameters<typeof enforceHatchlingCap>[0],
        res as unknown as Parameters<typeof enforceHatchlingCap>[1],
        () => resolve({ status, body, nextCalled: true }),
      );
    });
  }

  const freeEntitlement = {
    tier: "free" as const,
    features: { hatchlingStorageCap: 6 },
  };

  it("allows the 6th hatchling for a free player", async () => {
    for (let i = 1; i <= 5; i += 1) hatchlings.push({ id: i, playerId: 1 });
    const result = await runMiddleware({ playerId: 1, entitlement: freeEntitlement });
    assert.equal(result.nextCalled, true);
    assert.equal(result.status, undefined);
  });

  it("rejects the 7th hatchling with 402 hatchling_cap_reached", async () => {
    for (let i = 1; i <= 6; i += 1) hatchlings.push({ id: i, playerId: 1 });
    const result = await runMiddleware({ playerId: 1, entitlement: freeEntitlement });
    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 402);
    assert.deepEqual((result.body as { error: string; cap: number }).error, "hatchling_cap_reached");
    assert.equal((result.body as { cap: number }).cap, 6);
  });

  it("does not gate premium players", async () => {
    for (let i = 1; i <= 50; i += 1) hatchlings.push({ id: i, playerId: 1 });
    const result = await runMiddleware({
      playerId: 1,
      entitlement: { tier: "premium", features: { hatchlingStorageCap: 9999 } },
    });
    assert.equal(result.nextCalled, true);
  });
});
