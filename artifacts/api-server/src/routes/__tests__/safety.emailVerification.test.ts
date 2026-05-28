// Endpoint tests for the email confirmation flow on the safety router:
//
//   - PATCH /players/:id/privacy-settings clears the verified flag and triggers
//     a verification email when the address changes, but is a no-op when the
//     same address is resubmitted.
//   - GET /email/verify redirects to /settings/privacy with the right
//     emailVerify=... status for valid / expired / invalid / missing tokens
//     and only marks the row verified on the happy path.
//   - POST /email/resend-verification returns alreadyVerified=true for
//     already-verified players and 400 no_email_on_file when no address
//     is stored, without invoking issueEmailVerification.
//
// The DB, Clerk auth, attachPlayer middleware, and issueEmailVerification
// service are mocked via node:test module mocks so the routes run in
// isolation.

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

const state = {
  callerClerkId: "u_caller",
  players: [] as PlayerRow[],
  issueCalls: [] as IssueCall[],
  issueResult: "sent" as "sent" | "skipped_unconfigured" | "skipped_failed" | "bouncing",
  issueThrows: false,
};

function resetState() {
  state.callerClerkId = "u_caller";
  state.players = [];
  state.issueCalls = [];
  state.issueResult = "sent";
  state.issueThrows = false;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
const col = (name: string) => ({ __col: name }) as const;

const playersTable = {
  id: col("players.id"),
  clerkId: col("players.clerkId"),
  emailVerificationToken: col("players.emailVerificationToken"),
};

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __col: string }, val: unknown) => ({ [c.__col]: val }),
    and: (...parts: Record<string, unknown>[]) => Object.assign({}, ...parts),
    or: (...parts: Record<string, unknown>[]) => ({ __or: parts }),
    desc: () => ({}),
    lt: () => ({}),
    notInArray: () => ({}),
    inArray: () => ({}),
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
    ): Promise<typeof state.issueResult> => {
      state.issueCalls.push({ playerId, email, displayName });
      if (state.issueThrows) throw new Error("boom");
      return state.issueResult;
    },
  },
});

// Minimal fake DB. Supports:
//   db.query.playersTable.findFirst({ where: <predicate> })
//     where predicate is keyed by one of "players.id" or
//     "players.emailVerificationToken".
//   db.update(playersTable).set(values).where(predicate)               // no returning()
//   db.update(playersTable).set(values).where(predicate).returning()  // .returning() chain
//
// Other safety routes also call userReportsTable / blockedUsersTable inside
// imports — we expose stubbed table objects so the router module loads, but
// the tests below only exercise rows in playersTable.
const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const w = args.where;
        if ("players.id" in w) {
          return state.players.find((p) => p.id === w["players.id"]);
        }
        if ("players.emailVerificationToken" in w) {
          return state.players.find(
            (p) => p.emailVerificationToken === w["players.emailVerificationToken"],
          );
        }
        return undefined;
      },
    },
  },
  update(_table: unknown) {
    let setValues: Partial<PlayerRow> = {};
    let wherePred: Record<string, unknown> = {};
    const apply = (): PlayerRow | undefined => {
      const id = wherePred["players.id"] as number | undefined;
      if (id == null) return undefined;
      const idx = state.players.findIndex((p) => p.id === id);
      if (idx === -1) return undefined;
      state.players[idx] = { ...state.players[idx]!, ...setValues };
      return state.players[idx];
    };
    const chain = {
      set(values: Partial<PlayerRow>) {
        setValues = values;
        return chain;
      },
      where(pred: Record<string, unknown>) {
        wherePred = pred;
        // Mimic drizzle: awaiting .where() runs the update when there's no
        // .returning(). Returning the chain (which is then-able through
        // .returning) is fine because the route either awaits .where() OR
        // chains .returning(); never both.
        apply();
        return chain;
      },
      async returning(_cols?: unknown) {
        const updated = apply();
        return updated ? [updated] : [];
      },
      // Allow `await db.update(...).set(...).where(...)` to resolve.
      then(resolve: (v: unknown) => void) {
        resolve(undefined);
      },
    };
    return chain;
  },
  insert(_table: unknown) {
    return {
      values: async () => undefined,
      onConflictDoNothing: async () => undefined,
    };
  },
  delete(_table: unknown) {
    return { where: async () => undefined };
  },
  select() {
    return {
      from: () => ({
        where: () => ({ orderBy: async () => [] }),
        orderBy: async () => [],
      }),
    };
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable,
    userReportsTable: {
      id: {}, status: {}, createdAt: {}, reportedUserId: {}, contentType: {},
    },
    blockedUsersTable: { blockerId: {}, blockedId: {}, createdAt: {} },
    moderationAuditLogTable: { id: {}, actorId: {}, action: {}, targetPlayerId: {}, targetReportId: {}, reason: {}, metadata: {}, createdAt: {} },
    accountAppealsTable: { id: {}, playerId: {}, status: {}, reason: {}, decision: {}, decidedByAdminId: {}, decidedAt: {}, createdAt: {} },
    notificationsTable: { id: {}, playerId: {}, type: {}, title: {}, body: {}, link: {}, sourceId: {}, createdAt: {} },
    bouncedEmailsTable: { id: {}, email: {} },
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
  },
});

// Stub the bounce-list helpers so the patch / resend routes don't try to
// hit the (mocked-out) DB through unconfigured query paths. These tests
// cover the non-bouncing happy path; dedicated coverage for bounce-blocked
// behavior lives in `bouncedEmails.test.ts`.
mock.module("../../services/bouncedEmails.ts", {
  namedExports: {
    isEmailBouncing: async () => false,
    recordEmailBounce: async () => false,
    clearEmailBounce: async () => false,
    normalizeEmail: (s: string) => s.trim().toLowerCase(),
  },
});

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const express = (await import("express")).default;
  const safetyRouter = (await import("../safety.ts")).default;
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

async function patchPrivacy(playerId: number, body: unknown) {
  const res = await fetch(`${baseUrl}/players/${playerId}/privacy-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as Record<string, any> | null;
  return { status: res.status, body: parsed as any };
}

async function getVerify(token: string | undefined) {
  const url = token === undefined
    ? `${baseUrl}/email/verify`
    : `${baseUrl}/email/verify?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

async function resendVerification() {
  const res = await fetch(`${baseUrl}/email/resend-verification`, { method: "POST" });
  const parsed = (await res.json().catch(() => null)) as Record<string, any> | null;
  return { status: res.status, body: parsed as any };
}

// ── PATCH /players/:id/privacy-settings ──────────────────────────────────────
describe("PATCH /players/:id/privacy-settings email handling", () => {
  it("issues a verification + clears emailVerifiedAt when the email changes", async () => {
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      displayName: "Player One",
      email: "old@example.com",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      emailVerificationToken: "stale-token",
      emailVerificationExpiresAt: new Date("2026-01-02T00:00:00Z"),
    });

    const { status, body } = await patchPrivacy(1, { email: "NEW@Example.com" });

    assert.equal(status, 200);
    assert.equal(body.email, "new@example.com", "email is normalized to lowercase");
    assert.equal(body.emailVerifiedAt, null);
    assert.equal(body.emailVerificationSent, true);

    const stored = state.players.find((p) => p.id === 1)!;
    assert.equal(stored.email, "new@example.com");
    assert.equal(stored.emailVerifiedAt, null, "previous verified flag is cleared");

    assert.equal(state.issueCalls.length, 1);
    assert.deepEqual(state.issueCalls[0], {
      playerId: 1,
      email: "new@example.com",
      displayName: "Player One",
    });
  });

  it("does NOT clear verification or send email when the same address is resubmitted", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    seedPlayer({
      id: 2,
      clerkId: "u_caller",
      email: "same@example.com",
      emailVerifiedAt: verifiedAt,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    });

    const { status, body } = await patchPrivacy(2, { email: "  SAME@example.com  " });

    assert.equal(status, 200);
    assert.equal(body.email, "same@example.com");
    assert.equal(body.emailVerifiedAt, verifiedAt.toISOString());
    assert.equal(body.emailVerificationSent, false);

    const stored = state.players.find((p) => p.id === 2)!;
    assert.equal(stored.emailVerifiedAt?.toISOString(), verifiedAt.toISOString());
    assert.equal(state.issueCalls.length, 0);
  });

  it("swallows issueEmailVerification errors and still returns the patched row", async () => {
    seedPlayer({
      id: 3,
      clerkId: "u_caller",
      email: null,
      displayName: null,
      username: "three",
    });
    state.issueThrows = true;

    const { status, body } = await patchPrivacy(3, { email: "fresh@example.com" });

    assert.equal(status, 200);
    assert.equal(body.email, "fresh@example.com");
    assert.equal(body.emailVerificationSent, false);
    assert.equal(state.issueCalls.length, 1);
    assert.equal(state.issueCalls[0]!.displayName, "three", "falls back to username when no displayName");
  });
});

// ── GET /email/verify ────────────────────────────────────────────────────────
describe("GET /email/verify", () => {
  it("marks the player verified and clears the token on a valid token", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      email: "valid@example.com",
      emailVerificationToken: "good-token",
      emailVerificationExpiresAt: future,
    });

    const { status, location } = await getVerify("good-token");

    assert.equal(status, 302);
    assert.equal(location, "/settings/privacy?emailVerify=ok");

    const stored = state.players.find((p) => p.id === 1)!;
    assert.ok(stored.emailVerifiedAt instanceof Date, "emailVerifiedAt is set");
    assert.equal(stored.emailVerificationToken, null);
    assert.equal(stored.emailVerificationExpiresAt, null);
  });

  it("redirects with emailVerify=expired when the token has expired (no mutation)", async () => {
    const past = new Date(Date.now() - 60 * 1000);
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      email: "exp@example.com",
      emailVerificationToken: "expired-token",
      emailVerificationExpiresAt: past,
    });

    const { status, location } = await getVerify("expired-token");

    assert.equal(status, 302);
    assert.equal(location, "/settings/privacy?emailVerify=expired");

    const stored = state.players.find((p) => p.id === 1)!;
    assert.equal(stored.emailVerifiedAt, null);
    assert.equal(stored.emailVerificationToken, "expired-token", "token is left intact for diagnostics");
  });

  it("redirects with emailVerify=invalid when the token does not match any player", async () => {
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      email: "x@example.com",
      emailVerificationToken: "real-token",
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
    });

    const { status, location } = await getVerify("nope");

    assert.equal(status, 302);
    assert.equal(location, "/settings/privacy?emailVerify=invalid");
    assert.equal(state.players[0]!.emailVerifiedAt, null);
  });

  it("redirects with emailVerify=missing when no token query param is provided", async () => {
    const { status, location } = await getVerify(undefined);
    assert.equal(status, 302);
    assert.equal(location, "/settings/privacy?emailVerify=missing");
  });

  it("treats an empty token query param as missing", async () => {
    const { status, location } = await getVerify("");
    assert.equal(status, 302);
    assert.equal(location, "/settings/privacy?emailVerify=missing");
  });
});

// ── POST /email/resend-verification ──────────────────────────────────────────
describe("POST /email/resend-verification", () => {
  it("returns alreadyVerified=true (and does not send) for verified players", async () => {
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      email: "v@example.com",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const { status, body } = await resendVerification();
    assert.equal(status, 200);
    assert.deepEqual(body, { alreadyVerified: true, sent: false });
    assert.equal(state.issueCalls.length, 0);
  });

  it("returns 400 no_email_on_file when the player has no email", async () => {
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      email: null,
    });

    const { status, body } = await resendVerification();
    assert.equal(status, 400);
    assert.equal(body.error, "no_email_on_file");
    assert.equal(state.issueCalls.length, 0);
  });

  it("issues a fresh verification when the player has an unverified email", async () => {
    seedPlayer({
      id: 1,
      clerkId: "u_caller",
      email: "unv@example.com",
      emailVerifiedAt: null,
      displayName: "Unv",
    });

    const { status, body } = await resendVerification();
    assert.equal(status, 200);
    assert.deepEqual(body, { alreadyVerified: false, sent: true });
    assert.equal(state.issueCalls.length, 1);
    assert.deepEqual(state.issueCalls[0], {
      playerId: 1,
      email: "unv@example.com",
      displayName: "Unv",
    });
  });
});
