// Tests for the rest of the suspend / unsuspend admin flow:
//   - GET  /admin/players/suspended         (admin-only listing)
//   - PATCH /admin/players/:id/suspend      (suspendedAt stamping behavior)
//   - blockSuspendedSocialWrite middleware  (denies suspended writers,
//                                            allows them through once
//                                            unsuspension clears the flag)
//
// The existing safety.suspend.test.ts already covers the auth/validation
// surface of the PATCH route. This file focuses on the data-shape guarantees
// (suspendedAt set on suspend, cleared on unsuspend, list order/admin gate)
// and on the middleware that enforces suspension at the write boundary.

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
  suspensionReason?: string | null;
  suspendedByAdminId?: number | null;
}

const state = {
  callerClerkId: "u_admin",
  players: [] as PlayerRow[],
};

function resetState() {
  state.callerClerkId = "u_admin";
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

// Tag predicates so we can pattern-match them in the fake DB.
mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    desc: (col: unknown) => ({ op: "desc", col }),
    notInArray: () => ({}),
    inArray: (col: unknown, vals: unknown[]) => ({ op: "inArray", col, vals }),
  },
});

// Sentinel column objects — predicates carry these as `col` so the fake DB
// can tell "id == N" apart from "isSuspended == true".
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
      findFirst: async (args: any) => {
        const w = args?.where;
        // suspendedGuard only reads by id; route handlers do the same.
        if (w?.op === "eq" && w.col?.name === "id") {
          const found = state.players.find((p) => p.id === w.val);
          if (!found) return undefined;
          // Honor `columns` projection when caller asked for it (the guard does).
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
  select(projection?: Record<string, unknown>) {
    let whereVal: any = null;
    let orderCol: any = null;
    const chain = {
      from(_table: unknown) {
        return chain;
      },
      where(pred: any) {
        whereVal = pred;
        return chain;
      },
      orderBy(o: any) {
        orderCol = o;
        return chain;
      },
      then(resolve: (rows: unknown[]) => void) {
        // Models two query shapes:
        //   1. suspended-list: where isSuspended === true, ordered by suspendedAt desc
        //   2. admin lookup: where id IN (adminIds)
        let rows = state.players.filter((p) => {
          if (whereVal?.op === "eq" && whereVal.col?.name === "isSuspended") {
            return p.isSuspended === whereVal.val;
          }
          if (whereVal?.op === "inArray" && whereVal.col?.name === "id") {
            return (whereVal.vals as number[]).includes(p.id);
          }
          return true;
        });
        if (orderCol?.op === "desc" && orderCol.col?.name === "suspendedAt") {
          rows = [...rows].sort((a, b) => {
            const at = a.suspendedAt ? a.suspendedAt.getTime() : 0;
            const bt = b.suspendedAt ? b.suspendedAt.getTime() : 0;
            return bt - at;
          });
        }
        const projected = projection
          ? rows.map((r) => {
              const out: Record<string, unknown> = {};
              for (const key of Object.keys(projection)) {
                out[key] = (r as unknown as Record<string, unknown>)[key];
              }
              return out;
            })
          : rows;
        resolve(projected);
      },
    };
    return chain;
  },
  update(_table: unknown) {
    let setValues: Partial<PlayerRow> = {};
    let whereId: number | null = null;
    const chain = {
      set(values: Partial<PlayerRow>) {
        setValues = values;
        return chain;
      },
      where(pred: any) {
        whereId = pred?.val ?? null;
        return chain;
      },
      async returning(_cols: unknown) {
        const idx = state.players.findIndex((p) => p.id === whereId);
        if (idx === -1) return [];
        state.players[idx] = { ...state.players[idx], ...setValues };
        const p = state.players[idx];
        return [
          {
            id: p.id,
            username: p.username,
            isSuspended: p.isSuspended,
            suspendedAt: p.suspendedAt,
          },
        ];
      },
    };
    return chain;
  },
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    playersTable: PLAYER_COLS,
    userReportsTable: { id: {}, status: {}, createdAt: {}, reportedUserId: {}, contentType: {} },
    blockedUsersTable: { blockerId: {}, blockedId: {}, createdAt: {} },
    moderationAuditLogTable: { id: {}, actorId: {}, action: {}, targetPlayerId: {}, targetReportId: {}, reason: {}, metadata: {}, createdAt: {} },
    accountAppealsTable: { id: {}, playerId: {}, status: {}, reason: {}, decision: {}, decidedByAdminId: {}, decidedAt: {}, createdAt: {} },
    notificationsTable: { id: {}, playerId: {}, type: {}, title: {}, body: {}, link: {}, sourceId: {}, createdAt: {} },
  },
});

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;
let blockSuspendedSocialWrite: (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

before(async () => {
  const express = (await import("express")).default;
  const safetyRouter = (await import("../safety.ts")).default;
  ({ blockSuspendedSocialWrite } = await import("../../middlewares/suspendedGuard.ts"));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request).log = { error: () => undefined, info: () => undefined } as never;
    next();
  });
  app.use(safetyRouter);

  // Tiny test-only route used to exercise the suspendedGuard middleware in
  // isolation. We hand the middleware a req.playerId by reading the caller
  // from state (same convention as the mocked attachPlayer above).
  app.post(
    "/__test/social-write",
    (req: Request, res: Response, next: NextFunction) => {
      const found = state.players.find((p) => p.clerkId === state.callerClerkId);
      if (!found) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.playerId = found.id;
      next();
    },
    blockSuspendedSocialWrite,
    (_req, res) => {
      res.json({ ok: true });
    },
  );

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
function seedAdmin(over: Partial<PlayerRow> = {}): PlayerRow {
  const admin: PlayerRow = {
    id: 1,
    clerkId: "u_admin",
    username: "admin",
    displayName: "Admin",
    avatarUrl: null,
    isAdmin: true,
    isSuspended: false,
    suspendedAt: null,
    ...over,
  };
  state.players.push(admin);
  return admin;
}

function seedPlayer(over: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  const p: PlayerRow = {
    displayName: null,
    avatarUrl: null,
    isAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    ...over,
  };
  state.players.push(p);
  return p;
}

async function getSuspendedList(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/admin/players/suspended`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function suspend(targetId: number, isSuspended: boolean): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/admin/players/${targetId}/suspend`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isSuspended }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function callGuardedWrite(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/__test/social-write`, { method: "POST" });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── GET /admin/players/suspended ─────────────────────────────────────────────
describe("GET /admin/players/suspended", () => {
  it("returns 403 when the caller is not an admin", async () => {
    seedAdmin({ isAdmin: false });
    seedPlayer({ id: 2, clerkId: "u_a", username: "a", isSuspended: true, suspendedAt: new Date() });
    const { status, body } = await getSuspendedList();
    assert.equal(status, 403);
    assert.equal(body.error, "Admin access required");
  });

  it("returns only suspended players, ordered by suspendedAt desc", async () => {
    seedAdmin();
    // Mix of suspended and active accounts with varied suspendedAt timestamps.
    seedPlayer({
      id: 2, clerkId: "u_a", username: "alpha",
      isSuspended: true, suspendedAt: new Date("2025-01-01T00:00:00Z"),
    });
    seedPlayer({
      id: 3, clerkId: "u_b", username: "bravo",
      isSuspended: true, suspendedAt: new Date("2025-06-01T00:00:00Z"),
    });
    seedPlayer({
      id: 4, clerkId: "u_c", username: "charlie",
      isSuspended: false, suspendedAt: null,
    });
    seedPlayer({
      id: 5, clerkId: "u_d", username: "delta",
      isSuspended: true, suspendedAt: new Date("2025-03-15T00:00:00Z"),
    });

    const { status, body } = await getSuspendedList();
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.deepEqual(
      body.map((r: any) => r.username),
      ["bravo", "delta", "alpha"],
    );
    // Active player is excluded.
    assert.equal(body.find((r: any) => r.username === "charlie"), undefined);
    // Timestamps are serialized as ISO strings.
    for (const row of body) {
      assert.equal(typeof row.suspendedAt, "string");
      assert.ok(!Number.isNaN(Date.parse(row.suspendedAt)));
    }
  });

  it("includes suspensionReason and resolves the acting admin in suspendedByAdmin", async () => {
    seedAdmin({ id: 1, clerkId: "u_admin", username: "alice", displayName: "Alice Admin" });
    seedPlayer({
      id: 2, clerkId: "u_a", username: "alpha",
      isSuspended: true, suspendedAt: new Date("2025-01-01T00:00:00Z"),
      suspensionReason: "spam and harassment", suspendedByAdminId: 1,
    });
    seedPlayer({
      id: 3, clerkId: "u_b", username: "bravo",
      isSuspended: true, suspendedAt: new Date("2025-02-01T00:00:00Z"),
      // No reason and no actor — legacy row.
      suspensionReason: null, suspendedByAdminId: null,
    });

    const { status, body } = await getSuspendedList();
    assert.equal(status, 200);

    const alpha = body.find((r: any) => r.username === "alpha");
    assert.equal(alpha.suspensionReason, "spam and harassment");
    assert.equal(alpha.suspendedByAdminId, 1);
    assert.deepEqual(alpha.suspendedByAdmin, { id: 1, username: "alice", displayName: "Alice Admin" });

    const bravo = body.find((r: any) => r.username === "bravo");
    assert.equal(bravo.suspensionReason, null);
    assert.equal(bravo.suspendedByAdminId, null);
    assert.equal(bravo.suspendedByAdmin, null);
  });

  it("returns an empty array when no players are suspended", async () => {
    seedAdmin();
    seedPlayer({ id: 2, clerkId: "u_a", username: "alpha" });
    const { status, body } = await getSuspendedList();
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });
});

// ── suspendedAt stamping in PATCH ────────────────────────────────────────────
describe("PATCH /admin/players/:id/suspend — suspendedAt stamping", () => {
  it("stamps suspendedAt when suspending and clears it when unsuspending", async () => {
    seedAdmin();
    seedPlayer({ id: 2, clerkId: "u_t", username: "target" });

    const before = Date.now();
    const suspendRes = await suspend(2, true);
    const after = Date.now();
    assert.equal(suspendRes.status, 200);
    assert.equal(suspendRes.body.player.isSuspended, true);
    const stamped = state.players.find((p) => p.id === 2)!.suspendedAt;
    assert.ok(stamped instanceof Date, "suspendedAt should be a Date after suspending");
    const t = stamped!.getTime();
    assert.ok(t >= before && t <= after, "suspendedAt should be ~now");

    const unsuspendRes = await suspend(2, false);
    assert.equal(unsuspendRes.status, 200);
    assert.equal(unsuspendRes.body.player.isSuspended, false);
    assert.equal(
      state.players.find((p) => p.id === 2)!.suspendedAt,
      null,
      "suspendedAt should be cleared after unsuspending",
    );
  });
});

// ── blockSuspendedSocialWrite middleware ─────────────────────────────────────
describe("blockSuspendedSocialWrite middleware", () => {
  it("rejects suspended accounts with 403 account_suspended", async () => {
    seedPlayer({
      id: 2, clerkId: "u_t", username: "target",
      isSuspended: true, suspendedAt: new Date(),
    });
    state.callerClerkId = "u_t";

    const { status, body } = await callGuardedWrite();
    assert.equal(status, 403);
    assert.equal(body.error, "account_suspended");
    assert.match(body.message, /suspended/i);
  });

  it("allows the same account through again after admin unsuspension", async () => {
    seedAdmin();
    seedPlayer({
      id: 2, clerkId: "u_t", username: "target",
      isSuspended: true, suspendedAt: new Date(),
    });

    // Suspended → blocked.
    state.callerClerkId = "u_t";
    const blocked = await callGuardedWrite();
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, "account_suspended");

    // Admin unsuspends the target.
    state.callerClerkId = "u_admin";
    const unsuspendRes = await suspend(2, false);
    assert.equal(unsuspendRes.status, 200);
    assert.equal(unsuspendRes.body.player.isSuspended, false);

    // Same caller is now allowed through.
    state.callerClerkId = "u_t";
    const allowed = await callGuardedWrite();
    assert.equal(allowed.status, 200);
    assert.deepEqual(allowed.body, { ok: true });
  });

  it("allows non-suspended accounts through", async () => {
    seedPlayer({ id: 2, clerkId: "u_t", username: "target" });
    state.callerClerkId = "u_t";
    const { status, body } = await callGuardedWrite();
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });
  });

  it("returns 401 when no playerId is attached", async () => {
    // No seeded player matching callerClerkId → the test pre-middleware
    // returns 401 before the guard runs. To directly assert the guard's own
    // 401 branch, invoke it without a req.playerId.
    let status = 0;
    let payload: any = null;
    const req = {} as Request;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(b: unknown) {
        payload = b;
        return this;
      },
    } as unknown as Response;
    let nextCalled = false;
    await blockSuspendedSocialWrite(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(status, 401);
    assert.equal(payload.error, "Unauthorized");
  });
});
