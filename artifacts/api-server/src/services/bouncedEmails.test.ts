import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

type Row = {
  id: number;
  email: string;
  bounceType: string;
  reason: string | null;
  source: string;
  bouncedAt: Date;
  createdAt: Date;
};

const state = {
  rows: [] as Row[],
  nextId: 1,
};

function reset() {
  state.rows = [];
  state.nextId = 1;
}

const col = (name: string) => ({ __col: name }) as const;

const bouncedEmailsTable = {
  __store: "rows" as const,
  id: col("id"),
  email: col("email"),
};

type Pred = (row: Record<string, unknown>) => boolean;

const fakeDb = {
  query: {
    bouncedEmailsTable: {
      findFirst: async ({ where }: { where: Pred }) =>
        state.rows.find((r) => where(r as unknown as Record<string, unknown>)) ?? null,
    },
  },
  insert: (_table: unknown) => ({
    values: (vals: Partial<Row>) => ({
      onConflictDoUpdate: async ({ set }: { target: unknown; set: Partial<Row> }) => {
        const existing = state.rows.find((r) => r.email === vals.email);
        if (existing) {
          Object.assign(existing, set);
        } else {
          state.rows.push({
            id: state.nextId++,
            email: vals.email!,
            bounceType: vals.bounceType ?? "hard",
            reason: vals.reason ?? null,
            source: vals.source ?? "resend.webhook",
            bouncedAt: new Date(),
            createdAt: new Date(),
          });
        }
      },
    }),
  }),
  delete: (_table: unknown) => ({
    where: (pred: Pred) => ({
      returning: async (_cols: unknown) => {
        const kept: Row[] = [];
        const removed: Row[] = [];
        for (const r of state.rows) {
          if (pred(r as unknown as Record<string, unknown>)) removed.push(r);
          else kept.push(r);
        }
        state.rows = kept;
        return removed.map((r) => ({ id: r.id }));
      },
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    bouncedEmailsTable,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq:
      (c: { __col: string }, val: unknown): Pred =>
      (row) =>
        row[c.__col] === val,
  },
});

mock.module("../lib/logger.ts", {
  namedExports: {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  },
});

const { isEmailBouncing, recordEmailBounce, clearEmailBounce, normalizeEmail } = await import(
  "./bouncedEmails.ts"
);

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    assert.equal(normalizeEmail("  Foo@Bar.COM  "), "foo@bar.com");
  });
});

describe("recordEmailBounce", () => {
  beforeEach(reset);

  it("persists a hard bounce normalized to lowercase", async () => {
    const ok = await recordEmailBounce({ email: "Foo@Bar.com", bounceType: "hard", reason: "550" });
    assert.equal(ok, true);
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].email, "foo@bar.com");
    assert.equal(state.rows[0].bounceType, "hard");
    assert.equal(state.rows[0].reason, "550");
  });

  it("persists complaints", async () => {
    const ok = await recordEmailBounce({ email: "a@b.com", bounceType: "complaint" });
    assert.equal(ok, true);
    assert.equal(state.rows[0].bounceType, "complaint");
  });

  it("ignores soft / transient bounces (deliverability self-recovers)", async () => {
    const ok = await recordEmailBounce({ email: "a@b.com", bounceType: "soft" });
    assert.equal(ok, false);
    assert.equal(state.rows.length, 0);
  });

  it("ignores empty addresses", async () => {
    const ok = await recordEmailBounce({ email: "   ", bounceType: "hard" });
    assert.equal(ok, false);
    assert.equal(state.rows.length, 0);
  });

  it("upserts on conflict — second bounce for same address updates the row", async () => {
    await recordEmailBounce({ email: "a@b.com", bounceType: "hard", reason: "first" });
    await recordEmailBounce({ email: "a@b.com", bounceType: "complaint", reason: "second" });
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].bounceType, "complaint");
    assert.equal(state.rows[0].reason, "second");
  });
});

describe("isEmailBouncing", () => {
  beforeEach(reset);

  it("returns true after a hard bounce, false otherwise", async () => {
    assert.equal(await isEmailBouncing("a@b.com"), false);
    await recordEmailBounce({ email: "a@b.com", bounceType: "hard" });
    assert.equal(await isEmailBouncing("a@b.com"), true);
  });

  it("is case-insensitive and trims whitespace", async () => {
    await recordEmailBounce({ email: "case@test.com", bounceType: "hard" });
    assert.equal(await isEmailBouncing(" CASE@Test.COM "), true);
  });

  it("returns false for empty input", async () => {
    assert.equal(await isEmailBouncing(""), false);
  });
});

describe("clearEmailBounce", () => {
  beforeEach(reset);

  it("removes a previously recorded bounce", async () => {
    await recordEmailBounce({ email: "a@b.com", bounceType: "hard" });
    assert.equal(await isEmailBouncing("a@b.com"), true);
    const cleared = await clearEmailBounce("A@B.com");
    assert.equal(cleared, true);
    assert.equal(await isEmailBouncing("a@b.com"), false);
  });

  it("returns false when nothing to clear", async () => {
    const cleared = await clearEmailBounce("noone@nowhere.com");
    assert.equal(cleared, false);
  });
});
