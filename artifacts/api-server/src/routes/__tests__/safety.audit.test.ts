// Endpoint tests covering the moderation audit log.
//
// The audit log is the source of truth for moderation accountability. These
// tests lock down two things:
//
//   1. Every moderation action (suspend, unsuspend, verify, resolve_report,
//      dismiss_report) writes EXACTLY ONE audit row with the correct actor,
//      target, action, and reason.
//   2. GET /admin/audit filters correctly and rejects non-admin callers with
//      403.
//   3. A failing audit insert does NOT block the underlying moderation action
//      — audit logging is best-effort.
//
// The DB, Clerk auth, and the attachPlayer middleware are mocked via
// `node:test` module mocks so the routes run in isolation.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

// ── In-memory state ──────────────────────────────────────────────────────────

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  isAdmin: boolean;
  isSuspended: boolean;
  suspendedAt: Date | null;
  isVerified: boolean;
}

interface ReportRow {
  id: number;
  reporterId: number;
  reportedUserId: number | null;
  reason: string;
  contentType: string;
  contentId: number | null;
  description: string | null;
  status: string;
  resolvedAt: Date | null;
  createdAt: Date;
}

interface AuditRow {
  id: number;
  actorId: number;
  action: string;
  targetPlayerId: number | null;
  targetReportId: number | null;
  reason: string | null;
  metadata: string | null;
  createdAt: Date;
}

const state = {
  callerClerkId: "u_admin",
  players: [] as PlayerRow[],
  reports: [] as ReportRow[],
  audits: [] as AuditRow[],
  nextReportId: 1,
  nextAuditId: 1,
  failNextAuditInsert: false,
};

function resetState() {
  state.callerClerkId = "u_admin";
  state.players = [];
  state.reports = [];
  state.audits = [];
  state.nextReportId = 1;
  state.nextAuditId = 1;
  state.failNextAuditInsert = false;
}

// ── Predicate helpers ────────────────────────────────────────────────────────

type Pred =
  | { op: "eq"; col: { _name: string }; val: unknown }
  | { op: "and"; args: Pred[] }
  | { op: "or"; args: Pred[] }
  | undefined;

function matches(row: Record<string, unknown>, pred: Pred): boolean {
  if (!pred) return true;
  if (pred.op === "eq") return row[pred.col._name] === pred.val;
  if (pred.op === "and") return pred.args.every((p) => matches(row, p));
  if (pred.op === "or") return pred.args.some((p) => matches(row, p));
  return true;
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
  namedExports: {
    issueEmailVerification: async () => ({ sent: false }),
  },
});

mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    emailResendLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
    consumeEmailResendBudget: () => true,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args: args.filter(Boolean) }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    desc: (col: unknown) => ({ op: "desc", col }),
    notInArray: () => ({ op: "notIn" }),
  },
});

// ── Fake tables (column markers used by predicate evaluator) ─────────────────

function col(name: string) {
  return { _name: name };
}

const playersTable = {
  _table: "players",
  id: col("id"),
  clerkId: col("clerkId"),
  username: col("username"),
  displayName: col("displayName"),
  isAdmin: col("isAdmin"),
  isSuspended: col("isSuspended"),
  suspendedAt: col("suspendedAt"),
  isVerified: col("isVerified"),
  avatarUrl: col("avatarUrl"),
};
const userReportsTable = {
  _table: "userReports",
  id: col("id"),
  status: col("status"),
  createdAt: col("createdAt"),
  reportedUserId: col("reportedUserId"),
  contentType: col("contentType"),
};
const blockedUsersTable = {
  _table: "blockedUsers",
  blockerId: col("blockerId"),
  blockedId: col("blockedId"),
  createdAt: col("createdAt"),
};
const moderationAuditLogTable = {
  _table: "moderationAuditLog",
  id: col("id"),
  actorId: col("actorId"),
  action: col("action"),
  targetPlayerId: col("targetPlayerId"),
  targetReportId: col("targetReportId"),
  reason: col("reason"),
  metadata: col("metadata"),
  createdAt: col("createdAt"),
};
const notificationsTable = {
  _table: "notifications",
  playerId: col("playerId"),
  type: col("type"),
  createdAt: col("createdAt"),
};

function tableRows(table: { _table: string }): Record<string, unknown>[] {
  switch (table._table) {
    case "players": return state.players as unknown as Record<string, unknown>[];
    case "userReports": return state.reports as unknown as Record<string, unknown>[];
    case "moderationAuditLog": return state.audits as unknown as Record<string, unknown>[];
    default: return [];
  }
}

// ── Fake DB ──────────────────────────────────────────────────────────────────

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where?: Pred }) => {
        return state.players.find((p) => matches(p as unknown as Record<string, unknown>, args?.where));
      },
    },
    notificationsTable: {
      findFirst: async () => undefined,
    },
  },
  insert(table: { _table: string }) {
    let vals: Record<string, unknown> = {};
    const run = async (): Promise<unknown[]> => {
      if (table._table === "moderationAuditLog") {
        if (state.failNextAuditInsert) {
          state.failNextAuditInsert = false;
          throw new Error("simulated audit insert failure");
        }
        const row: AuditRow = {
          id: state.nextAuditId++,
          actorId: vals.actorId as number,
          action: vals.action as string,
          targetPlayerId: (vals.targetPlayerId as number | null) ?? null,
          targetReportId: (vals.targetReportId as number | null) ?? null,
          reason: (vals.reason as string | null) ?? null,
          metadata: (vals.metadata as string | null) ?? null,
          createdAt: new Date(),
        };
        state.audits.push(row);
        return [row];
      }
      if (table._table === "userReports") {
        const row: ReportRow = {
          id: state.nextReportId++,
          reporterId: vals.reporterId as number,
          reportedUserId: (vals.reportedUserId as number | null) ?? null,
          reason: vals.reason as string,
          contentType: (vals.contentType as string) ?? "profile",
          contentId: (vals.contentId as number | null) ?? null,
          description: (vals.description as string | null) ?? null,
          status: (vals.status as string) ?? "open",
          resolvedAt: null,
          createdAt: new Date(),
        };
        state.reports.push(row);
        return [row];
      }
      return [];
    };
    const chain: Record<string, unknown> = {
      values(v: Record<string, unknown>) {
        vals = v;
        return chain;
      },
      onConflictDoNothing() {
        return run();
      },
      async returning() {
        return run();
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        run().then(resolve, reject);
      },
    };
    return chain;
  },
  update(table: { _table: string }) {
    let setVals: Record<string, unknown> = {};
    let pred: Pred;
    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        setVals = v;
        return chain;
      },
      where(p: Pred) {
        pred = p;
        return chain;
      },
      async returning(_cols?: unknown) {
        const rows = tableRows(table);
        const updated: Record<string, unknown>[] = [];
        for (let i = 0; i < rows.length; i++) {
          if (matches(rows[i], pred)) {
            Object.assign(rows[i], setVals);
            updated.push({ ...rows[i] });
          }
        }
        return updated;
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        (chain.returning as () => Promise<unknown>)().then(resolve as never, reject);
      },
    };
    return chain;
  },
  delete(_table: unknown) {
    const chain = {
      where: async () => undefined,
    };
    return chain;
  },
  select(_cols?: unknown) {
    let table: { _table: string } | null = null;
    let pred: Pred;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(t: { _table: string }) {
        table = t;
        return chain;
      },
      where(p: Pred) {
        pred = p;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          if (!table) return resolve([]);
          let rows = tableRows(table).filter((r) => matches(r, pred));
          if (limit != null) rows = rows.slice(0, limit);
          resolve(rows.map((r) => ({ ...r })));
        } catch (err) {
          reject(err);
        }
      },
    };
    return chain;
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable,
    userReportsTable,
    blockedUsersTable,
    moderationAuditLogTable,
    notificationsTable,
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

function seedAdmin(over: Partial<PlayerRow> = {}): PlayerRow {
  const admin: PlayerRow = {
    id: 1,
    clerkId: "u_admin",
    username: "admin",
    isAdmin: true,
    isSuspended: false,
    suspendedAt: null,
    isVerified: false,
    ...over,
  };
  state.players.push(admin);
  return admin;
}

function seedTarget(over: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  const target: PlayerRow = {
    isAdmin: false,
    isSuspended: false,
    suspendedAt: null,
    isVerified: false,
    ...over,
  };
  state.players.push(target);
  return target;
}

function seedReport(over: Partial<ReportRow> & { id?: number }): ReportRow {
  const r: ReportRow = {
    id: over.id ?? state.nextReportId++,
    reporterId: 1,
    reportedUserId: null,
    reason: "spam",
    contentType: "profile",
    contentId: null,
    description: null,
    status: "open",
    resolvedAt: null,
    createdAt: new Date(),
    ...over,
  };
  if (over.id != null && over.id >= state.nextReportId) {
    state.nextReportId = over.id + 1;
  }
  state.reports.push(r);
  return r;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, init);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("moderation audit log — writes", () => {
  it("suspend writes exactly one audit row with actor, target, action, reason", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const { status } = await req("PATCH", "/admin/players/2/suspend", {
      isSuspended: true,
      reason: "violating community guidelines",
    });
    assert.equal(status, 200);
    assert.equal(state.audits.length, 1);
    const a = state.audits[0];
    assert.equal(a.actorId, 1);
    assert.equal(a.action, "suspend");
    assert.equal(a.targetPlayerId, 2);
    assert.equal(a.targetReportId, null);
    assert.equal(a.reason, "violating community guidelines");
  });

  it("unsuspend writes exactly one audit row with action=unsuspend", async () => {
    seedAdmin();
    seedTarget({
      id: 2,
      clerkId: "u_target",
      username: "target",
      isSuspended: true,
      suspendedAt: new Date(),
    });
    const { status } = await req("PATCH", "/admin/players/2/suspend", {
      isSuspended: false,
      reason: "appeal granted",
    });
    assert.equal(status, 200);
    assert.equal(state.audits.length, 1);
    const a = state.audits[0];
    assert.equal(a.action, "unsuspend");
    assert.equal(a.actorId, 1);
    assert.equal(a.targetPlayerId, 2);
    assert.equal(a.reason, "appeal granted");
  });

  it("verify writes exactly one audit row with action=verify", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const { status } = await req("POST", "/admin/players/2/verify");
    assert.equal(status, 200);
    assert.equal(state.audits.length, 1);
    const a = state.audits[0];
    assert.equal(a.action, "verify");
    assert.equal(a.actorId, 1);
    assert.equal(a.targetPlayerId, 2);
    assert.equal(a.targetReportId, null);
    assert.equal(a.reason, null);
  });

  it("resolve_report writes exactly one audit row with targetReportId + targetPlayerId", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const r = seedReport({ id: 7, reportedUserId: 2, status: "open" });
    const { status } = await req("PATCH", `/admin/reports/${r.id}`, {
      status: "resolved",
      reason: "valid report",
    });
    assert.equal(status, 200);
    assert.equal(state.audits.length, 1);
    const a = state.audits[0];
    assert.equal(a.action, "resolve_report");
    assert.equal(a.actorId, 1);
    assert.equal(a.targetReportId, 7);
    assert.equal(a.targetPlayerId, 2);
    assert.equal(a.reason, "valid report");
  });

  it("dismiss_report writes exactly one audit row with action=dismiss_report", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    const r = seedReport({ id: 8, reportedUserId: 2, status: "open" });
    const { status } = await req("PATCH", `/admin/reports/${r.id}`, {
      status: "dismissed",
      reason: "false alarm",
    });
    assert.equal(status, 200);
    assert.equal(state.audits.length, 1);
    const a = state.audits[0];
    assert.equal(a.action, "dismiss_report");
    assert.equal(a.targetReportId, 8);
    assert.equal(a.targetPlayerId, 2);
    assert.equal(a.reason, "false alarm");
  });

  it("a failing audit insert does NOT block the underlying moderation action", async () => {
    seedAdmin();
    seedTarget({ id: 2, clerkId: "u_target", username: "target" });
    state.failNextAuditInsert = true;
    const { status, body } = await req("PATCH", "/admin/players/2/suspend", {
      isSuspended: true,
    });
    // The suspend itself must still succeed even though audit write threw.
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(state.players.find((p) => p.id === 2)!.isSuspended, true);
    // Nothing was recorded in the audit log.
    assert.equal(state.audits.length, 0);
  });
});

describe("GET /admin/audit", () => {
  function seedAudits() {
    state.audits.push(
      { id: 1, actorId: 1, action: "suspend", targetPlayerId: 10, targetReportId: null, reason: null, metadata: null, createdAt: new Date(Date.now() - 4000) },
      { id: 2, actorId: 1, action: "verify", targetPlayerId: 11, targetReportId: null, reason: null, metadata: null, createdAt: new Date(Date.now() - 3000) },
      { id: 3, actorId: 2, action: "suspend", targetPlayerId: 10, targetReportId: null, reason: null, metadata: null, createdAt: new Date(Date.now() - 2000) },
      { id: 4, actorId: 2, action: "resolve_report", targetPlayerId: 12, targetReportId: 99, reason: null, metadata: null, createdAt: new Date(Date.now() - 1000) },
    );
    state.nextAuditId = 5;
  }

  it("rejects non-admin callers with 403", async () => {
    seedAdmin({ isAdmin: false });
    seedAudits();
    const { status, body } = await req("GET", "/admin/audit");
    assert.equal(status, 403);
    assert.equal(body.error, "Admin access required");
  });

  it("filters by actorId", async () => {
    seedAdmin();
    seedAudits();
    const { status, body } = await req("GET", "/admin/audit?actorId=2");
    assert.equal(status, 200);
    assert.equal(body.length, 2);
    for (const row of body) assert.equal(row.actorId, 2);
  });

  it("filters by targetPlayerId", async () => {
    seedAdmin();
    seedAudits();
    const { status, body } = await req("GET", "/admin/audit?targetPlayerId=10");
    assert.equal(status, 200);
    assert.equal(body.length, 2);
    for (const row of body) assert.equal(row.targetPlayerId, 10);
  });

  it("filters by action", async () => {
    seedAdmin();
    seedAudits();
    const { status, body } = await req("GET", "/admin/audit?action=verify");
    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].action, "verify");
    assert.equal(body[0].targetPlayerId, 11);
  });

  it("combines multiple filters with AND semantics", async () => {
    seedAdmin();
    seedAudits();
    const { status, body } = await req("GET", "/admin/audit?actorId=2&action=suspend");
    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].actorId, 2);
    assert.equal(body[0].action, "suspend");
    assert.equal(body[0].targetPlayerId, 10);
  });
});
