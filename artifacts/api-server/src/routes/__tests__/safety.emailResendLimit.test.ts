// Locks in the email-confirmation resend rate-limit behavior, which is a
// sender-reputation guardrail (3 sends per rolling hour per player). Without
// these tests a future refactor could quietly loosen the cap or break the
// shared budget between POST /email/resend-verification and the implicit
// resend fired from PATCH /players/:id/privacy-settings on email change.
//
// Three groups of tests:
//
//   1. Unit tests for consumeEmailResendBudget — allow / deny / window
//      rollover. The function is backed by the `email_resend_attempts`
//      Postgres table; we mock the db layer with an in-memory array and
//      swap Date.now during the rollover test rather than sleeping for an
//      hour.
//
//   2. Integration test: 4× POST /api/email/resend-verification — the 4th
//      hit must return 429 with the structured `too_many_email_resends`
//      body. Exercises the actual emailResendLimiter middleware mounted on
//      the route.
//
//   3. Integration test: PATCH /privacy-settings with an email change after
//      3 prior POST /api/email/resend-verification calls — the privacy row
//      still commits but the response carries
//      emailVerificationRateLimited: true and no extra send is attempted.
//      Verifies POST and PATCH share a single bucket per player.
//
// The DB, Clerk auth, attachPlayer middleware, issueEmailVerification, and
// bouncedEmails services are mocked via node:test module mocks so the routes
// run in isolation. Each integration test uses a distinct playerId so the
// process-shared attempts table does not leak across tests.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  emailVerificationToken: string | null;
  emailVerificationExpiresAt: Date | null;
  isAdmin: boolean;
  isMinor: boolean;
  isSuspended: boolean;
  locationVisibility: string;
  requireWorkoutApproval: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  isVerified: boolean;
  weeklyRecapEnabled: boolean;
  weeklyRecapDayOfWeek: number;
  weeklyRecapHourLocal: number;
  weeklyRecapTzOffsetMinutes: number;
  weeklyRecapTimezone: string | null;
  notifyRecapEmail: boolean;
  notifyChampionEmail: boolean;
  notifyRecapPush: boolean;
}

interface IssueCall {
  playerId: number;
  email: string;
  displayName: string | null;
}

type IssueResult = "sent" | "skipped_unconfigured" | "skipped_failed" | "bouncing";

interface ResendAttempt {
  id: number;
  key: string;
  createdAt: Date;
}

const state = {
  callerClerkId: "u_caller",
  players: [] as PlayerRow[],
  issueCalls: [] as IssueCall[],
  issueResult: "sent" as IssueResult,
  issueThrows: false,
  resendAttempts: [] as ResendAttempt[],
  nextResendId: 1,
};

function resetState() {
  state.callerClerkId = "u_caller";
  state.players = [];
  state.issueCalls = [];
  state.issueResult = "sent";
  state.issueThrows = false;
  state.resendAttempts = [];
  state.nextResendId = 1;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
const col = (name: string) => ({ __col: name }) as const;

const playersTable = {
  id: col("players.id"),
  clerkId: col("players.clerkId"),
  emailVerificationToken: col("players.emailVerificationToken"),
};

const emailResendAttemptsTable = {
  __table: "emailResendAttempts" as const,
  id: col("emailResendAttempts.id"),
  key: col("emailResendAttempts.key"),
  createdAt: col("emailResendAttempts.createdAt"),
};

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __col: string }, val: unknown) => ({ __eq: { col: c.__col, val } }),
    lt: (c: { __col: string }, val: unknown) => ({ __lt: { col: c.__col, val } }),
    and: (...parts: Record<string, unknown>[]) => Object.assign({}, ...parts),
    or: (...parts: Record<string, unknown>[]) => ({ __or: parts }),
    desc: () => ({}),
    notInArray: () => ({}),
  },
});

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.callerClerkId }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
    attachPlayer: (req: Request, res: Response, next: NextFunction) => {
      const found = state.players.find((p) => p.clerkId === state.callerClerkId);
      if (!found) {
        res.status(404).json({ error: "Player profile not found." });
        return;
      }
      req.playerId = found.id;
      next();
    },
  },
});

mock.module("../../services/emailVerification.ts", {
  namedExports: {
    issueEmailVerification: async (
      playerId: number,
      email: string,
      displayName: string | null,
    ): Promise<IssueResult> => {
      state.issueCalls.push({ playerId, email, displayName });
      if (state.issueThrows) throw new Error("boom");
      return state.issueResult;
    },
  },
});

// Stub the bounce-list helpers — safety.ts imports these directly and they'd
// otherwise try to hit the mocked-out DB through unconfigured query paths.
// These tests cover the non-bouncing happy path.
mock.module("../../services/bouncedEmails.ts", {
  namedExports: {
    isEmailBouncing: async () => false,
    recordEmailBounce: async () => false,
    clearEmailBounce: async () => false,
    normalizeEmail: (s: string) => s.trim().toLowerCase(),
  },
});

// Minimal fake DB.
//
// playersTable:
//   - db.query.playersTable.findFirst({ where: <eq predicate> })
//   - db.update(playersTable).set(values).where(predicate).returning() and the
//     no-returning variant.
//
// emailResendAttemptsTable (used by consumeEmailResendBudget):
//   - db.delete(emailResendAttemptsTable).where(<lt predicate on createdAt>)
//   - db.select({id}).from(emailResendAttemptsTable).where(<eq on key>).orderBy(...)
//   - db.insert(emailResendAttemptsTable).values({ key })
//
// Other tables (reports, blocks, audit, notifications, bounces) are only
// referenced via stub exports below so the safety router module loads.
const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        const idMatch = (w as { __eq?: { col: string; val: unknown } }).__eq;
        if (idMatch?.col === "players.id") {
          return state.players.find((p) => p.id === idMatch.val);
        }
        if (idMatch?.col === "players.emailVerificationToken") {
          return state.players.find((p) => p.emailVerificationToken === idMatch.val);
        }
        return undefined;
      },
    },
  },
  update(_table: unknown) {
    let setValues: Partial<PlayerRow> = {};
    let wherePred: { __eq?: { col: string; val: unknown } } = {};
    const apply = (): PlayerRow | undefined => {
      const eq = wherePred.__eq;
      if (eq?.col !== "players.id") return undefined;
      const idx = state.players.findIndex((p) => p.id === eq.val);
      if (idx === -1) return undefined;
      state.players[idx] = { ...state.players[idx]!, ...setValues };
      return state.players[idx];
    };
    const chain = {
      set(values: Partial<PlayerRow>) {
        setValues = values;
        return chain;
      },
      where(pred: { __eq?: { col: string; val: unknown } }) {
        wherePred = pred;
        apply();
        return chain;
      },
      async returning(_cols?: unknown) {
        const updated = apply();
        return updated ? [updated] : [];
      },
      then(resolve: (v: unknown) => void) {
        resolve(undefined);
      },
    };
    return chain;
  },
  insert(table: unknown) {
    return {
      values: async (v: { key?: string } | undefined) => {
        if (
          table === (emailResendAttemptsTable as unknown) &&
          v &&
          typeof v.key === "string"
        ) {
          state.resendAttempts.push({
            id: state.nextResendId++,
            key: v.key,
            // Use Date.now() explicitly so the unit test that swaps Date.now
            // for window-rollover coverage controls the row's timestamp.
            createdAt: new Date(Date.now()),
          });
        }
        return undefined;
      },
      onConflictDoNothing: async () => undefined,
    };
  },
  delete(table: unknown) {
    return {
      where: async (pred: { __lt?: { col: string; val: Date } }) => {
        if (
          table === (emailResendAttemptsTable as unknown) &&
          pred.__lt?.col === "emailResendAttempts.createdAt"
        ) {
          const cutoff = (pred.__lt.val as Date).getTime();
          state.resendAttempts = state.resendAttempts.filter(
            (a) => a.createdAt.getTime() >= cutoff,
          );
        }
        return undefined;
      },
    };
  },
  select(_cols?: unknown) {
    let _from: unknown;
    let _where: { __eq?: { col: string; val: unknown } } = {};
    const chain = {
      from(t: unknown) {
        _from = t;
        return chain;
      },
      where(pred: { __eq?: { col: string; val: unknown } }) {
        _where = pred;
        return chain;
      },
      async orderBy(..._args: unknown[]) {
        if (_from === (emailResendAttemptsTable as unknown)) {
          const k = _where.__eq?.col === "emailResendAttempts.key" ? _where.__eq.val : undefined;
          const rows = state.resendAttempts.filter((a) => a.key === k);
          return rows.map((a) => ({ id: a.id }));
        }
        return [];
      },
    };
    return chain;
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable,
    emailResendAttemptsTable,
    userReportsTable: {
      id: {}, status: {}, createdAt: {}, reportedUserId: {}, contentType: {},
    },
    blockedUsersTable: { blockerId: {}, blockedId: {}, createdAt: {} },
    moderationAuditLogTable: { id: {}, actorId: {}, action: {}, targetPlayerId: {}, targetReportId: {}, reason: {}, metadata: {}, createdAt: {} },
    notificationsTable: { id: {}, playerId: {}, type: {}, createdAt: {} },
    bouncedEmailsTable: { id: {}, email: {} },
  },
});

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;
let consumeEmailResendBudget: (
  req: { playerId?: number; ip?: string },
) => Promise<boolean>;

before(async () => {
  const express = (await import("express")).default;
  const safetyRouter = (await import("../safety.ts")).default;
  ({ consumeEmailResendBudget } = await import("../../middlewares/rateLimiters.ts"));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request).log = {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    } as never;
    next();
  });
  app.use(safetyRouter);
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
  resetState();
});

function seedPlayer(over: Partial<PlayerRow> & { id: number; clerkId: string }): PlayerRow {
  const row: PlayerRow = {
    username: `u${over.id}`,
    displayName: null,
    email: null,
    emailVerifiedAt: null,
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
    isAdmin: false,
    isMinor: false,
    isSuspended: false,
    locationVisibility: "city",
    requireWorkoutApproval: false,
    emergencyContactName: null,
    emergencyContactPhone: null,
    isVerified: false,
    weeklyRecapEnabled: true,
    weeklyRecapDayOfWeek: 1,
    weeklyRecapHourLocal: 9,
    weeklyRecapTzOffsetMinutes: 0,
    weeklyRecapTimezone: null,
    notifyRecapEmail: true,
    notifyChampionEmail: true,
    notifyRecapPush: true,
    ...over,
  };
  state.players.push(row);
  return row;
}

async function resendVerification() {
  const res = await fetch(`${baseUrl}/email/resend-verification`, { method: "POST" });
  const parsed = (await res.json().catch(() => null)) as Record<string, any> | null;
  return { status: res.status, body: parsed as any };
}

async function patchPrivacy(playerId: number, body: unknown) {
  const res = await fetch(`${baseUrl}/players/${playerId}/privacy-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as Record<string, any> | null;
  return { status: res.status, body: parsed as any };
}

// ── 1. Unit tests: consumeEmailResendBudget ──────────────────────────────────
describe("consumeEmailResendBudget", () => {
  it("allows the first 3 calls and denies the 4th in the same window", async () => {
    const req = { playerId: 9001 };
    assert.equal(await consumeEmailResendBudget(req), true, "1st call allowed");
    assert.equal(await consumeEmailResendBudget(req), true, "2nd call allowed");
    assert.equal(await consumeEmailResendBudget(req), true, "3rd call allowed");
    assert.equal(await consumeEmailResendBudget(req), false, "4th call denied");
    assert.equal(await consumeEmailResendBudget(req), false, "5th call also denied");
  });

  it("scopes the budget per player (one player's cap does not affect another)", async () => {
    const a = { playerId: 9101 };
    const b = { playerId: 9102 };
    assert.equal(await consumeEmailResendBudget(a), true);
    assert.equal(await consumeEmailResendBudget(a), true);
    assert.equal(await consumeEmailResendBudget(a), true);
    assert.equal(await consumeEmailResendBudget(a), false);
    // Player B should still have a full budget.
    assert.equal(await consumeEmailResendBudget(b), true);
    assert.equal(await consumeEmailResendBudget(b), true);
    assert.equal(await consumeEmailResendBudget(b), true);
    assert.equal(await consumeEmailResendBudget(b), false);
  });

  it("re-allows after the 1-hour window rolls over", async () => {
    const realNow = Date.now;
    const t0 = 1_750_000_000_000;
    let now = t0;
    Date.now = () => now;
    try {
      const req = { playerId: 9201 };
      assert.equal(await consumeEmailResendBudget(req), true);
      assert.equal(await consumeEmailResendBudget(req), true);
      assert.equal(await consumeEmailResendBudget(req), true);
      assert.equal(await consumeEmailResendBudget(req), false, "blocked inside the window");

      // Jump forward just past the 1-hour window. The opportunistic GC inside
      // consumeEmailResendBudget will prune the now-expired attempts and let
      // the next 3 through.
      now = t0 + 60 * 60 * 1000 + 1;
      assert.equal(await consumeEmailResendBudget(req), true, "1st call in new window allowed");
      assert.equal(await consumeEmailResendBudget(req), true);
      assert.equal(await consumeEmailResendBudget(req), true);
      assert.equal(await consumeEmailResendBudget(req), false, "cap re-applies in new window");
    } finally {
      Date.now = realNow;
    }
  });

  it("falls back to the IP key when no playerId is set", async () => {
    const req = { ip: "203.0.113.7" };
    assert.equal(await consumeEmailResendBudget(req), true);
    assert.equal(await consumeEmailResendBudget(req), true);
    assert.equal(await consumeEmailResendBudget(req), true);
    assert.equal(await consumeEmailResendBudget(req), false);
    // A different IP should still have a fresh budget.
    assert.equal(await consumeEmailResendBudget({ ip: "203.0.113.8" }), true);
  });
});

// ── 2. Integration: POST /api/email/resend-verification 4× → 4th is 429 ──────
describe("POST /email/resend-verification rate limit", () => {
  it("returns 429 with too_many_email_resends body on the 4th call within an hour", async () => {
    // Unique clerkId + playerId so we don't collide with other integration
    // tests using the same attempts table within this process.
    state.callerClerkId = "u_resend_429";
    seedPlayer({
      id: 7001,
      clerkId: "u_resend_429",
      email: "rl@example.com",
      emailVerifiedAt: null,
      displayName: "RL",
    });

    const r1 = await resendVerification();
    const r2 = await resendVerification();
    const r3 = await resendVerification();
    const r4 = await resendVerification();

    assert.equal(r1.status, 200, "1st send succeeds");
    assert.equal(r2.status, 200, "2nd send succeeds");
    assert.equal(r3.status, 200, "3rd send succeeds");
    assert.deepEqual(r1.body, { alreadyVerified: false, sent: true });
    assert.deepEqual(r2.body, { alreadyVerified: false, sent: true });
    assert.deepEqual(r3.body, { alreadyVerified: false, sent: true });

    assert.equal(r4.status, 429, "4th send is rate-limited");
    assert.equal(r4.body.error, "too_many_email_resends");
    assert.equal(
      r4.body.message,
      "You can only send 3 confirmation emails per hour. Please try again later.",
    );

    // Exactly three issueEmailVerification calls — the 4th request never
    // reaches the route handler.
    assert.equal(state.issueCalls.length, 3, "no issue call for the throttled request");
  });
});

// ── 3. Integration: PATCH /privacy-settings shares the resend budget ─────────
describe("PATCH /privacy-settings shares the email resend budget", () => {
  it("saves the row but reports emailVerificationRateLimited=true after 3 prior POST sends", async () => {
    // Unique playerId so the process-shared attempts table starts empty for
    // this key.
    state.callerClerkId = "u_patch_rl";
    seedPlayer({
      id: 7101,
      clerkId: "u_patch_rl",
      email: "old@example.com",
      emailVerifiedAt: null,
      displayName: "PRL",
    });

    // Drain the per-player budget via 3 real POST /email/resend-verification
    // calls — this verifies POST and PATCH actually share one bucket. If they
    // didn't, the PATCH below would succeed with a fresh send.
    const r1 = await resendVerification();
    const r2 = await resendVerification();
    const r3 = await resendVerification();
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);
    assert.equal(state.issueCalls.length, 3, "3 sends ran via POST");

    const { status, body } = await patchPrivacy(7101, { email: "fresh@example.com" });

    assert.equal(status, 200, "the PATCH still succeeds");
    assert.equal(body.email, "fresh@example.com", "the new address is persisted");
    assert.equal(body.emailVerificationRateLimited, true);
    assert.equal(body.emailVerificationSent, false);

    const stored = state.players.find((p) => p.id === 7101)!;
    assert.equal(stored.email, "fresh@example.com", "DB row reflects the new address");
    assert.equal(stored.emailVerifiedAt, null, "verified flag is cleared on email change");

    // No additional issue call — the implicit PATCH send was throttled.
    assert.equal(state.issueCalls.length, 3, "no extra email send was attempted");
  });
});
