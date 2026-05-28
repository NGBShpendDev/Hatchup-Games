// Endpoint tests for PATCH /admin/players/:id/suspend.
//
// Locks down the admin-only suspend toggle:
//   - non-admin callers get 403
//   - admins can suspend and then unsuspend a target player
//   - admins cannot suspend themselves
//   - the body must include a boolean `isSuspended`
//   - unknown target ids → 404
//
// The DB, Clerk auth, and the attachPlayer middleware are mocked via
// `node:test` module mocks so the route runs in isolation.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  isAdmin: boolean;
  isSuspended: boolean;
  suspendedByAdminId?: number | null;
  suspensionReason?: string | null;
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

// Replace the real auth middlewares: requireAuth is a no-op, attachPlayer
// resolves the caller from state by clerkId and writes req.playerId.
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
    issueEmailVerification: async () => ({ sent: false }),
  },
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
    gt: () => ({}),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    ne: () => ({}),
    and: (...args: unknown[]) => ({ op: "and", args }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    desc: () => ({}),
    notInArray: () => ({}),
    inArray: (col: unknown, vals: unknown[]) => ({ op: "inArray", col, vals }),
  },
});

// Minimal fake DB: implements the calls /admin/players/:id/suspend makes:
//   db.query.playersTable.findFirst({ where: eq(playersTable.id, callerId) })
//   db.update(playersTable).set(...).where(...).returning({...})
const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: any) => {
        const v = args?.where?.val;
        return state.players.find((p) => p.id === v);
      },
    },
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
        return [{
          id: p.id,
          username: p.username,
          isSuspended: p.isSuspended,
          suspendedByAdminId: p.suspendedByAdminId ?? null,
          suspensionReason: p.suspensionReason ?? null,
        }];
      },
    };
    return chain;
  },
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    playersTable: { id: {}, clerkId: {}, username: {}, isSuspended: {}, suspendedAt: {}, suspensionReason: {}, suspendedByAdminId: {} },
    userReportsTable: { id: {}, status: {}, createdAt: {}, reportedUserId: {}, contentType: {} },
    blockedUsersTable: { blockerId: {}, blockedId: {}, createdAt: {} },
    moderationAuditLogTable: { id: {}, actorId: {}, action: {}, targetPlayerId: {}, targetReportId: {}, reason: {}, metadata: {}, createdAt: {} },
    notificationsTable: { id: {}, playerId: {}, type: {}, title: {}, body: {}, link: {}, sourceId: {}, createdAt: {} },
    bouncedEmailsTable: { id: {}, email: {}, bounceType: {}, reason: {}, source: {}, bouncedAt: {}, createdAt: {} },
    accountAppealsTable: { id: {}, playerId: {}, status: {}, reason: {}, createdAt: {}, resolvedAt: {} },
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
  // Attach a tiny logger so route handlers that call req.log don't crash.
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
function seedAdmin(over: Partial<PlayerRow> = {}): PlayerRow {
  const admin: PlayerRow = {
    id: 1,
    clerkId: "u_admin",
    username: "admin",
    isAdmin: true,
    isSuspended: false,
    ...over,
  };
  state.players.push(admin);
  return admin;
}

function seedTarget(over: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  const target: PlayerRow = {
    isAdmin: false,
    isSuspended: false,
    ...over,
  };
  state.players.push(target);
  return target;
}

async function suspend(targetId: number, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/admin/players/${targetId}/suspend`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("PATCH /admin/players/:id/suspend", () => {
  it("returns 403 when the caller is not an admin", async () => {
    seedAdmin({ isAdmin: false }); // caller is a regular player
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const { status, body } = await suspend(2, { isSuspended: true });
    assert.equal(status, 403);
    assert.equal(body.error, "Admin access required");
    // Target must not have been mutated.
    assert.equal(state.players.find((p) => p.id === 2)!.isSuspended, false);
  });

  it("admin can suspend a target player", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const { status, body } = await suspend(2, { isSuspended: true });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.player.id, 2);
    assert.equal(body.player.isSuspended, true);
    assert.equal(state.players.find((p) => p.id === 2)!.isSuspended, true);
  });

  it("admin can unsuspend a previously suspended player", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target", isSuspended: true });
    const { status, body } = await suspend(2, { isSuspended: false });
    assert.equal(status, 200);
    assert.equal(body.player.isSuspended, false);
    assert.equal(state.players.find((p) => p.id === 2)!.isSuspended, false);
  });

  it("rejects self-suspension with 400", async () => {
    seedAdmin();
    const { status, body } = await suspend(1, { isSuspended: true });
    assert.equal(status, 400);
    assert.equal(body.error, "Admins cannot suspend themselves");
    assert.equal(state.players.find((p) => p.id === 1)!.isSuspended, false);
  });

  it("rejects a body missing the boolean isSuspended with 400", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const cases: unknown[] = [{}, { isSuspended: "true" }, { isSuspended: 1 }, { isSuspended: null }];
    for (const body of cases) {
      const res = await suspend(2, body);
      assert.equal(res.status, 400, `body ${JSON.stringify(body)} should be 400`);
      assert.match(res.body.error, /isSuspended/);
    }
    // None of the rejected bodies should have changed the target.
    assert.equal(state.players.find((p) => p.id === 2)!.isSuspended, false);
  });

  it("records the acting admin id and reason when suspending, clears them when unsuspending", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });

    const suspendRes = await suspend(2, { isSuspended: true, reason: "spam and harassment" });
    assert.equal(suspendRes.status, 200);
    assert.equal(suspendRes.body.player.suspendedByAdminId, 1);
    assert.equal(suspendRes.body.player.suspensionReason, "spam and harassment");
    const row = state.players.find((p) => p.id === 2)!;
    assert.equal(row.suspendedByAdminId, 1);
    assert.equal(row.suspensionReason, "spam and harassment");

    const unsuspendRes = await suspend(2, { isSuspended: false });
    assert.equal(unsuspendRes.status, 200);
    assert.equal(unsuspendRes.body.player.suspendedByAdminId, null);
    assert.equal(unsuspendRes.body.player.suspensionReason, null);
    const cleared = state.players.find((p) => p.id === 2)!;
    assert.equal(cleared.suspendedByAdminId, null);
    assert.equal(cleared.suspensionReason, null);
  });

  it("trims and caps the suspension reason at 500 chars; missing reason stays null", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_a", username: "a" });
    seedTarget({ id: 3, clerkId: "u_b", username: "b" });

    const noReason = await suspend(2, { isSuspended: true });
    assert.equal(noReason.status, 200);
    assert.equal(noReason.body.player.suspensionReason, null);

    const longReason = "x".repeat(800);
    const longRes = await suspend(3, { isSuspended: true, reason: `  ${longReason}  ` });
    assert.equal(longRes.status, 200);
    assert.equal(longRes.body.player.suspensionReason!.length, 500);
  });

  it("returns 404 when the target player does not exist", async () => {
    seedAdmin();
    const { status, body } = await suspend(999, { isSuspended: true });
    assert.equal(status, 404);
    assert.equal(body.error, "Player not found");
  });
});
