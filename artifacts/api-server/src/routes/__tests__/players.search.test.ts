// Tests for GET /players/search. Locks in the same privacy-critical rules
// that /players/nearby enforces, so blocked / hidden / minor accounts never
// leak back into search-based discovery:
//   - block list (both directions) excludes candidates
//   - visibility=hidden excludes candidates
//   - minors are excluded entirely from people-discovery results
//   - the viewer is always excluded from their own search results
//
// The DB, Clerk auth, and safety helper are mocked via `node:test` module
// mocks so the route runs in isolation against in-memory state.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ──────────────────────────────────────────────────────────
interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  creatorBadge: string | null;
  locationVisibility: "exact" | "neighborhood" | "city" | "hidden";
  isMinor: boolean;
}

const state = {
  viewerClerkId: "u_viewer",
  players: [] as PlayerRow[],
  hiddenIds: [] as number[],
};

function resetState() {
  state.viewerClerkId = "u_viewer";
  state.players = [];
  state.hiddenIds = [];
}

// ── Mocks ────────────────────────────────────────────────────────────────────
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.viewerClerkId }),
  },
});

mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async (_viewerId: number) => state.hiddenIds,
    // Mirror the real helper in safety.ts so the route's shared exclusion
    // call (blocked / hidden-visibility / minor) is exercised under the same
    // in-memory state the rest of this suite uses.
    filterDiscoverableCandidates: async <T extends { id: number; locationVisibility: string | null; isMinor: boolean | null }>(
      _viewerId: number | null | undefined,
      players: T[],
      options?: { allowVisibility?: (v: string | null) => boolean },
    ): Promise<T[]> => {
      const blocked = new Set(state.hiddenIds);
      const allow = options?.allowVisibility ?? ((v: string | null) => v !== "hidden");
      return players.filter(p => !blocked.has(p.id) && allow(p.locationVisibility) && !p.isMinor);
    },
  },
});

// drizzle helpers: encode predicates as opaque markers we can inspect.
mock.module("drizzle-orm", {
  namedExports: {
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    gte: () => ({}),
    desc: () => ({}),
    ilike: (col: unknown, pattern: unknown) => ({ op: "ilike", col, pattern }),
    inArray: (col: unknown, vals: unknown[]) => ({ op: "inArray", col, vals }),
  },
});

function matchesIlike(value: string | null | undefined, pattern: string): boolean {
  if (value == null) return false;
  const body = pattern.replace(/^%|%$/g, "").toLowerCase();
  return value.toLowerCase().includes(body);
}

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: any) => {
        const v = args?.where?.val;
        if (typeof v === "string") {
          return state.players.find(p => p.clerkId === v);
        }
        if (typeof v === "number") {
          return state.players.find(p => p.id === v);
        }
        return undefined;
      },
      findMany: async (args: any) => {
        // The /players/search route always builds an `and(or(ilike,ilike), ne)`
        // predicate (viewer-excluded) when a viewer is attached. Reconstruct
        // that filter against our in-memory rows.
        const where = args?.where;
        let needle: string | null = null;
        let excludeId: number | null = null;
        const visit = (n: any) => {
          if (!n) return;
          if (n.op === "ilike") needle = n.pattern as string;
          else if (n.op === "ne" && typeof n.val === "number") excludeId = n.val;
          else if (n.args) for (const a of n.args) visit(a);
        };
        visit(where);
        let rows = state.players.filter(p => {
          if (excludeId != null && p.id === excludeId) return false;
          if (needle && !(matchesIlike(p.username, needle) || matchesIlike(p.displayName, needle))) return false;
          return true;
        });
        rows.sort((a, b) => a.username.localeCompare(b.username));
        if (typeof args?.limit === "number") rows = rows.slice(0, args.limit);
        return rows;
      },
    },
    groupMembersTable: {
      findMany: async () => [],
    },
    groupsTable: {
      findMany: async () => [],
    },
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable: { id: {}, clerkId: {}, username: {}, displayName: {} },
    playerLocationTable: { playerId: {}, city: {}, state: {} },
    hatchlingsTable: {},
    competitionsTable: {},
    liveEventsTable: {},
    eggsTable: {},
    fitnessActivitiesTable: {},
    playerBadgesTable: {},
    playerArtifactsTable: {},
    artifactsTable: {},
    groupMembersTable: { playerId: {}, groupId: {} },
    groupsTable: { id: {}, name: {} },
  },
});

mock.module("@workspace/api-zod", {
  namedExports: {
    CreatePlayerBody: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    UpdatePlayerBody: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    GetPlayerParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    UpdatePlayerParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    GetPlayerDashboardParams: { safeParse: (d: unknown) => ({ success: true, data: d }) },
  },
});

mock.module("../../services/badgeService.ts", {
  namedExports: {
    BADGE_MAP: {},
    computeLevelProgress: () => ({}),
    getDailyReward: () => ({}),
  },
});

// ── Imports after mocks ──────────────────────────────────────────────────────
const express = (await import("express")).default;
const playersRouter = (await import("../players.ts")).default;

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(playersRouter);
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

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makePlayer(over: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  return {
    displayName: over.username,
    avatarUrl: null,
    creatorBadge: null,
    locationVisibility: "city",
    isMinor: false,
    ...over,
  };
}

async function search(q: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/players/search?q=${encodeURIComponent(q)}`);
  return { status: res.status, body: await res.json() };
}

function seedViewer(over: Partial<PlayerRow> = {}) {
  const viewer = makePlayer({ id: 1, clerkId: "u_viewer", username: "viewer", ...over });
  state.players.push(viewer);
  return viewer;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("GET /players/search — privacy rules", () => {
  it("returns matching candidates and excludes the viewer themselves", async () => {
    seedViewer({ username: "alice" }); // viewer's username also matches the query
    state.players.push(makePlayer({ id: 2, clerkId: "u_a", username: "alicebob" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_b", username: "alicecat" }));

    const { status, body } = await search("alice");
    assert.equal(status, 200);
    const ids = body.map((p: any) => p.id);
    assert.deepEqual(ids.sort(), [2, 3]);
    assert.ok(!ids.includes(1), "viewer must not appear in their own search results");
  });

  it("excludes candidates with visibility=hidden", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_v", username: "searchzvisible" }));
    state.players.push(makePlayer({
      id: 3,
      clerkId: "u_g",
      username: "searchzghost",
      locationVisibility: "hidden",
    }));

    const { body } = await search("searchz");
    const ids = body.map((p: any) => p.id);
    assert.deepEqual(ids, [2]);
  });

  it("excludes minors entirely from search results", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_adult", username: "fitzadult" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_kid", username: "fitzkid", isMinor: true }));

    const { body } = await search("fitz");
    const ids = body.map((p: any) => p.id);
    assert.deepEqual(ids, [2]);
  });

  it("excludes users blocked by the viewer or who have blocked the viewer (either direction)", async () => {
    seedViewer();
    // ids 2 + 4 are in the hidden set (one blocks viewer, one is blocked by viewer).
    state.players.push(makePlayer({ id: 2, clerkId: "u_blocked", username: "userzblocked" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_ok",      username: "userzok" }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_blocker", username: "userzblocker" }));
    state.hiddenIds = [2, 4];

    const { body } = await search("userz");
    const ids = body.map((p: any) => p.id);
    assert.deepEqual(ids, [3]);
  });

  it("combines all three exclusions in a single query", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_ok",     username: "teamzok" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_hidden", username: "teamzhidden", locationVisibility: "hidden" }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_minor",  username: "teamzminor",  isMinor: true }));
    state.players.push(makePlayer({ id: 5, clerkId: "u_block",  username: "teamzblock" }));
    state.hiddenIds = [5];

    const { body } = await search("teamz");
    const ids = body.map((p: any) => p.id);
    assert.deepEqual(ids, [2]);
  });

  it("returns an empty array for an empty query without leaking anyone", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_a", username: "alpha" }));

    const res = await fetch(`${baseUrl}/players/search?q=`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });
});
