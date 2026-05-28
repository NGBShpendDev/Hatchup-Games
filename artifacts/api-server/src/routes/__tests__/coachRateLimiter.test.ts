// Tests that the per-endpoint aiCoachLimiter is keyed by playerId, not IP,
// so two authenticated players sharing one egress IP (corporate Wi-Fi, school
// networks, cellular CGNAT) don't throttle each other.
//
// We mount the real coach router with the REAL aiCoachLimiter and stub
// everything downstream (db, OpenAI, entitlement guard) so the test stays
// hermetic.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory player state ──────────────────────────────────────────────────
type Player = { id: number; clerkId: string };
const state = {
  players: new Map<number, Player>(),
};

let nextSeq = 0;
function addPlayer(): Player {
  nextSeq += 1;
  const p = { id: nextSeq, clerkId: `u_${nextSeq}` };
  state.players.set(p.id, p);
  return p;
}

// ── Drizzle / DB stub ───────────────────────────────────────────────────────
const col = (name: string) => ({ __col: name }) as const;
const playersTable = { id: col("players.id"), clerkId: col("players.clerkId") };

// The aiCoachLimiter is now backed by the shared `rate_limit_attempts`
// table via `consumeRateLimitBudget`. We mock the table object and back it
// with an in-memory array so the limiter behaves the same as the old
// in-process express-rate-limit store across calls within one test.
const rateLimitAttemptsTable = {
  __table: "rateLimitAttempts" as const,
  id: col("rateLimitAttempts.id"),
  scope: col("rateLimitAttempts.scope"),
  key: col("rateLimitAttempts.key"),
  createdAt: col("rateLimitAttempts.createdAt"),
};

interface RateRow { id: number; scope: string; key: string; createdAt: Date }
const rateRows: RateRow[] = [];
let nextRateId = 1;

type Predicate = Record<string, unknown>;
const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where: Predicate }) => {
        const id = args.where["players.id"] as number | undefined;
        if (id != null) return state.players.get(id);
        const clerkId = args.where["players.clerkId"] as string | undefined;
        if (clerkId != null) {
          for (const p of state.players.values()) {
            if (p.clerkId === clerkId) return p;
          }
        }
        return undefined;
      },
    },
  },
  insert(table: unknown) {
    return {
      values: async (v: { scope?: string; key?: string }) => {
        if (table === (rateLimitAttemptsTable as unknown) && v?.scope && v?.key) {
          rateRows.push({
            id: nextRateId++,
            scope: v.scope,
            key: v.key,
            createdAt: new Date(Date.now()),
          });
        }
      },
    };
  },
  delete(table: unknown) {
    return {
      where: async (pred: Predicate) => {
        if (table !== (rateLimitAttemptsTable as unknown)) return;
        const scope = pred["rateLimitAttempts.scope"] as string | undefined;
        const key = pred["rateLimitAttempts.key"] as string | undefined;
        const cutoff = pred.__lt_createdAt as Date | undefined;
        for (let i = rateRows.length - 1; i >= 0; i--) {
          const r = rateRows[i]!;
          if (r.scope === scope && r.key === key && (cutoff ? r.createdAt < cutoff : true)) {
            rateRows.splice(i, 1);
          }
        }
      },
    };
  },
  select(_cols?: unknown) {
    let _from: unknown;
    let _where: Predicate = {};
    const chain = {
      from(t: unknown) { _from = t; return chain; },
      where(pred: Predicate) { _where = pred; return chain; },
      async orderBy(..._args: unknown[]) {
        if (_from !== (rateLimitAttemptsTable as unknown)) return [];
        const scope = _where["rateLimitAttempts.scope"];
        const key = _where["rateLimitAttempts.key"];
        return rateRows.filter((r) => r.scope === scope && r.key === key).map((r) => ({ id: r.id }));
      },
    };
    return chain;
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable,
    hatchlingsTable: {},
    rateLimitAttemptsTable,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __col: string }, val: unknown): Predicate => ({ [c.__col]: val }),
    and: (...parts: Predicate[]) => Object.assign({}, ...parts),
    lt: (c: { __col: string }, val: unknown): Predicate =>
      c.__col === "rateLimitAttempts.createdAt" ? { __lt_createdAt: val } : {},
    desc: (c: unknown) => ({ __desc: c }),
  },
});

// Auth: read clerk user from x-test-user header so each test can simulate
// multiple authenticated players behind one IP.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req: { headers: Record<string, string | string[] | undefined> }) => {
      const raw = req.headers["x-test-user"];
      const userId = Array.isArray(raw) ? raw[0] : raw;
      return { userId: userId ?? null };
    },
  },
});

// Skip entitlement + daily-cap guards entirely so the limiter is the only
// gate left in front of the handler.
mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceCoachDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// Stub the OpenAI client — we never want to hit the network.
mock.module("@workspace/integrations-openai-ai-server", {
  namedExports: {
    openai: {
      chat: {
        completions: {
          create: async () =>
            (async function* () {
              yield { choices: [{ delta: { content: "ok" } }] };
            })(),
        },
      },
    },
  },
});

// Stub the coach context builder so it doesn't touch the DB.
mock.module("../../services/coachService.ts", {
  namedExports: {
    buildCoachContext: async () => ({}),
    buildSystemPrompt: () => "system",
  },
});

// Validate via the real zod schema; only `message` is required.
mock.module("@workspace/api-zod", {
  namedExports: {
    CoachChatBody: {
      safeParse: (body: unknown) => {
        const b = body as { message?: unknown; history?: unknown };
        if (typeof b?.message !== "string") {
          return { success: false, error: { flatten: () => ({}) } };
        }
        return {
          success: true,
          data: { message: b.message, history: Array.isArray(b.history) ? b.history : [] },
        };
      },
    },
  },
});

// ── Imports that depend on the mocks above ──────────────────────────────────
const express = (await import("express")).default;
const coachRouter = (await import("../coach.ts")).default;

// ── Server setup ────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

let testIp = 0;
function nextIp(): string {
  testIp += 1;
  return `10.0.0.${testIp}`;
}

before(async () => {
  const app = express();
  // 'loopback' keeps express-rate-limit happy — it refuses permissive
  // trust-proxy values to prevent header spoofing in production.
  app.set("trust proxy", "loopback");
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, () => void> }).log = {
      warn: () => {}, info: () => {}, error: () => {}, debug: () => {},
    };
    next();
  });
  app.use(express.json());
  app.use(coachRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await closeServer();
});

beforeEach(() => {
  state.players.clear();
  rateRows.length = 0;
  nextRateId = 1;
  nextSeq += 1000; // jump the seq so per-player limiter buckets don't bleed across tests
});

async function postCoach(opts: { ip: string; userId: string; message?: string }) {
  const res = await fetch(`${baseUrl}/coach/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip,
      "x-test-user": opts.userId,
    },
    body: JSON.stringify({ message: opts.message ?? "hi", history: [] }),
  });
  // Drain the SSE body so the socket closes cleanly between calls.
  await res.text();
  return res;
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("POST /coach/chat aiCoachLimiter", () => {
  it("does NOT block two different players sharing one IP", async () => {
    const a = addPlayer();
    const b = addPlayer();
    const sharedIp = nextIp();

    // Burn through more than the 15/min cap from player A on the shared IP.
    // If the limiter were IP-keyed, player B's first request below would 429.
    for (let i = 0; i < 16; i += 1) {
      await postCoach({ ip: sharedIp, userId: a.clerkId });
    }

    const resB = await postCoach({ ip: sharedIp, userId: b.clerkId });
    assert.notEqual(
      resB.status,
      429,
      `player B must NOT be rate-limited by player A's traffic on the same IP (got ${resB.status})`,
    );
    assert.equal(resB.status, 200, "player B's first call should succeed");
  });

  it("still throttles a single player past the per-minute cap", async () => {
    const a = addPlayer();
    const ip = nextIp();

    // Limiter is 15/min. The 16th call from the same player must 429
    // regardless of IP.
    let lastStatus = 0;
    for (let i = 0; i < 15; i += 1) {
      const res = await postCoach({ ip, userId: a.clerkId });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 200, "first 15 calls within the minute should succeed");

    const over = await postCoach({ ip, userId: a.clerkId });
    assert.equal(over.status, 429, "16th call within the minute should be rate-limited");
  });

  it("rejects unauthenticated requests via requireAuth before the limiter runs", async () => {
    const res = await fetch(`${baseUrl}/coach/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify({ message: "hi" }),
    });
    await res.text();
    assert.equal(res.status, 401);
  });
});
