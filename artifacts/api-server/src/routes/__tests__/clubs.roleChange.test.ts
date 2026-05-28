// Tests for PATCH /clubs/:id/members/:playerId on routes/clubs.ts.
//
// The role-change endpoint enforces several non-obvious rules:
//   - Only the owner can change roles (non-owners → 403).
//   - Owner cannot self-demote (must transfer ownership instead).
//   - Transferring ownership demotes the previous owner to officer.
//   - Target player must be a member of the same club (404 otherwise).
//
// We exercise the real Express router against an in-memory fake DB and
// mock auth so we can flip the calling player between requests.

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
  avatarUrl: string | null;
  level: number;
  rank: string | null;
  totalWins: number;
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

const state = {
  players: new Map<number, PlayerRow>(),
  clubs: new Map<number, ClubRow>(),
  authPlayerId: null as number | null,
};

function resetState() {
  state.players = new Map();
  state.clubs = new Map();
  state.authPlayerId = null;
  writeCounter.playerUpdates = 0;
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
    sendPushToPlayer: async () => {},
  },
});

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

const clubsTable = { id: col("clubs", "id") };
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

const writeCounter = { playerUpdates: 0 };

function updatePlayer(cond: Pred, vals: Record<string, unknown>) {
  writeCounter.playerUpdates++;
  const id = findPred(cond, "players", "id")?.val as number | undefined;
  const player = id !== undefined ? state.players.get(id) : undefined;
  if (player) Object.assign(player, vals);
}

interface FakeDb {
  query: {
    clubsTable: { findFirst: (a: { where?: Pred }) => Promise<ClubRow | undefined> };
    playersTable: { findFirst: (a: { where?: Pred }) => Promise<PlayerRow | undefined> };
  };
  insert: (table: unknown) => { values: (vals: Record<string, unknown>) => { onConflictDoNothing: () => { returning: () => Promise<unknown[]> }; returning: () => Promise<unknown[]> } };
  delete: (table: unknown) => { where: (cond: Pred) => Promise<void> };
  update: (table: unknown) => { set: (vals: Record<string, unknown>) => { where: (cond: Pred) => Promise<void> } };
  transaction: (fn: (tx: FakeDb) => Promise<void>) => Promise<void>;
}

const fakeDb: FakeDb = {
  query: {
    clubsTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "clubs", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.clubs.get(id);
      },
    },
    playersTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "players", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        return state.players.get(id);
      },
    },
  },
  insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }), returning: async () => [] }) }),
  delete: () => ({ where: async () => {} }),
  update: (table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async (cond: Pred) => {
        if (table === playersTable) updatePlayer(cond, vals);
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
    UpdateClubMemberRoleParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    UpdateClubMemberRoleBody: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    TransferClubOwnershipParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    TransferClubOwnershipBody: { safeParse: (d: unknown) => ({ success: true, data: d }) },
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
const OTHER_CLUB_ID = 200;
const OWNER_ID = 1;
const OFFICER_ID = 2;
const MEMBER_ID = 3;
const STRANGER_ID = 4;
const OTHER_CLUB_MEMBER_ID = 5;

function makePlayer(id: number, clubId: number | null, clubRole: string | null, name: string): PlayerRow {
  return {
    id, clerkId: `u_${id}`, username: name.toLowerCase(), displayName: name,
    avatarUrl: null, level: 1, rank: "bronze", totalWins: 0,
    clubId, clubRole,
  };
}

function seedDefault() {
  state.clubs.set(CLUB_ID, {
    id: CLUB_ID, name: "Dragons", description: "", memberCount: 3,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  state.clubs.set(OTHER_CLUB_ID, {
    id: OTHER_CLUB_ID, name: "Phoenix", description: "", memberCount: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  state.players.set(OWNER_ID, makePlayer(OWNER_ID, CLUB_ID, "owner", "Owner"));
  state.players.set(OFFICER_ID, makePlayer(OFFICER_ID, CLUB_ID, "officer", "Officer"));
  state.players.set(MEMBER_ID, makePlayer(MEMBER_ID, CLUB_ID, "member", "Member"));
  state.players.set(STRANGER_ID, makePlayer(STRANGER_ID, null, null, "Stranger"));
  state.players.set(OTHER_CLUB_MEMBER_ID, makePlayer(OTHER_CLUB_MEMBER_ID, OTHER_CLUB_ID, "member", "OtherClubber"));
}

beforeEach(() => {
  resetState();
  seedDefault();
});

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function patchRole(clubId: number, targetId: number, clubRole: string) {
  const res = await fetch(`${baseUrl}/clubs/${clubId}/members/${targetId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clubRole }),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("PATCH /clubs/:id/members/:playerId — authorization", () => {
  it("non-owner officer trying to change roles gets 403 (no state change)", async () => {
    state.authPlayerId = OFFICER_ID;
    const { status, body } = await patchRole(CLUB_ID, MEMBER_ID, "officer");
    assert.equal(status, 403);
    assert.match(String(body.error), /owner/i);
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "member");
  });

  it("plain member cannot change roles — 403", async () => {
    state.authPlayerId = MEMBER_ID;
    const { status } = await patchRole(CLUB_ID, OFFICER_ID, "member");
    assert.equal(status, 403);
    assert.equal(state.players.get(OFFICER_ID)!.clubRole, "officer");
  });

  it("non-member of the club cannot change roles — 403", async () => {
    state.authPlayerId = STRANGER_ID;
    const { status } = await patchRole(CLUB_ID, MEMBER_ID, "officer");
    assert.equal(status, 403);
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "member");
  });

  it("requires authentication", async () => {
    state.authPlayerId = null;
    const { status } = await patchRole(CLUB_ID, MEMBER_ID, "officer");
    assert.equal(status, 401);
  });
});

describe("PATCH /clubs/:id/members/:playerId — role transitions", () => {
  it("owner promotes a member to officer", async () => {
    state.authPlayerId = OWNER_ID;
    const { status, body } = await patchRole(CLUB_ID, MEMBER_ID, "officer");
    assert.equal(status, 200);
    assert.equal(body.clubRole, "officer");
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "officer");
    // Owner is unchanged.
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("owner demotes an officer back to member", async () => {
    state.authPlayerId = OWNER_ID;
    const { status, body } = await patchRole(CLUB_ID, OFFICER_ID, "member");
    assert.equal(status, 200);
    assert.equal(body.clubRole, "member");
    assert.equal(state.players.get(OFFICER_ID)!.clubRole, "member");
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("no-op: target already has the requested role — 200 with no DB write", async () => {
    state.authPlayerId = OWNER_ID;
    writeCounter.playerUpdates = 0;

    const { status, body } = await patchRole(CLUB_ID, OFFICER_ID, "officer");
    assert.equal(status, 200);
    assert.equal(body.clubRole, "officer");
    // Endpoint should short-circuit before issuing any player update.
    assert.equal(
      writeCounter.playerUpdates,
      0,
      "no-op role change must not write to the players table",
    );
    assert.equal(state.players.get(OFFICER_ID)!.clubRole, "officer");
  });

  it("no-op: member→member also short-circuits with no DB write", async () => {
    state.authPlayerId = OWNER_ID;
    writeCounter.playerUpdates = 0;

    const { status, body } = await patchRole(CLUB_ID, MEMBER_ID, "member");
    assert.equal(status, 200);
    assert.equal(body.clubRole, "member");
    assert.equal(writeCounter.playerUpdates, 0);
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "member");
  });
});

describe("PATCH /clubs/:id/members/:playerId — ownership transfer", () => {
  it("owner transfers ownership: target becomes owner, previous owner becomes officer", async () => {
    state.authPlayerId = OWNER_ID;
    const { status, body } = await patchRole(CLUB_ID, MEMBER_ID, "owner");
    assert.equal(status, 200);
    assert.equal(body.clubRole, "owner");
    assert.equal(state.players.get(MEMBER_ID)!.clubRole, "owner");
    assert.equal(
      state.players.get(OWNER_ID)!.clubRole,
      "officer",
      "previous owner must be demoted to officer on transfer",
    );
  });

  it("owner cannot self-demote — must transfer ownership instead", async () => {
    state.authPlayerId = OWNER_ID;
    const { status, body } = await patchRole(CLUB_ID, OWNER_ID, "member");
    assert.equal(status, 403);
    assert.match(String(body.error), /transferred|owner/i);
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });

  it("owner setting their own role to 'owner' is a no-op 200", async () => {
    state.authPlayerId = OWNER_ID;
    const { status, body } = await patchRole(CLUB_ID, OWNER_ID, "owner");
    assert.equal(status, 200);
    assert.equal(body.clubRole, "owner");
    assert.equal(state.players.get(OWNER_ID)!.clubRole, "owner");
  });
});

describe("PATCH /clubs/:id/members/:playerId — target validation", () => {
  it("target player who is not in the club returns 404", async () => {
    state.authPlayerId = OWNER_ID;
    const { status, body } = await patchRole(CLUB_ID, STRANGER_ID, "officer");
    assert.equal(status, 404);
    assert.match(String(body.error), /not found/i);
    assert.equal(state.players.get(STRANGER_ID)!.clubRole, null);
  });

  it("target player in a different club returns 404 (cross-club role change blocked)", async () => {
    state.authPlayerId = OWNER_ID;
    const { status } = await patchRole(CLUB_ID, OTHER_CLUB_MEMBER_ID, "officer");
    assert.equal(status, 404);
    assert.equal(state.players.get(OTHER_CLUB_MEMBER_ID)!.clubRole, "member");
    assert.equal(state.players.get(OTHER_CLUB_MEMBER_ID)!.clubId, OTHER_CLUB_ID);
  });

  it("unknown club id returns 404", async () => {
    state.authPlayerId = OWNER_ID;
    const { status } = await patchRole(99999, MEMBER_ID, "officer");
    assert.equal(status, 404);
  });
});
