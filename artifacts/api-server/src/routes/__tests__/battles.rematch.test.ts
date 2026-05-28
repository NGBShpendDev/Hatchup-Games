// API tests for the rematch accept/decline endpoints in
// `routes/battles.ts`.
//
// Covers:
//   - POST /battles/rematch/:id/accept happy path
//       (200, status flips to "accepted", a notification is sent to the
//       inviter with the rematch link).
//   - POST /battles/rematch/:id/accept 403
//       (caller is not the recipient of the invite).
//   - POST /battles/rematch/:id/accept 409
//       (invite has already been accepted/declined).
//   - POST /battles/rematch/:id/decline happy path
//       (200, status flips to "declined", inviter gets a "declined"
//       notification pointing back to /compete).
//   - POST /battles/rematch/:id/decline 403
//       (caller is neither the recipient nor the sender).
//   - POST /battles/rematch/:id/decline noop when invite is already
//       declined (no extra notification is queued).
//
// We mock @clerk/express, the auth middleware, the matchmaking queue
// (so we can inspect getRematchInvite / setRematchInviteStatus calls
// without touching the WS server), and @workspace/db (so notifications
// land in an in-memory array).

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

interface InviteRow {
  id: string;
  fromPlayerId: number;
  toPlayerId: number;
  mode: "casual" | "ranked";
  fromHatchlingId: number;
  fromHatchlingName: string;
  fromBattleId: number;
  status: "pending" | "accepted" | "declined" | "consumed" | "expired";
  createdAt: number;
  expiresAt: number;
}

interface NotificationInsert {
  playerId: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  sourceId?: number | null;
}

const state = {
  authPlayerId: null as number | null,
  invites: new Map<string, InviteRow>(),
  players: new Map<number, { id: number; displayName: string | null; username: string | null }>(),
  notifications: [] as NotificationInsert[],
  // Tracks setRematchInviteStatus calls so tests can assert ordering.
  statusUpdates: [] as Array<{ id: string; status: InviteRow["status"] }>,
};

function resetState() {
  state.authPlayerId = null;
  state.invites = new Map();
  state.players = new Map();
  state.notifications = [];
  state.statusUpdates = [];
}

// ── Mocks ────────────────────────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.authPlayerId !== null ? `clerk_${state.authPlayerId}` : null }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (req: { playerId?: number | null }, _res: unknown, next: () => void) => {
      req.playerId = state.authPlayerId;
      next();
    },
  },
});

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceBattleDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// Replace the matchmaking queue module entirely so we don't pull in the
// WebSocket server. Only the rematch helpers used by accept/decline are
// implemented; everything else throws if the route accidentally calls it.
mock.module("../../services/matchmakingQueue.ts", {
  namedExports: {
    async issueWsToken() { throw new Error("not used in this test"); },
    async createRematchInvite() { throw new Error("not used in this test"); },
    async listPendingRematchInvitesFor() { return []; },
    async getRematchInvite(id: string) {
      const row = state.invites.get(id);
      return row ? { ...row } : null;
    },
    async setRematchInviteStatus(id: string, status: InviteRow["status"]) {
      state.statusUpdates.push({ id, status });
      const row = state.invites.get(id);
      if (!row) return null;
      row.status = status;
      return { ...row };
    },
  },
});

// drizzle-orm only needs the operators referenced at import-time; we
// produce opaque marker objects since the fake db below never inspects
// the predicates beyond identity.
mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (_c: unknown, v: unknown) => ({ __op: "eq", val: v }),
    desc: () => ({}),
    or: () => ({}),
    and: () => ({}),
    inArray: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async ({ where }: { where?: { val?: unknown } }) => {
        const id = where?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.players.get(id);
      },
      findMany: async () => [],
    },
    battlesTable: { findFirst: async () => undefined },
    hatchlingsTable: { findFirst: async () => undefined },
  },
  insert: (_table: unknown) => ({
    values: async (row: NotificationInsert) => {
      state.notifications.push(row);
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    battlesTable: {},
    hatchlingsTable: {},
    notificationsTable: { __t: "notifications" },
    playersTable: { id: { __c: "id" } },
  },
});

// ── Server setup ─────────────────────────────────────────────────────────────
const express = (await import("express")).default;
const battlesRouter = (await import("../battles.ts")).default;

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(battlesRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

// ── Fixtures ─────────────────────────────────────────────────────────────────
const INVITER_ID = 1;
const RECIPIENT_ID = 2;
const STRANGER_ID = 99;

function makeInvite(overrides: Partial<InviteRow> = {}): InviteRow {
  const now = Date.now();
  return {
    id: "inv-1",
    fromPlayerId: INVITER_ID,
    toPlayerId: RECIPIENT_ID,
    mode: "casual",
    fromHatchlingId: 10,
    fromHatchlingName: "Sparky",
    fromBattleId: 555,
    status: "pending",
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    ...overrides,
  };
}

function seed(invite: InviteRow) {
  state.players.set(INVITER_ID, { id: INVITER_ID, displayName: "Inviter", username: "inviter" });
  state.players.set(RECIPIENT_ID, { id: RECIPIENT_ID, displayName: "Recip", username: "recip" });
  state.players.set(STRANGER_ID, { id: STRANGER_ID, displayName: "Stranger", username: "stranger" });
  state.invites.set(invite.id, invite);
}

beforeEach(() => { resetState(); });

// ── Tests: accept ────────────────────────────────────────────────────────────
describe("POST /battles/rematch/:id/accept", () => {
  it("flips a pending invite to accepted and notifies the inviter with the rematch link", async () => {
    const invite = makeInvite();
    seed(invite);
    state.authPlayerId = RECIPIENT_ID;

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/accept`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; inviteId: string };
    assert.deepEqual(body, { ok: true, inviteId: invite.id });

    // Status moved to "accepted".
    assert.deepEqual(state.statusUpdates, [{ id: invite.id, status: "accepted" }]);
    assert.equal(state.invites.get(invite.id)!.status, "accepted");

    // Exactly one notification, sent to the original inviter with the
    // /compete/battle?rematch=<id> link so they can hop into the queue.
    assert.equal(state.notifications.length, 1);
    const n = state.notifications[0];
    assert.equal(n.playerId, INVITER_ID);
    assert.equal(n.type, "rematch_invite");
    assert.ok(n.title.includes("Recip"), "title mentions the acceptor's display name");
    assert.ok(n.title.toLowerCase().includes("accepted"), "title announces an acceptance");
    assert.equal(n.link, `/compete/battle?rematch=${invite.id}`);
    assert.equal(n.sourceId, invite.fromBattleId);
  });

  it("returns 403 when the caller is not the recipient (e.g. the original inviter clicks accept)", async () => {
    const invite = makeInvite();
    seed(invite);
    state.authPlayerId = INVITER_ID; // inviter trying to accept their own invite

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/accept`, { method: "POST" });
    assert.equal(res.status, 403);

    // No status mutation, no notification fan-out.
    assert.equal(state.statusUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.invites.get(invite.id)!.status, "pending");
  });

  it("returns 409 when the invite has already been accepted", async () => {
    const invite = makeInvite({ status: "accepted" });
    seed(invite);
    state.authPlayerId = RECIPIENT_ID;

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/accept`, { method: "POST" });
    assert.equal(res.status, 409);
    const body = await res.json() as { error: string };
    assert.ok(body.error.includes("accepted"));

    assert.equal(state.statusUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
  });

  it("returns 404 when the invite id is unknown", async () => {
    state.authPlayerId = RECIPIENT_ID;
    const res = await fetch(`${baseUrl}/battles/rematch/does-not-exist/accept`, { method: "POST" });
    assert.equal(res.status, 404);
  });
});

// ── Tests: decline ───────────────────────────────────────────────────────────
describe("POST /battles/rematch/:id/decline", () => {
  it("flips a pending invite to declined and notifies the inviter back at /compete when the recipient declines", async () => {
    const invite = makeInvite();
    seed(invite);
    state.authPlayerId = RECIPIENT_ID;

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/decline`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean };
    assert.deepEqual(body, { ok: true });

    assert.deepEqual(state.statusUpdates, [{ id: invite.id, status: "declined" }]);
    assert.equal(state.invites.get(invite.id)!.status, "declined");

    assert.equal(state.notifications.length, 1);
    const n = state.notifications[0];
    assert.equal(n.playerId, INVITER_ID);
    assert.equal(n.type, "rematch_invite");
    assert.ok(n.title.toLowerCase().includes("declined"));
    assert.equal(n.link, "/compete");
  });

  it("does NOT notify when the original inviter cancels their own invite", async () => {
    // Decline endpoint accepts either participant. When the inviter
    // themself withdraws, we shouldn't queue a "your rematch was
    // declined" notification back to themself.
    const invite = makeInvite();
    seed(invite);
    state.authPlayerId = INVITER_ID;

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/decline`, { method: "POST" });
    assert.equal(res.status, 200);

    assert.deepEqual(state.statusUpdates, [{ id: invite.id, status: "declined" }]);
    assert.equal(state.notifications.length, 0);
  });

  it("returns 403 when the caller is neither the recipient nor the inviter", async () => {
    const invite = makeInvite();
    seed(invite);
    state.authPlayerId = STRANGER_ID;

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/decline`, { method: "POST" });
    assert.equal(res.status, 403);

    assert.equal(state.statusUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.invites.get(invite.id)!.status, "pending");
  });

  it("is a noop on an already-declined invite — no second status update or duplicate notification", async () => {
    const invite = makeInvite({ status: "declined" });
    seed(invite);
    state.authPlayerId = RECIPIENT_ID;

    const res = await fetch(`${baseUrl}/battles/rematch/${invite.id}/decline`, { method: "POST" });
    assert.equal(res.status, 200);

    assert.equal(state.statusUpdates.length, 0, "no setRematchInviteStatus call for a terminal invite");
    assert.equal(state.notifications.length, 0, "no follow-up notification for a terminal invite");
  });
});
