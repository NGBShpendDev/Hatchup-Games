// Tests for GET /players/nearby. Locks in the privacy-critical rules:
//   - block list (both directions) excludes candidates
//   - visibility=hidden excludes candidates AND short-circuits the viewer
//   - minors are excluded from people-discovery results
//   - viewer with no city → { entries: [], locationRequired: true }
//   - distance buckets only when BOTH sides opted into "exact"
//   - raw coordinates never appear in the response payload
//
// The DB, Clerk auth, and safety helper are mocked via `node:test` module
// mocks so the route runs in isolation against in-memory state.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

// ── In-memory state ──────────────────────────────────────────────────────────
interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  locationVisibility: "exact" | "neighborhood" | "city" | "hidden";
  isMinor: boolean;
}
interface LocationRow {
  playerId: number;
  city: string | null;
  state: string | null;
  visibility: "exact" | "neighborhood" | "city" | "hidden";
  latEncrypted: string | null;
  lngEncrypted: string | null;
  updatedAt: Date;
}

const state = {
  viewerClerkId: "u_viewer",
  players: [] as PlayerRow[],
  locations: [] as LocationRow[],
  hiddenIds: [] as number[],
};

function resetState() {
  state.viewerClerkId = "u_viewer";
  state.players = [];
  state.locations = [];
  state.hiddenIds = [];
}

// ── Encryption helper matching artifacts/api-server/src/routes/players.ts ────
// SESSION_SECRET must be at least 16 chars for deriveLocationKey to return a key.
const TEST_SECRET = "test-session-secret-which-is-long-enough";
process.env.SESSION_SECRET = TEST_SECRET;
const KEY = createHash("sha256").update(TEST_SECRET).digest();

function encryptCoord(value: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
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
    ilike: () => ({}),
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
    loadMutualWorkoutPartnersForViewer: async () => new Map(),
  },
});

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: any) => {
        // The route calls findFirst by clerkId (attachPlayer) AND by id (the
        // viewer lookup). The mocked drizzle helpers tag each predicate with
        // the column reference object, but since the column markers below are
        // opaque `{}` we instead disambiguate by the value type/shape.
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
        const ids: number[] = args?.where?.vals ?? [];
        return state.players.filter(p => ids.includes(p.id));
      },
    },
    playerLocationTable: {
      findFirst: async (args: any) => {
        const v = args?.where?.val;
        return state.locations.find(l => l.playerId === v);
      },
      findMany: async (args: any) => {
        // Route filters by city = X AND state = Y AND playerId != viewer.
        // We pull the city/state/viewer from the `and` predicate.
        const andArgs: any[] = args?.where?.args ?? [];
        let city: string | null = null;
        let stateVal: string | null = null;
        let excludeId: number | null = null;
        for (const a of andArgs) {
          if (a.op === "eq" && typeof a.val === "string") {
            if (city === null) city = a.val;
            else stateVal = a.val;
          } else if (a.op === "ne" && typeof a.val === "number") {
            excludeId = a.val;
          }
        }
        return state.locations.filter(l =>
          l.city === city &&
          (l.state ?? "") === (stateVal ?? "") &&
          l.playerId !== excludeId,
        );
      },
    },
  },
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    playersTable: { id: {}, clerkId: {}, username: {} },
    playerLocationTable: { playerId: {}, city: {}, state: {} },
    hatchlingsTable: {},
    competitionsTable: {},
    liveEventsTable: {},
    eggsTable: {},
    fitnessActivitiesTable: {},
    playerBadgesTable: {},
    playerArtifactsTable: {},
    artifactsTable: {},
    groupMembersTable: {},
    groupsTable: {},
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
    locationVisibility: "city",
    isMinor: false,
    ...over,
  };
}

function makeLoc(over: Partial<LocationRow> & { playerId: number }): LocationRow {
  return {
    city: "Brooklyn",
    state: "NY",
    visibility: "city",
    latEncrypted: null,
    lngEncrypted: null,
    updatedAt: new Date("2026-05-28T12:00:00.000Z"),
    ...over,
  };
}

async function getNearby(qs = ""): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/players/nearby${qs}`);
  return { status: res.status, body: await res.json() };
}

function seedViewer(over: Partial<PlayerRow> = {}, locOver: Partial<LocationRow> = {}) {
  const viewer = makePlayer({ id: 1, clerkId: "u_viewer", username: "viewer", ...over });
  state.players.push(viewer);
  state.locations.push(makeLoc({ playerId: 1, ...locOver }));
  return viewer;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("GET /players/nearby — privacy rules", () => {
  it("viewer without a city → locationRequired: true and empty entries", async () => {
    state.players.push(makePlayer({ id: 1, clerkId: "u_viewer", username: "viewer" }));
    // No playerLocation row at all for the viewer.
    const { status, body } = await getNearby();
    assert.equal(status, 200);
    assert.deepEqual(body, { entries: [], city: null, locationRequired: true });
  });

  it("viewer with hidden visibility short-circuits with empty entries (not locationRequired)", async () => {
    seedViewer({ locationVisibility: "hidden" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_other", username: "other" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    const { status, body } = await getNearby();
    assert.equal(status, 200);
    assert.deepEqual(body, { entries: [], city: "Brooklyn", locationRequired: false });
  });

  it("excludes candidates with visibility=hidden", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_visible", username: "visible" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_hidden", username: "ghost", locationVisibility: "hidden" }));
    state.locations.push(makeLoc({ playerId: 3 }));

    const { body } = await getNearby();
    const ids = body.entries.map((e: any) => e.id);
    assert.deepEqual(ids, [2]);
  });

  it("excludes minors entirely", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_adult", username: "adult" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_kid", username: "kid", isMinor: true }));
    state.locations.push(makeLoc({ playerId: 3 }));

    const { body } = await getNearby();
    const ids = body.entries.map((e: any) => e.id);
    assert.deepEqual(ids, [2]);
  });

  it("excludes users blocked by the viewer or who have blocked the viewer (either direction)", async () => {
    seedViewer();
    // Three candidates in the city; getHiddenPlayerIds hides ids 2 and 4
    // (one is "viewer blocks them", one is "they block viewer" — both end up
    //  in the same hidden set, which is what the route consumes).
    state.players.push(makePlayer({ id: 2, clerkId: "u_blocked", username: "blocked" }));
    state.locations.push(makeLoc({ playerId: 2 }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_ok", username: "ok" }));
    state.locations.push(makeLoc({ playerId: 3 }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_blocker", username: "blocker" }));
    state.locations.push(makeLoc({ playerId: 4 }));
    state.hiddenIds = [2, 4];

    const { body } = await getNearby();
    const ids = body.entries.map((e: any) => e.id);
    assert.deepEqual(ids, [3]);
  });

  it("returns same_city bucket when viewer is exact but candidate is not", async () => {
    seedViewer(
      { locationVisibility: "exact" },
      {
        visibility: "exact",
        latEncrypted: encryptCoord(40.7128),
        lngEncrypted: encryptCoord(-74.006),
      },
    );
    // Candidate visibility is "city" — buckets should not be computed.
    state.players.push(makePlayer({ id: 2, clerkId: "u_city", username: "cityuser", locationVisibility: "city" }));
    state.locations.push(makeLoc({
      playerId: 2,
      visibility: "city",
      latEncrypted: encryptCoord(40.72),
      lngEncrypted: encryptCoord(-74.01),
    }));

    const { body } = await getNearby();
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].distanceBucket, "same_city");
  });

  it("returns same_city when candidate is exact but viewer is not", async () => {
    seedViewer({ locationVisibility: "city" }, { visibility: "city" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_exact", username: "ex", locationVisibility: "exact" }));
    state.locations.push(makeLoc({
      playerId: 2,
      visibility: "exact",
      latEncrypted: encryptCoord(40.72),
      lngEncrypted: encryptCoord(-74.01),
    }));

    const { body } = await getNearby();
    assert.equal(body.entries[0].distanceBucket, "same_city");
  });

  it("computes a real distance bucket only when BOTH sides are exact", async () => {
    seedViewer(
      { locationVisibility: "exact" },
      {
        visibility: "exact",
        latEncrypted: encryptCoord(40.7128),
        lngEncrypted: encryptCoord(-74.006),
      },
    );
    // Candidate ~0.5km away from viewer → expect under_1km.
    state.players.push(makePlayer({ id: 2, clerkId: "u_near", username: "near", locationVisibility: "exact" }));
    state.locations.push(makeLoc({
      playerId: 2,
      visibility: "exact",
      latEncrypted: encryptCoord(40.7173), // ~0.5km north
      lngEncrypted: encryptCoord(-74.006),
    }));
    // Candidate ~3km away → expect under_5km.
    state.players.push(makePlayer({ id: 3, clerkId: "u_mid", username: "mid", locationVisibility: "exact" }));
    state.locations.push(makeLoc({
      playerId: 3,
      visibility: "exact",
      latEncrypted: encryptCoord(40.74),
      lngEncrypted: encryptCoord(-74.006),
    }));

    const { body } = await getNearby();
    const byId = new Map(body.entries.map((e: any) => [e.id, e.distanceBucket]));
    assert.equal(byId.get(2), "under_1km");
    assert.equal(byId.get(3), "under_5km");
  });

  it("never includes raw coordinates in the response payload", async () => {
    seedViewer(
      { locationVisibility: "exact" },
      {
        visibility: "exact",
        latEncrypted: encryptCoord(40.7128),
        lngEncrypted: encryptCoord(-74.006),
      },
    );
    state.players.push(makePlayer({ id: 2, clerkId: "u_e", username: "e", locationVisibility: "exact" }));
    state.locations.push(makeLoc({
      playerId: 2,
      visibility: "exact",
      latEncrypted: encryptCoord(40.7173),
      lngEncrypted: encryptCoord(-74.006),
    }));

    const { body } = await getNearby();
    const serialized = JSON.stringify(body);
    // The actual numeric coordinates must not be exposed anywhere.
    assert.ok(!serialized.includes("40.7128"), "viewer latitude leaked");
    assert.ok(!serialized.includes("-74.006"), "viewer longitude leaked");
    assert.ok(!serialized.includes("40.7173"), "candidate latitude leaked");
    // Encrypted blobs must not leak either.
    assert.ok(!/latEncrypted|lngEncrypted/i.test(serialized), "encrypted blob field leaked");
    // Per-entry shape should be tight: only id/username/displayName/avatarUrl/city/distanceBucket.
    for (const entry of body.entries) {
      assert.deepEqual(
        Object.keys(entry).sort(),
        ["avatarUrl", "city", "displayName", "distanceBucket", "id", "username"],
      );
    }
  });
});
