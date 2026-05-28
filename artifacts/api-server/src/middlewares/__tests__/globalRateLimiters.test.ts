// Tests that the global /api limiters (`generalLimiter`, `mutationLimiter` in
// app.ts) are keyed by the authenticated identity, not the raw IP, so two
// signed-in users sharing a single egress IP (corporate Wi-Fi, school
// networks, cellular CGNAT) don't throttle each other on read OR write
// endpoints.
//
// We don't boot the full app (it loads Stripe, Clerk, jobs, etc.). Instead we
// re-mount limiters with the SAME `clerkOrIpKey` generator + the same
// mutation-method gate the real app uses, and stub `@clerk/express` so each
// request can pretend to be a different signed-in user behind the same IP.

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Auth stub: read the clerk user id from a header so a single test process
// can simulate multiple authenticated callers behind one IP.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req: { headers: Record<string, string | string[] | undefined> }) => {
      const raw = req.headers["x-test-user"];
      const userId = Array.isArray(raw) ? raw[0] : raw;
      return { userId: userId ?? null };
    },
  },
});

const express = (await import("express")).default;
const rateLimit = (await import("express-rate-limit")).default;
const { clerkOrIpKey } = await import("../rateLimiters.ts");

let baseUrl: string;
let closeServer: () => Promise<void>;

const GENERAL_MAX = 5;
const MUTATION_MAX = 3;

before(async () => {
  const app = express();
  // 'loopback' keeps express-rate-limit happy — it refuses permissive
  // trust-proxy values to prevent header spoofing in production.
  app.set("trust proxy", "loopback");

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: GENERAL_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clerkOrIpKey,
    message: { error: "general" },
  });

  const mutationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: MUTATION_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clerkOrIpKey,
    message: { error: "mutation" },
  });

  app.use(generalLimiter);
  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      mutationLimiter(req, res, next);
    } else {
      next();
    }
  });
  app.get("/ping", (_req, res) => { res.json({ ok: true }); });
  app.post("/ping", (_req, res) => { res.json({ ok: true }); });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await closeServer();
});

let testIp = 0;
function nextIp(): string {
  testIp += 1;
  return `10.0.0.${testIp}`;
}

let userSeq = 0;
function nextUser(): string {
  userSeq += 1;
  return `u_global_${userSeq}`;
}

async function get(opts: { ip: string; userId?: string }) {
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip };
  if (opts.userId) headers["x-test-user"] = opts.userId;
  return fetch(`${baseUrl}/ping`, { headers });
}

async function post(opts: { ip: string; userId?: string }) {
  const headers: Record<string, string> = {
    "x-forwarded-for": opts.ip,
    "content-type": "application/json",
  };
  if (opts.userId) headers["x-test-user"] = opts.userId;
  return fetch(`${baseUrl}/ping`, { method: "POST", headers, body: "{}" });
}

describe("global /api limiters", () => {
  it("generalLimiter does NOT block a second signed-in player sharing one IP", async () => {
    const sharedIp = nextIp();
    const a = nextUser();
    const b = nextUser();

    // Burn through the entire cap from player A.
    for (let i = 0; i < GENERAL_MAX; i += 1) {
      const res = await get({ ip: sharedIp, userId: a });
      assert.equal(res.status, 200);
    }
    // Player A is now blocked.
    const blocked = await get({ ip: sharedIp, userId: a });
    assert.equal(blocked.status, 429, "player A's overflow should 429");

    // Player B on the SAME IP must still get through.
    const resB = await get({ ip: sharedIp, userId: b });
    assert.equal(resB.status, 200, "player B must not inherit player A's bucket");
  });

  it("mutationLimiter does NOT block a second signed-in player sharing one IP", async () => {
    const sharedIp = nextIp();
    const a = nextUser();
    const b = nextUser();

    for (let i = 0; i < MUTATION_MAX; i += 1) {
      const res = await post({ ip: sharedIp, userId: a });
      assert.equal(res.status, 200);
    }
    const blocked = await post({ ip: sharedIp, userId: a });
    assert.equal(blocked.status, 429, "player A's overflow write should 429");

    const resB = await post({ ip: sharedIp, userId: b });
    assert.equal(resB.status, 200, "player B's first write must not be throttled by player A");
  });

  it("still throttles a single signed-in player past the cap", async () => {
    const ip = nextIp();
    const u = nextUser();
    for (let i = 0; i < GENERAL_MAX; i += 1) {
      const res = await get({ ip, userId: u });
      assert.equal(res.status, 200);
    }
    const over = await get({ ip, userId: u });
    assert.equal(over.status, 429);
  });

  it("falls back to IP for anonymous traffic", async () => {
    const ip = nextIp();
    for (let i = 0; i < GENERAL_MAX; i += 1) {
      const res = await get({ ip });
      assert.equal(res.status, 200);
    }
    const over = await get({ ip });
    assert.equal(over.status, 429, "anonymous traffic on a single IP should still be capped");
  });
});
