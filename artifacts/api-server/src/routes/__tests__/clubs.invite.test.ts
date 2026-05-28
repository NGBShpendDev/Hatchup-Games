// Tests for the club invite flow on routes/clubs.ts:
//   - POST /clubs/:id/invite — admin-only, idempotent, side-effects
//   - POST /club-invites/:id/respond — accept/decline, single-shot
//   - GET  /club-invites — pending invites for the current player
//
// We exercise the real Express router against an in-memory fake DB and
// mock auth/push so the side-effects (notification insert, notification
// mark-read on respond, push fan-out) can be asserted precisely.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ──────────────────────────────────────────────────────────
interface PlayerRow {
  id: number;
  clerkId: string;
  username: string | null;
  displayName: string | null;
  clubId: number | null;
  clubRole: string | null;
}
interface ClubRow {
  id: number;
  name: string;
  description: string;
  memberCount: number;
  createdAt: Date;
}
interface InviteRow {
  id: number;
  clubId: number;
  inviteeId: number;
  inviterId: number;
  status: string;
  sentAt: Date;
}
interface NotificationRow {
  id: number;
  playerId: number;
  type: string;
  title: string;
  body: string;
  link: string;
  sourceId: number | null;
  read: boolean;
  createdAt: Date;
}

const state = {
  players: new Map<number, PlayerRow>(),
  clubs: new Map<number, ClubRow>(),
  invites: [] as InviteRow[],
  notifications: [] as NotificationRow[],
  pushes: [] as Array<{ playerId: number; payload: Record<string, unknown> }>,
  authPlayerId: null as number | null,
  nextInviteId: 1,
  nextNotificationId: 1,
};

function resetState() {
  state.players = new Map();
  state.clubs = new Map();
  state.invites = [];
  state.notifications = [];
  state.pushes = [];
  state.authPlayerId = null;
  state.nextInviteId = 1;
  state.nextNotificationId = 1;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
      if (state.authPlayerId == null) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    },
    attachPlayer: (req: { playerId?: number | null }, _res: unknown, next: () => void) => {
      req.playerId = state.authPlayerId;
      next();
    },
  },
});

mock.module("../../services/pushNotifications.ts", {
  namedExports: {
    sendPushToPlayer: async (playerId: number, payload: Record<string, unknown>) => {
      state.pushes.push({ playerId, payload });
    },
  },
});

// drizzle predicate builders → opaque markers we inspect by table+column.
interface Pred { __op: string; col?: { __table?: string; __col?: string }; val?: unknown; args?: Pred[] }
const col = (table: string, name: string) => ({ __table: table, __col: name });

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __table?: string; __col?: string }, v: unknown) => ({ __op: "eq", col: c, val: v }),
    and: (...args: Pred[]) => ({ __op: "and", args }),
    or: (...args: Pred[]) => ({ __op: "or", args }),
    ne: () => ({}),
    gt: () => ({}),
    lt: () => ({}),
    desc: () => ({}),
  },
});

function findPred(node: Pred | undefined, table: string, colName: string): Pred | undefined {
  if (!node) return undefined;
  if ((node.__op === "and" || node.__op === "or") && node.args) {
    for (const a of node.args) {
      const r = findPred(a, table, colName);
      if (r) return r;
    }
    return undefined;
  }
  if (node.__op === "eq" && node.col?.__col === colName && node.col?.__table === table) return node;
  return undefined;
}
function findAllPreds(node: Pred | undefined, table: string, colName: string): Pred[] {
  if (!node) return [];
  if ((node.__op === "and" || node.__op === "or") && node.args) {
    return node.args.flatMap(a => findAllPreds(a, table, colName));
  }
  if (node.__op === "eq" && node.col?.__col === colName && node.col?.__table === table) return [node];
  return [];
}

const clubsTable = {
  id: col("clubs", "id"),
};
const clubInvitesTable = {
  id: col("clubInvites", "id"),
  clubId: col("clubInvites", "clubId"),
  inviteeId: col("clubInvites", "inviteeId"),
  status: col("clubInvites", "status"),
};
const playersTable = {
  id: col("players", "id"),
  clubId: col("players", "clubId"),
};
const notificationsTable = {
  id: col("notifications", "id"),
  playerId: col("notifications", "playerId"),
  type: col("notifications", "type"),
  sourceId: col("notifications", "sourceId"),
};

const fakeDb = {
  query: {
    clubsTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "clubs", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.clubs.get(id);
      },
      findMany: async () => Array.from(state.clubs.values()),
    },
    playersTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "players", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.players.get(id);
      },
      findMany: async ({ where }: { where?: Pred }) => {
        const clubId = findPred(where, "players", "clubId")?.val as number | undefined;
        if (clubId === undefined) return [];
        return Array.from(state.players.values()).filter(p => p.clubId === clubId);
      },
    },
    clubInvitesTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "clubInvites", "id")?.val as number | undefined;
        const inviteeId = findPred(where, "clubInvites", "inviteeId")?.val as number | undefined;
        return state.invites.find(inv =>
          (id === undefined || inv.id === id) &&
          (inviteeId === undefined || inv.inviteeId === inviteeId),
        );
      },
      findMany: async ({ where }: { where?: Pred }) => {
        const inviteeId = findPred(where, "clubInvites", "inviteeId")?.val as number | undefined;
        const status = findPred(where, "clubInvites", "status")?.val as string | undefined;
        return state.invites.filter(inv =>
          (inviteeId === undefined || inv.inviteeId === inviteeId) &&
          (status === undefined || inv.status === status),
        );
      },
    },
  },
  insert: (table: unknown) => ({
    values: (vals: Record<string, unknown>) => {
      let inserted: unknown[] = [];
      if (table === clubInvitesTable) {
        // Honor the unique (clubId, inviteeId) constraint via onConflictDoNothing.
        const dup = state.invites.find(
          i => i.clubId === vals.clubId && i.inviteeId === vals.inviteeId,
        );
        if (!dup) {
          const row: InviteRow = {
            id: state.nextInviteId++,
            clubId: vals.clubId as number,
            inviteeId: vals.inviteeId as number,
            inviterId: vals.inviterId as number,
            status: "pending",
            sentAt: new Date(),
          };
          state.invites.push(row);
          inserted = [row];
        }
      } else if (table === notificationsTable) {
        const row: NotificationRow = {
          id: state.nextNotificationId++,
          playerId: vals.playerId as number,
          type: vals.type as string,
          title: vals.title as string,
          body: (vals.body as string) ?? "",
          link: (vals.link as string) ?? "",
          sourceId: (vals.sourceId as number) ?? null,
          read: false,
          createdAt: new Date(),
        };
        state.notifications.push(row);
        inserted = [row];
      }
      const chain = {
        onConflictDoNothing: () => chain,
        returning: async () => inserted,
        then: (resolve: (v: unknown) => void) => resolve(inserted),
      };
      return chain;
    },
  }),
  update: (table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async (cond: Pred) => {
        if (table === clubInvitesTable) {
          const id = findPred(cond, "clubInvites", "id")?.val as number | undefined;
          for (const inv of state.invites) {
            if (inv.id === id) Object.assign(inv, vals);
          }
        } else if (table === clubsTable) {
          const id = findPred(cond, "clubs", "id")?.val as number | undefined;
          const club = id !== undefined ? state.clubs.get(id) : undefined;
          if (club) Object.assign(club, vals);
        } else if (table === playersTable) {
          const id = findPred(cond, "players", "id")?.val as number | undefined;
          const player = id !== undefined ? state.players.get(id) : undefined;
          if (player) Object.assign(player, vals);
        } else if (table === notificationsTable) {
          // Mark-read flow: matches notifications by (playerId, type, sourceId).
          const playerId = findPred(cond, "notifications", "playerId")?.val as number | undefined;
          const type = findPred(cond, "notifications", "type")?.val as string | undefined;
          const sourceId = findPred(cond, "notifications", "sourceId")?.val as number | undefined;
          for (const n of state.notifications) {
            if (
              (playerId === undefined || n.playerId === playerId) &&
              (type === undefined || n.type === type) &&
              (sourceId === undefined || n.sourceId === sourceId)
            ) {
              Object.assign(n, vals);
            }
          }
          void findAllPreds; // silence unused
        }
      },
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    clubsTable,
    clubInvitesTable,
    notificationsTable,
    playersTable,
  },
});

mock.module("@workspace/api-zod", {
  namedExports: {
    ListClubsQueryParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    CreateClubBody: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    GetClubParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    JoinClubParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    JoinClubBody: { safeParse: (d: unknown) => ({ success: true, data: d }) },
  },
});

// ── Imports after mocks ──────────────────────────────────────────────────────
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

after(async () => {
  await closeServer();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const CLUB_ID = 100;
const LEADER_ID = 1;
const MEMBER_ID = 2;
const INVITEE_ID = 3;
const STRANGER_ID = 4;

function seedDefault() {
  state.clubs.set(CLUB_ID, {
    id: CLUB_ID,
    name: "Dragons",
    description: "",
    memberCount: 2,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  state.players.set(LEADER_ID, {
    id: LEADER_ID, clerkId: "u_leader", username: "leader", displayName: "Leader",
    clubId: CLUB_ID, clubRole: "leader",
  });
  state.players.set(MEMBER_ID, {
    id: MEMBER_ID, clerkId: "u_member", username: "member", displayName: "Member",
    clubId: CLUB_ID, clubRole: "member",
  });
  state.players.set(INVITEE_ID, {
    id: INVITEE_ID, clerkId: "u_invitee", username: "invitee", displayName: "Invitee",
    clubId: null, clubRole: null,
  });
  state.players.set(STRANGER_ID, {
    id: STRANGER_ID, clerkId: "u_stranger", username: "stranger", displayName: "Stranger",
    clubId: null, clubRole: null,
  });
}

beforeEach(() => {
  resetState();
  seedDefault();
});

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function invite(clubId: number, inviteeId: number) {
  const res = await fetch(`${baseUrl}/clubs/${clubId}/invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteeId }),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}
async function respond(inviteId: number, status: "accepted" | "declined") {
  const res = await fetch(`${baseUrl}/club-invites/${inviteId}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}
async function listInvites() {
  const res = await fetch(`${baseUrl}/club-invites`);
  return { status: res.status, body: await res.json() as Array<Record<string, unknown>> };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("POST /clubs/:id/invite — admin gating", () => {
  it("non-admin member gets 403 and no invite/notification is created", async () => {
    state.authPlayerId = MEMBER_ID;
    const { status, body } = await invite(CLUB_ID, INVITEE_ID);
    assert.equal(status, 403);
    assert.match(String(body.error), /admin/i);
    assert.equal(state.invites.length, 0);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.pushes.length, 0);
  });

  it("non-member gets 403 — only members can invite to a club", async () => {
    state.authPlayerId = STRANGER_ID;
    const { status } = await invite(CLUB_ID, INVITEE_ID);
    assert.equal(status, 403);
    assert.equal(state.invites.length, 0);
  });

  it("leader can invite — invite row is created and a club_invite notification is inserted", async () => {
    state.authPlayerId = LEADER_ID;
    const { status, body } = await invite(CLUB_ID, INVITEE_ID);
    assert.equal(status, 201);
    assert.equal(state.invites.length, 1);
    const inv = state.invites[0];
    assert.equal(inv.clubId, CLUB_ID);
    assert.equal(inv.inviteeId, INVITEE_ID);
    assert.equal(inv.inviterId, LEADER_ID);
    assert.equal(inv.status, "pending");
    assert.equal((body as { id: number }).id, inv.id);

    // Notification created for the invitee.
    assert.equal(state.notifications.length, 1);
    const note = state.notifications[0];
    assert.equal(note.playerId, INVITEE_ID);
    assert.equal(note.type, "club_invite");
    assert.equal(note.sourceId, inv.id);
    assert.equal(note.link, `/club/${CLUB_ID}`);
    assert.equal(note.read, false);

    // Push fan-out fired to the invitee.
    assert.equal(state.pushes.length, 1);
    assert.equal(state.pushes[0].playerId, INVITEE_ID);
  });
});

describe("POST /clubs/:id/invite — idempotency & validation", () => {
  it("duplicate invite is idempotent: no extra row, no extra notification, no extra push", async () => {
    state.authPlayerId = LEADER_ID;

    const first = await invite(CLUB_ID, INVITEE_ID);
    assert.equal(first.status, 201);
    assert.equal(state.invites.length, 1);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.pushes.length, 1);

    const second = await invite(CLUB_ID, INVITEE_ID);
    // Endpoint still answers 201 but onConflictDoNothing prevents a new row.
    assert.equal(second.status, 201);
    assert.equal(state.invites.length, 1, "duplicate should not insert a new invite");
    assert.equal(state.notifications.length, 1, "duplicate should not enqueue another notification");
    assert.equal(state.pushes.length, 1, "duplicate should not fire another push");
  });

  it("rejects inviting a player already in the club with 409", async () => {
    state.authPlayerId = LEADER_ID;
    const { status } = await invite(CLUB_ID, MEMBER_ID);
    assert.equal(status, 409);
    assert.equal(state.invites.length, 0);
    assert.equal(state.notifications.length, 0);
  });

  it("rejects self-invite with 400", async () => {
    state.authPlayerId = LEADER_ID;
    const { status } = await invite(CLUB_ID, LEADER_ID);
    assert.equal(status, 400);
  });

  it("requires authentication", async () => {
    state.authPlayerId = null;
    const { status } = await invite(CLUB_ID, INVITEE_ID);
    assert.equal(status, 401);
  });
});

describe("POST /club-invites/:id/respond", () => {
  async function seedPendingInvite() {
    state.authPlayerId = LEADER_ID;
    const { body } = await invite(CLUB_ID, INVITEE_ID);
    state.authPlayerId = INVITEE_ID;
    return body.id as number;
  }

  it("accept: invitee joins club, memberCount bumps, related notification is marked read", async () => {
    const inviteId = await seedPendingInvite();
    const beforeCount = state.clubs.get(CLUB_ID)!.memberCount;

    const { status, body } = await respond(inviteId, "accepted");
    assert.equal(status, 200);
    assert.equal(body.status, "accepted");

    // Membership transition.
    const invitee = state.players.get(INVITEE_ID)!;
    assert.equal(invitee.clubId, CLUB_ID);
    assert.equal(invitee.clubRole, "member");
    assert.equal(state.clubs.get(CLUB_ID)!.memberCount, beforeCount + 1);

    // Invite is closed.
    assert.equal(state.invites.find(i => i.id === inviteId)!.status, "accepted");

    // The club_invite notification for this invite is now read.
    const note = state.notifications.find(n => n.sourceId === inviteId && n.type === "club_invite");
    assert.ok(note, "club_invite notification exists");
    assert.equal(note!.read, true, "notification was marked read on respond");
  });

  it("decline: no membership change, memberCount unchanged, invite is closed", async () => {
    const inviteId = await seedPendingInvite();
    const beforeCount = state.clubs.get(CLUB_ID)!.memberCount;

    const { status, body } = await respond(inviteId, "declined");
    assert.equal(status, 200);
    assert.equal(body.status, "declined");

    const invitee = state.players.get(INVITEE_ID)!;
    assert.equal(invitee.clubId, null, "declined invitee must not join the club");
    assert.equal(state.clubs.get(CLUB_ID)!.memberCount, beforeCount);
    assert.equal(state.invites.find(i => i.id === inviteId)!.status, "declined");

    // Notification is still marked read on decline as well.
    const note = state.notifications.find(n => n.sourceId === inviteId && n.type === "club_invite");
    assert.equal(note!.read, true);
  });

  it("responding twice returns 409 the second time", async () => {
    const inviteId = await seedPendingInvite();
    const first = await respond(inviteId, "accepted");
    assert.equal(first.status, 200);

    const second = await respond(inviteId, "declined");
    assert.equal(second.status, 409);
  });

  it("only the invitee can respond — other players get 404", async () => {
    const inviteId = await seedPendingInvite();
    state.authPlayerId = STRANGER_ID;
    const { status } = await respond(inviteId, "accepted");
    assert.equal(status, 404);
  });

  it("requires authentication", async () => {
    const inviteId = await seedPendingInvite();
    state.authPlayerId = null;
    const { status } = await respond(inviteId, "accepted");
    assert.equal(status, 401);
  });
});

describe("GET /club-invites", () => {
  it("lists only the current player's pending invites, enriched with club data", async () => {
    // Seed one pending invite to INVITEE_ID and one accepted invite to filter out.
    state.authPlayerId = LEADER_ID;
    await invite(CLUB_ID, INVITEE_ID);
    await invite(CLUB_ID, STRANGER_ID);
    // Accept the stranger's invite so it should not appear in their pending list.
    state.authPlayerId = STRANGER_ID;
    const strangerInvite = state.invites.find(i => i.inviteeId === STRANGER_ID)!;
    await respond(strangerInvite.id, "accepted");

    state.authPlayerId = INVITEE_ID;
    const { status, body } = await listInvites();
    assert.equal(status, 200);
    assert.equal(body.length, 1, "only the invitee's pending invite is returned");
    assert.equal(body[0].inviteeId, INVITEE_ID);
    assert.equal(body[0].status, "pending");
    assert.equal((body[0].club as { id: number }).id, CLUB_ID);

    // Stranger has no pending invites (theirs was accepted).
    state.authPlayerId = STRANGER_ID;
    const strangerList = await listInvites();
    assert.equal(strangerList.body.length, 0);
  });

  it("requires authentication", async () => {
    state.authPlayerId = null;
    const { status } = await listInvites();
    assert.equal(status, 401);
  });
});
