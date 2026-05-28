// Unit tests for the durable per-actor rate-limit gate, focused on the
// `retryAfterSeconds` value that drives the "Try again in N seconds"
// frontend toast copy. The shared `@workspace/db` and `drizzle-orm`
// modules are mocked so the test stays hermetic.

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

const col = (name: string) => ({ __col: name }) as const;
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
  insert(_table: unknown) {
    return {
      values: async (v: { scope: string; key: string }) => {
        rateRows.push({ id: nextRateId++, scope: v.scope, key: v.key, createdAt: new Date(Date.now()) });
      },
    };
  },
  delete(_table: unknown) {
    return {
      where: async (pred: Predicate) => {
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
    let _where: Predicate = {};
    const chain = {
      from(_t: unknown) { return chain; },
      where(pred: Predicate) { _where = pred; return chain; },
      async orderBy(..._args: unknown[]) {
        const scope = _where["rateLimitAttempts.scope"];
        const key = _where["rateLimitAttempts.key"];
        return rateRows
          .filter((r) => r.scope === scope && r.key === key)
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((r) => ({ id: r.id, createdAt: r.createdAt }));
      },
    };
    return chain;
  },
};

mock.module("@workspace/db", {
  namedExports: { db: fakeDb, rateLimitAttemptsTable },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __col: string }, val: unknown): Predicate => ({ [c.__col]: val }),
    and: (...parts: Predicate[]) => Object.assign({}, ...parts),
    desc: (c: unknown) => ({ __desc: c }),
    lt: (c: { __col: string }, val: unknown): Predicate =>
      c.__col === "rateLimitAttempts.createdAt" ? { __lt_createdAt: val } : {},
  },
});

const { consumeRateLimitBudget } = await import("./rateLimitBudget.ts");

describe("consumeRateLimitBudget retryAfterSeconds", () => {
  beforeEach(() => {
    rateRows.length = 0;
    nextRateId = 1;
  });

  it("returns allowed=true with no retryAfter while under the cap", async () => {
    const a = await consumeRateLimitBudget("scope_a", "player:1", 60_000, 3);
    assert.deepEqual(a, { allowed: true });
    const b = await consumeRateLimitBudget("scope_a", "player:1", 60_000, 3);
    assert.deepEqual(b, { allowed: true });
  });

  it("reports retryAfterSeconds counting down from the oldest in-window row", async () => {
    const realNow = Date.now;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    try {
      // Burn the 3-slot/60s budget over a 4-second span. The oldest row
      // (now+0s) frees up at now+60s, so the immediate retry should report
      // ~60s of wait.
      await consumeRateLimitBudget("scope_b", "player:1", 60_000, 3);
      now += 2_000;
      await consumeRateLimitBudget("scope_b", "player:1", 60_000, 3);
      now += 2_000;
      await consumeRateLimitBudget("scope_b", "player:1", 60_000, 3);

      const denied = await consumeRateLimitBudget("scope_b", "player:1", 60_000, 3);
      assert.equal(denied.allowed, false);
      // 60s window, oldest row inserted at now-4s, so 56s remaining.
      assert.equal(denied.retryAfterSeconds, 56);

      // Advance 30s — still over cap, but the oldest row now has 26s left.
      now += 30_000;
      const denied2 = await consumeRateLimitBudget("scope_b", "player:1", 60_000, 3);
      assert.equal(denied2.allowed, false);
      assert.equal(denied2.retryAfterSeconds, 26);

      // Jump past the window — the GC sweep should free everything and the
      // next call should be allowed again.
      now += 30_000;
      const allowedAgain = await consumeRateLimitBudget("scope_b", "player:1", 60_000, 3);
      assert.deepEqual(allowedAgain, { allowed: true });
    } finally {
      Date.now = realNow;
    }
  });

  it("never returns retryAfterSeconds below 1 when the slot has just freed", async () => {
    const realNow = Date.now;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    try {
      await consumeRateLimitBudget("scope_c", "player:1", 60_000, 1);
      // 59.9s later the next call is still denied, but should report at
      // least 1 second to keep frontend countdowns from rendering "0s".
      now += 59_900;
      const denied = await consumeRateLimitBudget("scope_c", "player:1", 60_000, 1);
      assert.equal(denied.allowed, false);
      assert.ok((denied.retryAfterSeconds ?? 0) >= 1, "retryAfterSeconds must be >= 1");
    } finally {
      Date.now = realNow;
    }
  });
});
