import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

type Player = {
  id: number;
  emailVerificationToken: string | null;
  emailVerificationExpiresAt: Date | null;
};

const state = {
  players: [] as Player[],
};

function reset() {
  state.players = [];
}

const col = (name: string) => ({ __col: name }) as const;

const playersTable = {
  __store: "players" as const,
  id: col("id"),
  emailVerificationToken: col("emailVerificationToken"),
  emailVerificationExpiresAt: col("emailVerificationExpiresAt"),
};

type Pred = (row: Record<string, unknown>) => boolean;

const storeFor = (t: { __store: keyof typeof state }) =>
  state[t.__store] as Array<Record<string, unknown>>;

const fakeDb = {
  select: (_cols: unknown) => ({
    from: (table: { __store: keyof typeof state }) => ({
      where: async (pred: Pred) =>
        storeFor(table).filter((r) => pred(r)).map((r) => ({ id: r.id })),
    }),
  }),
  update: (table: { __store: keyof typeof state }) => ({
    set: (values: Record<string, unknown>) => ({
      where: async (pred: Pred) => {
        for (const row of storeFor(table)) {
          if (pred(row)) Object.assign(row, values);
        }
      },
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    playersTable,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    and:
      (...parts: Pred[]): Pred =>
      (row) =>
        parts.every((p) => p(row)),
    isNotNull:
      (c: { __col: string }): Pred =>
      (row) =>
        row[c.__col] != null,
    lt:
      (c: { __col: string }, val: unknown): Pred =>
      (row) => {
        const v = row[c.__col];
        if (v == null || val == null) return false;
        return (v as Date | number) < (val as Date | number);
      },
  },
});

mock.module("../lib/logger.ts", {
  namedExports: {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  },
});

const { sweepExpiredEmailVerifications } = await import("./emailVerificationSweepJob.ts");

const NOW = new Date("2026-05-28T12:00:00Z");
const hourMs = 60 * 60 * 1000;

describe("sweepExpiredEmailVerifications", () => {
  beforeEach(reset);

  it("clears token + expiry for players whose link is past the expiry", async () => {
    state.players = [
      {
        id: 1,
        emailVerificationToken: "stale",
        emailVerificationExpiresAt: new Date(NOW.getTime() - hourMs),
      },
    ];
    const result = await sweepExpiredEmailVerifications(NOW);
    assert.equal(result.cleared, 1);
    assert.equal(state.players[0].emailVerificationToken, null);
    assert.equal(state.players[0].emailVerificationExpiresAt, null);
  });

  it("leaves still-valid tokens alone", async () => {
    state.players = [
      {
        id: 2,
        emailVerificationToken: "fresh",
        emailVerificationExpiresAt: new Date(NOW.getTime() + hourMs),
      },
    ];
    const result = await sweepExpiredEmailVerifications(NOW);
    assert.equal(result.cleared, 0);
    assert.equal(state.players[0].emailVerificationToken, "fresh");
    assert.ok(state.players[0].emailVerificationExpiresAt);
  });

  it("ignores rows that have no pending verification (already cleared)", async () => {
    state.players = [
      {
        id: 3,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    ];
    const result = await sweepExpiredEmailVerifications(NOW);
    assert.equal(result.cleared, 0);
  });

  it("is safe to run repeatedly — a second sweep is a no-op", async () => {
    state.players = [
      {
        id: 4,
        emailVerificationToken: "stale",
        emailVerificationExpiresAt: new Date(NOW.getTime() - hourMs),
      },
      {
        id: 5,
        emailVerificationToken: "fresh",
        emailVerificationExpiresAt: new Date(NOW.getTime() + hourMs),
      },
    ];
    const first = await sweepExpiredEmailVerifications(NOW);
    const second = await sweepExpiredEmailVerifications(NOW);
    assert.equal(first.cleared, 1);
    assert.equal(second.cleared, 0);
    // Fresh row remains untouched.
    assert.equal(state.players[1].emailVerificationToken, "fresh");
  });

  it("only clears rows where the expiry is strictly in the past", async () => {
    state.players = [
      {
        id: 6,
        emailVerificationToken: "boundary",
        emailVerificationExpiresAt: NOW,
      },
    ];
    const result = await sweepExpiredEmailVerifications(NOW);
    assert.equal(result.cleared, 0);
    assert.equal(state.players[0].emailVerificationToken, "boundary");
  });
});
