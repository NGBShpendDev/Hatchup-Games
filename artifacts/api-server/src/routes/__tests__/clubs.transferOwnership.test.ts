// API tests for the club ownership transfer endpoint in `routes/clubs.ts`.
//
// Covers the guards on POST /clubs/:id/transfer-ownership:
//   - 403 when the caller is NOT the current owner of the club
//     (a regular member, an officer, or a stranger should never be
//     able to move the crown). Database state and notifications must
//     be untouched.
//   - 404 when the targeted member id doesn't belong to the club
//     (unknown player id, or a real player who isn't in this club).
//   - 400 when the owner picks themself as the new owner — they're
//     already the owner, so this is a no-op we reject explicitly.
//   - Happy-path 200 so we also pin that the same handler still
//     swaps the two roles and notifies the new owner. This gives the
//     guard tests a positive control: if the swap regresses we'll
//     catch it here too.
//
// We mock @clerk/express, the auth middleware, push notifications,
// and @workspace/db so the tests run without a real Postgres or a
// Clerk session.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

interface PlayerRow {
  id: number;
  clubId: number | null;
  clubRole: string | null;
  displayName: string | null;
  username: string | null;
}

interface ClubRow {
  id: number;
  name: string;
  memberCount: number;
  createdAt: Date;
}

interface NotificationInsert {
  playerId: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  sourceId?: number | null;
}

interface PlayerUpdate {
  id: number;
  clubRole: string | null;
}

const state = {
  authPlayerId: null as number | null,
  players: new Map<number, PlayerRow>(),
  clubs: new Map<number, ClubRow>(),
  notifications: [] as NotificationInsert[],
  inserted: [] as Array<{ id: number } & NotificationInsert>,
  playerUpdates: [] as PlayerUpdate[],
  pushSends: [] as Array<{ playerId: number; tag?: string }>,
  nextNotifId: 1,
};

function resetState() {
  state.authPlayerId = null;
  state.players = new Map();
  state.clubs = new Map();
  state.notifications = [];
  state.inserted = [];
  state.playerUpdates = [];
  state.pushSends = [];
  state.nextNotifId = 1;
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

mock.module("../../services/pushNotifications.ts", {
  namedExports: {
    sendPushToPlayer: async (
      playerId: number,
      payload: { tag?: string },
    ) => {
      state.pushSends.push({ playerId, tag: payload?.tag });
    },
  },
});

// drizzle-orm operators — opaque marker objects. Our fake db never
// inspects predicate internals beyond the captured `val` on eq().
mock.module("drizzle-orm", {
  namedExports: {
    eq: (_c: unknown, v: unknown) => ({ __op: "eq", val: v }),
    and: (...args: unknown[]) => ({ __op: "and", args }),
    or: () => ({}),
    desc: () => ({}),
    lt: () => ({}),
    inArray: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});

// Minimal fake of the drizzle query/update/insert/transaction surface
// used by the transfer-ownership handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeDb: any = {
  query: {
    clubsTable: {
      findFirst: async ({ where }: { where?: { val?: unknown } }) => {
        const id = where?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.clubs.get(id);
      },
    },
    playersTable: {
      findFirst: async ({ where }: { where?: { val?: unknown } }) => {
        const id = where?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.players.get(id);
      },
      findMany: async () => Array.from(state.players.values()),
    },
  },
  update: (_table: unknown) => ({
    set: (vals: { clubRole?: string | null }) => ({
      where: async (pred: { val?: unknown }) => {
        const id = pred?.val as number | undefined;
        if (id === undefined) return;
        const row = state.players.get(id);
        if (row && vals.clubRole !== undefined) {
          row.clubRole = vals.clubRole;
          state.playerUpdates.push({ id, clubRole: vals.clubRole });
        }
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (row: NotificationInsert) => ({
      returning: async () => {
        const persisted = { id: state.nextNotifId++, ...row };
        state.notifications.push(row);
        state.inserted.push(persisted);
        return [persisted];
      },
    }),
  }),
  transaction: async (fn: (tx: typeof fakeDb) => Promise<void>) => {
    await fn(fakeDb);
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    clubsTable: { id: { __c: "clubId" } },
    clubInvitesTable: {},
    notificationsTable: { __t: "notifications" },
    playersTable: { id: { __c: "id" }, clubId: { __c: "clubId" } },
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
  },
});

// ── Server setup ─────────────────────────────────────────────────────────────
const express = (await import("express")).default;
const clubsRouter = (await import("../clubs.ts")).default;

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(clubsRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

// ── Fixtures ─────────────────────────────────────────────────────────────────
const CLUB_ID = 7;
const OWNER_ID = 1;
const OFFICER_ID = 2;
const MEMBER_ID = 3;
const STRANGER_ID = 99; // exists, but not in CLUB_ID
const UNKNOWN_ID = 12345; // no player row at all

function seedClubWithOwner() {
  state.clubs.set(CLUB_ID, {
    id: CLUB_ID,
    name: "Neon Nighthawks",
    memberCount: 3,
    createdAt: new Date("2025-01-01T00:00:00Z"),
  });
  state.players.set(OWNER_ID, {
    id: OWNER_ID, clubId: CLUB_ID, clubRole: "owner",
    displayName: "Owner", username: "owner",
  });
  state.players.set(OFFICER_ID, {
    id: OFFICER_ID, clubId: CLUB_ID, clubRole: "officer",
    displayName: "Officer", username: "officer",
  });
  state.players.set(MEMBER_ID, {
    id: MEMBER_ID, clubId: CLUB_ID, clubRole: "member",
    displayName: "Member", username: "member",
  });
  // A real player but in a different club (or no club).
  state.players.set(STRANGER_ID, {
    id: STRANGER_ID, clubId: null, clubRole: null,
    displayName: "Stranger", username: "stranger",
  });
}

async function postTransfer(newOwnerId: number, clubId: number = CLUB_ID) {
  return fetch(`${baseUrl}/clubs/${clubId}/transfer-ownership`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newOwnerId }),
  });
}

beforeEach(() => { resetState(); });

// ── Tests ────────────────────────────────────────────────────────────────────
describe("POST /clubs/:id/transfer-ownership", () => {
  it("happy path — swaps roles, persists, and notifies the new owner", async () => {
    seedClubWithOwner();
    state.authPlayerId = OWNER_ID;

    const res = await postTransfer(MEMBER_ID);
    assert.equal(res.status, 200);
    const body = await res.json() as { success: boolean; newOwnerId: number; leftClub?: boolean };
    assert.equal(body.success, true);
    assert.equal(body.newOwnerId, MEMBER_ID);
    // The default (no alsoLeave flag) keeps the former owner in the
    // club as an Officer — leftClub must be false.
    assert.equal(body.leftClub, false);

    // Roles swapped: previous owner -> officer, target -> owner.
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "officer");
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "owner");

    // Both updates were issued. We don't pin the order — only that
    // each player was updated exactly once with the expected role.
    assert.equal(state.playerUpdates.length, 2);
    const updatesById = new Map(state.playerUpdates.map((u) => [u.id, u.clubRole]));
    assert.equal(updatesById.get(OWNER_ID), "officer");
    assert.equal(updatesById.get(MEMBER_ID), "owner");

    // The new owner gets a single notification + push.
    assert.equal(state.notifications.length, 1);
    const n = state.notifications[0];
    assert.equal(n.playerId, MEMBER_ID);
    assert.equal(n.type, "club_role_promoted");
    assert.equal(n.link, `/club/${CLUB_ID}`);
    assert.equal(n.sourceId, CLUB_ID);
    assert.ok(n.title.toLowerCase().includes("owner"));

    assert.equal(state.pushSends.length, 1);
    assert.equal(state.pushSends[0].playerId, MEMBER_ID);
  });

  it("returns 403 when a non-owner tries to transfer (officer)", async () => {
    seedClubWithOwner();
    state.authPlayerId = OFFICER_ID;

    const res = await postTransfer(MEMBER_ID);
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(body.error, /owner/i);

    // No mutations, no notifications, no push.
    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushSends.length, 0);
    // The original owner is still the owner.
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "member");
  });

  it("returns 403 when a regular member tries to transfer", async () => {
    seedClubWithOwner();
    state.authPlayerId = MEMBER_ID;

    const res = await postTransfer(OFFICER_ID);
    assert.equal(res.status, 403);
    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("returns 403 when a stranger (not in the club) tries to transfer", async () => {
    seedClubWithOwner();
    state.authPlayerId = STRANGER_ID;

    const res = await postTransfer(MEMBER_ID);
    assert.equal(res.status, 403);
    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
  });

  it("returns 404 when the target id has no player row at all", async () => {
    seedClubWithOwner();
    state.authPlayerId = OWNER_ID;

    const res = await postTransfer(UNKNOWN_ID);
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.match(body.error, /member/i);

    // The crown stayed put.
    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("returns 404 when the target exists but is in a different club", async () => {
    seedClubWithOwner();
    state.authPlayerId = OWNER_ID;

    const res = await postTransfer(STRANGER_ID);
    assert.equal(res.status, 404);
    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("returns 400 when the owner tries to transfer to themself", async () => {
    seedClubWithOwner();
    state.authPlayerId = OWNER_ID;

    const res = await postTransfer(OWNER_ID);
    assert.equal(res.status, 400);
    const body = await res.json() as { error: string };
    assert.match(body.error, /already the owner/i);

    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushSends.length, 0);
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("returns 404 when the club id doesn't exist", async () => {
    seedClubWithOwner();
    state.authPlayerId = OWNER_ID;

    const res = await postTransfer(MEMBER_ID, 999);
    assert.equal(res.status, 404);
    assert.equal(state.playerUpdates.length, 0);
    assert.equal(state.notifications.length, 0);
  });
});
