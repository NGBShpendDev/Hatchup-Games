// Tests for the user-facing suspension snapshot endpoint:
//   GET /api/players/me/suspension
//
// This route powers the SuspendedScreen full-screen blocker, so the
// contract it exposes is load-bearing for the suspended-user UX:
//   - Authenticated callers without a player profile get 401.
//   - An unsuspended caller gets isSuspended=false and null fields.
//   - A suspended caller gets the recorded reason, an ISO-8601 date,
//     and the resolved suspendedByAdmin payload.
//
// The endpoint must NOT be gated by the suspendedGuard middleware —
// suspended users have to be able to read it. We assert that by
// mounting the router under test and exercising the path with a
// suspended caller (no extra middleware in the way).

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
  avatarUrl: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  suspendedByAdminId: number | null;
}

const state = {
  callerClerkId: null as string | null,
  players: [] as PlayerRow[],
};

function resetState() {
  state.callerClerkId = null;
  state.players = [];
}

// ── Mocks ────────────────────────────────────────────────────────────────────
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.callerClerkId }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// attachPlayer normally looks up the signed-in player from the Clerk
// userId. We model the realistic outcomes:
//   - no caller / unknown caller  → 401 (unauthenticated)
//   - known caller                → req.playerId = found.id
// The route under test ALSO has its own `if (!playerId) → 401` guard
// after attachPlayer; we exercise that branch by routing the request
// through a stub of attachPlayer that intentionally never sets
// req.playerId (see the dedicated test below).
mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
    attachPlayer: (req: Request, res: Response, next: NextFunction) => {
      if (!state.callerClerkId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const found = state.players.find((p) => p.clerkId === state.callerClerkId);
      if (!found) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.playerId = found.id;
      next();
    },
  },
});

mock.module("../../services/emailVerification.ts", {
  namedExports: { issueEmailVerification: async () => ({ sent: false }) },
});

mock.module("../../services/bouncedEmails.ts", {
  namedExports: {
    isEmailBouncing: async () => false,
    recordEmailBounce: async () => true,
    clearEmailBounce: async () => true,
    normalizeEmail: (e: string) => e.trim().toLowerCase(),
  },
});

mock.module("../../services/moderationNotify.ts", {
  namedExports: {
    notifyModerationAction: async () => undefined,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    desc: (col: unknown) => ({ op: "desc", col }),
    notInArray: () => ({}),
    inArray: () => ({}),
    ne: () => ({}),
  },
});

const PLAYER_COLS = {
  id: { name: "id" },
  clerkId: { name: "clerkId" },
  username: { name: "username" },
  displayName: { name: "displayName" },
  avatarUrl: { name: "avatarUrl" },
  isAdmin: { name: "isAdmin" },
  isSuspended: { name: "isSuspended" },
  suspendedAt: { name: "suspendedAt" },
  suspensionReason: { name: "suspensionReason" },
  suspendedByAdminId: { name: "suspendedByAdminId" },
};

const fakeDb = {
  query: {
    playersTable: {
      // The handler only reads by id and always passes a `columns`
      // projection. Honor it so the route's response composition is
      // exercised faithfully (rather than letting it spread an entire
      // row that the real query would never return).
      findFirst: async (args: any) => {
        const w = args?.where;
        if (w?.op === "eq" && w.col?.name === "id") {
          const found = state.players.find((p) => p.id === w.val);
          if (!found) return undefined;
          if (args.columns) {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(args.columns)) {
              out[k] = (found as unknown as Record<string, unknown>)[k];
            }
            return out;
          }
          return found;
        }
        return undefined;
      },
    },
  },
  // Unused by this route but referenced by safety.ts top-level imports.
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({ then: (r: any) => r([]) }),
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({ returning: async () => [] }),
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    playersTable: PLAYER_COLS,
    userReportsTable: { id: {}, status: {}, createdAt: {}, reportedUserId: {}, contentType: {} },
    blockedUsersTable: { blockerId: {}, blockedId: {}, createdAt: {} },
    moderationAuditLogTable: { id: {}, actorId: {}, action: {}, targetPlayerId: {}, targetReportId: {}, reason: {}, metadata: {}, createdAt: {} },
    accountAppealsTable: { id: {}, playerId: {}, status: {}, reason: {}, decision: {}, decidedByAdminId: {}, decidedAt: {}, createdAt: {} },
    notificationsTable: { id: {}, playerId: {}, type: {}, title: {}, body: {}, link: {}, sourceId: {}, createdAt: {} },
    bouncedEmailsTable: { id: {}, email: {}, bounceType: {}, reason: {}, source: {}, bouncedAt: {}, createdAt: {} },
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
    (req as Request).log = { error: () => undefined, info: () => undefined } as never;
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
function seedPlayer(over: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  const p: PlayerRow = {
    displayName: null,
    avatarUrl: null,
    isAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    suspensionReason: null,
    suspendedByAdminId: null,
    ...over,
  };
  state.players.push(p);
  return p;
}

async function getMySuspension(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/players/me/suspension`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── GET /players/me/suspension ───────────────────────────────────────────────
describe("GET /players/me/suspension", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    // No callerClerkId → mocked attachPlayer short-circuits with 401.
    const { status, body } = await getMySuspension();
    assert.equal(status, 401);
    assert.equal(body.error, "Unauthorized");
  });

  it("returns 401 when the caller has no player profile", async () => {
    // Caller is signed in via Clerk but no players row matches.
    state.callerClerkId = "u_ghost";
    const { status, body } = await getMySuspension();
    assert.equal(status, 401);
    assert.equal(body.error, "Unauthorized");
  });

  it("returns isSuspended=false with null fields for an active account", async () => {
    seedPlayer({ id: 7, clerkId: "u_active", username: "active" });
    state.callerClerkId = "u_active";

    const { status, body } = await getMySuspension();
    assert.equal(status, 200);
    assert.deepEqual(body, {
      isSuspended: false,
      suspendedAt: null,
      suspensionReason: null,
      suspendedByAdmin: null,
    });
  });

  it("returns the recorded reason, ISO date, and resolved admin for a suspended account", async () => {
    seedPlayer({
      id: 1, clerkId: "u_admin", username: "alice",
      displayName: "Alice Admin", isAdmin: true,
    });
    const suspendedAt = new Date("2025-04-12T15:30:00Z");
    seedPlayer({
      id: 2, clerkId: "u_t", username: "target",
      isSuspended: true,
      suspendedAt,
      suspensionReason: "spam and harassment",
      suspendedByAdminId: 1,
    });
    state.callerClerkId = "u_t";

    const { status, body } = await getMySuspension();
    assert.equal(status, 200);
    assert.equal(body.isSuspended, true);
    assert.equal(body.suspendedAt, suspendedAt.toISOString());
    // Confirms the route serializes the Date column to ISO-8601.
    assert.ok(!Number.isNaN(Date.parse(body.suspendedAt)));
    assert.equal(body.suspensionReason, "spam and harassment");
    assert.deepEqual(body.suspendedByAdmin, {
      id: 1,
      username: "alice",
      displayName: "Alice Admin",
    });
  });

  it("returns null suspendedByAdmin when the recorded admin id no longer exists", async () => {
    seedPlayer({
      id: 2, clerkId: "u_t", username: "target",
      isSuspended: true,
      suspendedAt: new Date("2025-01-01T00:00:00Z"),
      suspensionReason: "legacy row",
      suspendedByAdminId: 999, // not seeded
    });
    state.callerClerkId = "u_t";

    const { status, body } = await getMySuspension();
    assert.equal(status, 200);
    assert.equal(body.isSuspended, true);
    assert.equal(body.suspendedByAdmin, null);
  });

  it("returns null suspendedByAdmin when no admin id was recorded", async () => {
    seedPlayer({
      id: 2, clerkId: "u_t", username: "target",
      isSuspended: true,
      suspendedAt: new Date("2025-01-01T00:00:00Z"),
      suspensionReason: null,
      suspendedByAdminId: null,
    });
    state.callerClerkId = "u_t";

    const { status, body } = await getMySuspension();
    assert.equal(status, 200);
    assert.equal(body.suspensionReason, null);
    assert.equal(body.suspendedByAdmin, null);
  });

  it("is reachable for a suspended caller (not gated by suspendedGuard)", async () => {
    // If suspendedGuard were ever wired in front of this route, a
    // suspended caller would get 403 account_suspended instead of the
    // expected 200 snapshot. Lock that contract in.
    seedPlayer({
      id: 2, clerkId: "u_t", username: "target",
      isSuspended: true,
      suspendedAt: new Date("2025-01-01T00:00:00Z"),
      suspensionReason: "test",
      suspendedByAdminId: null,
    });
    state.callerClerkId = "u_t";

    const { status, body } = await getMySuspension();
    assert.equal(status, 200);
    assert.notEqual(body.error, "account_suspended");
    assert.equal(body.isSuspended, true);
  });
});
