// Tests for GET /leaderboards/scoped. Locks in the privacy-critical rules
// that mirror /players/nearby and /players/search:
//   - block list (both directions) excludes candidates from every scope
//   - visibility=hidden excludes from every non-world scope (canAppearInScope)
//   - visibility=city/neighborhood are only eligible for city/nearby boards
//   - minors are excluded from every scope (people-discovery surface)
//
// The DB, Clerk auth, safety helper, and subscription guards are mocked via
// `node:test` module mocks so the route runs in isolation against in-memory state.

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
  rank: string;
  rankScore: number;
  totalWins: number;
  totalSteps: number;
  totalWorkouts: number;
  totalBattleWins: number;
  currentStreak: number;
  xp: number;
  locationVisibility: "exact" | "neighborhood" | "city" | "hidden";
  isMinor: boolean;
}

interface LocationRow {
  playerId: number;
  country: string | null;
  state: string | null;
  county: string | null;
  city: string | null;
}

const state = {
  viewerClerkId: "u_viewer",
  players: [] as PlayerRow[],
  locations: [] as LocationRow[],
  hiddenIds: [] as number[],
  allowedScopes: ["world", "country", "state", "county", "city", "nearby"] as string[],
};

function resetState() {
  state.viewerClerkId = "u_viewer";
  state.players = [];
  state.locations = [];
  state.hiddenIds = [];
  state.allowedScopes = ["world", "country", "state", "county", "city", "nearby"];
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

// canAppearInScope is the real policy from routes/locations.ts; re-implement
// here so we don't have to drag in the entire locations router (which would
// pull in DB-touching imports).
mock.module("../locations.ts", {
  namedExports: {
    canAppearInScope: (visibility: string | null | undefined, scope: string): boolean => {
      if (scope === "world") return true;
      const v = visibility ?? "city";
      if (v === "hidden") return false;
      if (v === "exact") return true;
      return scope === "city" || scope === "nearby";
    },
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (req: any, _res: any, next: () => void) => {
      req.clerkUserId = state.viewerClerkId;
      next();
    },
    attachPlayer: (req: any, res: any, next: () => void) => {
      const player = state.players.find(p => p.clerkId === req.clerkUserId);
      if (!player) { res.status(404).json({ error: "no player" }); return; }
      req.playerId = player.id;
      next();
    },
  },
});

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (req: any, _res: any, next: () => void) => {
      req.entitlement = { features: { allowedScopes: state.allowedScopes } };
      next();
    },
  },
});

// drizzle helpers — opaque markers so we can introspect predicates.
mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...args: unknown[]) => ({ op: "and", args }),
    or: (...args: unknown[]) => ({ op: "or", args }),
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    gte: () => ({}),
    desc: () => ({ op: "desc" }),
    notInArray: () => ({}),
  },
});

const colMarker = (name: string) => ({ __col: name } as any);
const fakeDb = {
  query: {
    playersTable: {
      findMany: async () => state.players.slice(),
    },
    playerLocationTable: {
      findFirst: async (args: any) => {
        const v = args?.where?.val;
        if (typeof v === "number") return state.locations.find(l => l.playerId === v);
        return undefined;
      },
      findMany: async (args: any) => {
        // The route builds either eq(country=...) or and(eq(country=...), eq(state=...)) etc.
        const where = args?.where;
        const eqs: Array<{ field: string; val: any }> = [];
        const visit = (n: any) => {
          if (!n) return;
          if (n.op === "eq" && (n.col as any)?.__col) {
            eqs.push({ field: (n.col as any).__col, val: n.val });
          } else if (n.args) for (const a of n.args) visit(a);
        };
        visit(where);
        return state.locations.filter(l =>
          eqs.every(({ field, val }) => (l as any)[field] === val),
        );
      },
    },
    hatchlingsTable: { findMany: async () => [] },
    playerArtifactsTable: { findMany: async () => [] },
    personalRecordsTable: { findMany: async () => [] },
    fitnessActivitiesTable: { findMany: async () => [] },
  },
  select: () => ({ from: () => ({ orderBy: () => ({ limit: async () => [] }), where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    playersTable: { id: colMarker("id"), rankScore: colMarker("rankScore"), totalWins: colMarker("totalWins"), battleElo: colMarker("battleElo") },
    playerLocationTable: {
      playerId: colMarker("playerId"),
      country: colMarker("country"),
      state: colMarker("state"),
      county: colMarker("county"),
      city: colMarker("city"),
    },
    hatchlingsTable: {},
    fitnessActivitiesTable: {},
    personalRecordsTable: {},
    playerArtifactsTable: {},
    artifactsTable: {},
  },
});

mock.module("@workspace/api-zod", {
  namedExports: {
    GetGlobalLeaderboardQueryParams: { safeParse: (d: any) => ({ success: true, data: d }) },
    GetModeLeaderboardQueryParams: { safeParse: (d: any) => ({ success: true, data: d }) },
  },
});

// ── Imports after mocks ──────────────────────────────────────────────────────
const express = (await import("express")).default;
const leaderboardsRouter = (await import("../leaderboards.ts")).default;

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(leaderboardsRouter);
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
    rank: "Bronze",
    rankScore: 100,
    totalWins: 0,
    totalSteps: 1000,
    totalWorkouts: 5,
    totalBattleWins: 0,
    currentStreak: 1,
    xp: 1000,
    locationVisibility: "city",
    isMinor: false,
    ...over,
  };
}

function makeLoc(over: Partial<LocationRow> & { playerId: number }): LocationRow {
  return {
    country: "USA",
    state: "NY",
    county: "Kings",
    city: "Brooklyn",
    ...over,
  };
}

async function getScoped(scope: string, metric = "xp"): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/leaderboards/scoped?scope=${scope}&metric=${metric}`);
  return { status: res.status, body: await res.json() };
}

function seedViewer(over: Partial<PlayerRow> = {}, locOver: Partial<LocationRow> = {}) {
  const viewer = makePlayer({ id: 1, clerkId: "u_viewer", username: "viewer", xp: 5000, ...over });
  state.players.push(viewer);
  state.locations.push(makeLoc({ playerId: 1, ...locOver }));
  return viewer;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("GET /leaderboards/scoped — privacy rules", () => {
  it("excludes users blocked by the viewer or who have blocked the viewer (either direction)", async () => {
    seedViewer({ locationVisibility: "exact" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_blocked", username: "blocked", locationVisibility: "exact", xp: 9000 }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_ok", username: "ok", locationVisibility: "exact", xp: 8000 }));
    state.locations.push(makeLoc({ playerId: 3 }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_blocker", username: "blocker", locationVisibility: "exact", xp: 7000 }));
    state.locations.push(makeLoc({ playerId: 4 }));
    state.hiddenIds = [2, 4]; // bi-directional block set

    const { status, body } = await getScoped("city", "xp");
    assert.equal(status, 200);
    const ids = body.entries.map((e: any) => e.playerId);
    assert.ok(!ids.includes(2), "viewer-blocked candidate must be hidden");
    assert.ok(!ids.includes(4), "candidate-blocked-viewer must also be hidden");
    assert.ok(ids.includes(3), "non-blocked candidate must remain");
  });

  it("excludes minors from every scope (people-discovery rule)", async () => {
    seedViewer({ locationVisibility: "exact" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_adult", username: "adult", locationVisibility: "exact" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_kid", username: "kid", isMinor: true, locationVisibility: "exact" }));
    state.locations.push(makeLoc({ playerId: 3 }));

    for (const scope of ["world", "country", "state", "county", "city", "nearby"]) {
      const { body } = await getScoped(scope, "xp");
      const ids = body.entries.map((e: any) => e.playerId);
      assert.ok(!ids.includes(3), `minor must not appear on the ${scope} board`);
      assert.ok(ids.includes(2), `adult must appear on the ${scope} board`);
    }
  });

  it("excludes hidden-visibility players from every non-world scope", async () => {
    seedViewer({ locationVisibility: "exact" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_v", username: "visible", locationVisibility: "exact" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_h", username: "ghost", locationVisibility: "hidden" }));
    state.locations.push(makeLoc({ playerId: 3 }));

    // hidden user still appears on world
    const world = await getScoped("world", "xp");
    const worldIds = world.body.entries.map((e: any) => e.playerId);
    assert.ok(worldIds.includes(3), "hidden user is still ranked on the world board");

    for (const scope of ["country", "state", "county", "city", "nearby"]) {
      const { body } = await getScoped(scope, "xp");
      const ids = body.entries.map((e: any) => e.playerId);
      assert.ok(!ids.includes(3), `hidden user must NOT appear on the ${scope} board`);
    }
  });

  it("city/neighborhood visibility only appears on city or nearby boards", async () => {
    seedViewer({ locationVisibility: "exact" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_city", username: "cityuser", locationVisibility: "city" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_nbhd", username: "nbhduser", locationVisibility: "neighborhood" }));
    state.locations.push(makeLoc({ playerId: 3 }));

    for (const scope of ["country", "state", "county"]) {
      const { body } = await getScoped(scope, "xp");
      const ids = body.entries.map((e: any) => e.playerId);
      assert.ok(!ids.includes(2), `city-visibility user must not appear on ${scope}`);
      assert.ok(!ids.includes(3), `neighborhood-visibility user must not appear on ${scope}`);
    }
    for (const scope of ["city", "nearby"]) {
      const { body } = await getScoped(scope, "xp");
      const ids = body.entries.map((e: any) => e.playerId);
      assert.ok(ids.includes(2), `city-visibility user must appear on ${scope}`);
      assert.ok(ids.includes(3), `neighborhood-visibility user must appear on ${scope}`);
    }
  });

  it("combines block + minor + hidden exclusions in a single response", async () => {
    seedViewer({ locationVisibility: "exact" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_ok",     username: "ok",     locationVisibility: "exact" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_hidden", username: "hid",    locationVisibility: "hidden" }));
    state.locations.push(makeLoc({ playerId: 3 }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_minor",  username: "kid",    locationVisibility: "exact", isMinor: true }));
    state.locations.push(makeLoc({ playerId: 4 }));
    state.players.push(makePlayer({ id: 5, clerkId: "u_block",  username: "blocked",locationVisibility: "exact" }));
    state.locations.push(makeLoc({ playerId: 5 }));
    state.hiddenIds = [5];

    const { body } = await getScoped("city", "xp");
    const ids = body.entries.map((e: any) => e.playerId).filter((id: number) => id !== 1);
    assert.deepEqual(ids, [2], "only the non-blocked, non-hidden, non-minor candidate should remain");
  });
});
