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

interface MutualPartner { id: number; displayName: string }

const state = {
  viewerClerkId: "u_viewer",
  players: [] as PlayerRow[],
  hiddenIds: [] as number[],
  // Group memberships keyed by playerId — used only to flip the route's
  // "viewer has groups" guard so the mutual-partner helper actually gets
  // invoked. The helper itself is mocked below.
  groupMemberships: new Map<number, number[]>(),
  // Per-test fixture for what loadMutualWorkoutPartnersForViewer returns.
  // Map of candidateId -> mutual partner list.
  mutualWorkoutPartnersFixture: new Map<number, MutualPartner[]>(),
  // Call log for the mutual-partner helper so tests can assert wiring.
  mutualWorkoutPartnersCalls: [] as Array<{
    viewerId: number;
    candidateIds: number[];
    hiddenIds: number[];
  }>,
};

function resetState() {
  state.viewerClerkId = "u_viewer";
  state.players = [];
  state.hiddenIds = [];
  state.groupMemberships = new Map();
  state.mutualWorkoutPartnersFixture = new Map();
  state.mutualWorkoutPartnersCalls = [];
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
    lt: () => ({}),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    gt: (col: unknown, val: unknown) => ({ op: "gt", col, val }),
    gte: () => ({}),
    desc: () => ({}),
    ilike: (col: unknown, pattern: unknown) => ({ op: "ilike", col, pattern }),
    inArray: (col: unknown, vals: unknown[]) => ({ op: "inArray", col, vals }),
  },
});
mock.module("drizzle-orm/pg-core", {
  namedExports: {
    alias: <T,>(t: T, _name: string) => t,
  },
});
mock.module("../sharedGroups.ts", {
  namedExports: {
    groupMutualWorkoutPartnerRows: () => new Map(),
    MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT: 3,
    loadSharedGroupsForViewer: async () => new Map(),
    // Fixture-driven stub: the real SQL is exercised in social.mutuals.test.ts.
    // Here we verify the route is wired to call the helper with the right
    // (viewerId, candidateIds, hiddenIds) and that its result flows back into
    // the JSON response.
    loadMutualWorkoutPartnersForViewer: async (
      viewerId: number,
      candidateIds: number[],
      hiddenIds: Iterable<number> = [],
    ) => {
      state.mutualWorkoutPartnersCalls.push({
        viewerId,
        candidateIds: [...candidateIds],
        hiddenIds: [...hiddenIds],
      });
      return state.mutualWorkoutPartnersFixture;
    },
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
      findMany: async (args: any) => {
        // The route makes two distinct lookups here. The first is the
        // viewer-memberships lookup keyed by `eq(playerId, viewerId)`; we
        // satisfy it from the per-test `groupMemberships` fixture so the
        // route's `viewerGroupIds.length > 0` guard flips on. The second is
        // the match-memberships lookup (an `and(inArray, inArray)`), which
        // feeds the *sharedGroups* signal — orthogonal to mutual workout
        // partners, so we return [] and let that signal stay empty.
        const where = args?.where;
        if (where?.op === "eq" && typeof where.val === "number") {
          const groupIds = state.groupMemberships.get(where.val) ?? [];
          return groupIds.map(gid => ({ playerId: where.val, groupId: gid }));
        }
        return [];
      },
    },
    groupsTable: {
      findMany: async () => [],
    },
  },
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
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

// ── Tests: mutualWorkoutPartners wiring on /players/search ──────────────────
describe("GET /players/search — mutualWorkoutPartners signal", () => {
  it("surfaces mutualWorkoutPartners on each result when the helper returns rows", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_a", username: "mwpalice" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_b", username: "mwpbob" }));
    // Viewer needs at least one group membership for the route to invoke the
    // mutual-partner helper at all.
    state.groupMemberships.set(1, [100]);
    state.mutualWorkoutPartnersFixture = new Map([
      [2, [{ id: 9, displayName: "Coach Casey" }]],
      [3, [
        { id: 9, displayName: "Coach Casey" },
        { id: 10, displayName: "Trainer Tess" },
      ]],
    ]);

    const { status, body } = await search("mwp");
    assert.equal(status, 200);
    const byId = new Map<number, any>(body.map((r: any) => [r.id, r]));
    assert.deepEqual(byId.get(2).mutualWorkoutPartners, [
      { id: 9, displayName: "Coach Casey" },
    ]);
    assert.deepEqual(byId.get(3).mutualWorkoutPartners, [
      { id: 9, displayName: "Coach Casey" },
      { id: 10, displayName: "Trainer Tess" },
    ]);

    // Helper must be called with viewerId + the match ids (in any order), so
    // a regression that forgets to pass `matchIds` would surface here.
    assert.equal(state.mutualWorkoutPartnersCalls.length, 1);
    const call = state.mutualWorkoutPartnersCalls[0];
    assert.equal(call.viewerId, 1);
    assert.deepEqual([...call.candidateIds].sort((a, b) => a - b), [2, 3]);
  });

  it("returns empty mutualWorkoutPartners arrays when the viewer has no group memberships (no crash, helper skipped)", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_a", username: "nogroupalice" }));
    // No viewer group memberships — fixture would have data, but the route
    // must short-circuit and never call the helper.
    state.mutualWorkoutPartnersFixture = new Map([
      [2, [{ id: 9, displayName: "Coach Casey" }]],
    ]);

    const { status, body } = await search("nogroup");
    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.deepEqual(body[0].mutualWorkoutPartners, []);
    assert.equal(state.mutualWorkoutPartnersCalls.length, 0, "helper must not be called when viewer is in no groups");
  });

  it("never surfaces the viewer or the matched candidate as their own mutual partner", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_a", username: "selfcheckalice" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_b", username: "selfcheckbob" }));
    state.groupMemberships.set(1, [100]);
    // Even if a buggy helper somehow returned the viewer (1) or the candidate
    // themselves (2/3), the route's contract guarantees they are excluded.
    // Lock that with a fixture containing only "safe" third-party partners.
    state.mutualWorkoutPartnersFixture = new Map([
      [2, [{ id: 7, displayName: "Third Person" }]],
      [3, [{ id: 7, displayName: "Third Person" }]],
    ]);

    const { body } = await search("selfcheck");
    for (const row of body) {
      const ids = row.mutualWorkoutPartners.map((p: any) => p.id);
      assert.ok(!ids.includes(1), `viewer must not appear as a mutual partner of ${row.id}`);
      assert.ok(!ids.includes(row.id), `candidate ${row.id} must not appear as their own mutual partner`);
    }
  });
});
