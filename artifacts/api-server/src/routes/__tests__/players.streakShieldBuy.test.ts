// Contract tests for POST /players/me/streak-shield/buy
//
// Covers:
//   - Normal purchase succeeds (enough coins)
//   - Returns 400 not_enough_coins when balance is below cost (pre-check)
//   - Race-condition safety: DB update returns 0 rows when a concurrent
//     request already spent the coins, triggering a second 400 response
//     even though the application-level check had passed
//
// All external modules (Clerk, auth middleware, DB, safety helpers,
// badgeService) are replaced with lightweight in-memory fakes using
// Node's built-in `node:test` mock system, matching the pattern used
// by the other contract test suites in this directory.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── Constants ─────────────────────────────────────────────────────────────────

const STREAK_SHIELD_COST = 200;

// ── In-memory state ───────────────────────────────────────────────────────────

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string | null;
  coins: number;
  xp: number;
  level: number;
  rank: string;
  dailyRewardStreak: number;
  lastRewardClaimedAt: Date | null;
  streakFreezes: number;
  streakShields: number;
  isMinor: boolean | null;
}

const state = {
  authPlayerId: 1 as number | null,
  player: null as PlayerRow | null,
  updateRowsToReturn: null as Array<{ coins: number; streakShields: number }> | null,
};

function resetState() {
  state.authPlayerId = 1;
  state.player = null;
  state.updateRowsToReturn = null;
}

function makePlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 1,
    clerkId: "clerk_1",
    username: "tester",
    displayName: "Tester",
    coins: 500,
    xp: 1000,
    level: 5,
    rank: "Bronze",
    dailyRewardStreak: 0,
    lastRewardClaimedAt: null,
    streakFreezes: 0,
    streakShields: 0,
    isMinor: false,
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({
      userId: state.authPlayerId !== null ? `clerk_${state.authPlayerId}` : null,
    }),
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

mock.module("../safety.ts", {
  namedExports: {
    filterDiscoverableCandidates: async <T>(_viewerId: unknown, players: T[]): Promise<T[]> => players,
    getHiddenPlayerIds: async () => [] as number[],
  },
});

mock.module("../sharedGroups.ts", {
  namedExports: {
    loadMutualWorkoutPartnersForViewer: async () => new Map(),
  },
});

mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    locationUpdateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    fitnessLogLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    socialWriteLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    aiCoachLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    scanLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/minorGuard.ts", {
  namedExports: {
    blockMinorSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceHatchlingCap: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceCoachDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceBattleDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../services/badgeService.ts", {
  namedExports: {
    checkAndAwardBadges: async () => [],
    getDailyReward: (_day: number) => ({ day: 1, coins: 50, xp: 25, kind: "coins", label: "50 Coins", icon: "🪙" }),
    DAILY_REWARD_SCHEDULE: [],
    BADGE_MAP: {},
    computeLevelProgress: () => ({ level: 1, xp: 0, xpForNext: 100, progress: 0 }),
    awardBadge: async () => null,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (_c: unknown, v: unknown) => ({ __op: "eq", val: v }),
    and: (..._args: unknown[]) => ({ __op: "and" }),
    or: (..._args: unknown[]) => ({ __op: "or" }),
    gte: (_c: unknown, _v: unknown) => ({ __op: "gte" }),
    desc: () => ({ __op: "desc" }),
    lt: () => ({ __op: "lt" }),
    ne: () => ({ __op: "ne" }),
    ilike: () => ({ __op: "ilike" }),
    inArray: () => ({ __op: "inArray" }),
    notInArray: () => ({ __op: "notInArray" }),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({ __op: "sql" }),
      {
        raw: () => ({ __op: "sql.raw" }),
        join: () => ({ __op: "sql.join" }),
      },
    ),
  },
});

// Fake DB — covers the queries issued by the streak-shield/buy handler
const colRef = (name: string) => ({ __col: name });

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (_opts?: unknown) => {
        return state.player ? { ...state.player } : undefined;
      },
    },
    eggsTable: { findMany: async () => [] },
    playerArtifactsTable: { findMany: async () => [] },
    artifactsTable: { findMany: async () => [] },
    hatchlingsTable: { findMany: async () => [], findFirst: async () => undefined },
    competitionsTable: { findMany: async () => [] },
    liveEventsTable: { findMany: async () => [] },
    fitnessActivitiesTable: { findMany: async () => [] },
    playerBadgesTable: { findMany: async () => [], findFirst: async () => undefined },
    playerLocationTable: { findFirst: async () => undefined, findMany: async () => [] },
    groupMembersTable: { findMany: async () => [] },
    groupsTable: { findFirst: async () => undefined },
    challengeInvitesTable: { findMany: async () => [] },
    playerFollowsTable: { findMany: async () => [] },
  },
  update: (_table: unknown) => ({
    set: (_vals: Record<string, unknown>) => ({
      where: (_cond: unknown) => ({
        returning: async (_fields: unknown) => {
          // If the test wired a specific response, return it (simulates race)
          if (state.updateRowsToReturn !== null) {
            return state.updateRowsToReturn;
          }
          // Default: simulate a successful deduction
          if (state.player) {
            state.player.coins -= STREAK_SHIELD_COST;
            state.player.streakShields += 1;
            return [{ coins: state.player.coins, streakShields: state.player.streakShields }];
          }
          return [];
        },
      }),
    }),
  }),
  insert: (_table: unknown) => ({
    values: async (_row: Record<string, unknown>) => ({}),
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: async () => [] }),
      }),
      orderBy: () => ({ limit: async () => [] }),
    }),
  }),
};

const tableCols = (...names: string[]) =>
  Object.fromEntries(names.map(n => [n, colRef(n)]));

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable: tableCols(
      "id", "clerkId", "username", "displayName", "avatarUrl",
      "coins", "xp", "level", "rank", "rankScore",
      "dailyRewardStreak", "lastRewardClaimedAt", "streakFreezes", "streakShields",
      "locationVisibility", "isMinor", "isAdmin", "isVerified",
      "requireWorkoutApproval", "totalSteps", "totalWorkouts",
      "totalBattleWins", "currentStreak", "battleElo",
      "paidUntil", "trialEndsAt", "subscriptionTier",
      "top10LastCheckedAt", "top10ContextLabel",
      "emergencyContactName", "emergencyContactPhone",
      "autoReplenishShields", "shieldAutoReplenishThreshold", "lastShieldUsedAt",
    ),
    eggsTable: tableCols("id", "playerId", "rarity", "isHatched", "eggType"),
    hatchlingsTable: tableCols("id", "playerId", "name", "rarity", "level"),
    playerArtifactsTable: tableCols("id", "playerId", "artifactId", "isFeatured", "isEquipped", "featuredOrder", "earnedAt"),
    artifactsTable: tableCols("id", "name", "rarity", "type", "imageSlug", "isHidden"),
    competitionsTable: tableCols("id", "playerId"),
    liveEventsTable: tableCols("id"),
    fitnessActivitiesTable: tableCols("id", "playerId"),
    playerBadgesTable: tableCols("id", "playerId", "badgeKey"),
    playerLocationTable: tableCols("id", "playerId", "country", "state", "county", "city"),
    groupMembersTable: tableCols("id", "playerId", "groupId"),
    groupsTable: tableCols("id"),
    challengeInvitesTable: tableCols("id"),
    playerFollowsTable: tableCols("id", "followerId", "followedId"),
    emailResendAttemptsTable: tableCols("id", "key", "createdAt"),
    rateLimitAttemptsTable: tableCols("id", "scope", "key", "createdAt"),
  },
});

// ── Imports that depend on the mocks above ────────────────────────────────────

const express = (await import("express")).default;
const playersRouter = (await import("../players.ts")).default;

// ── Express server ─────────────────────────────────────────────────────────────

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

after(async () => { await closeServer(); });

beforeEach(() => { resetState(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postBuy() {
  const res = await fetch(`${baseUrl}/players/me/streak-shield/buy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /players/me/streak-shield/buy", () => {

  describe("successful purchase", () => {
    it("returns 200 with ok=true, updated shield count, and coins remaining", async () => {
      state.player = makePlayer({ coins: 500, streakShields: 2 });

      const { status, body } = await postBuy();

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.coinsSpent, STREAK_SHIELD_COST);
      assert.equal(typeof body.streakShields, "number", "streakShields should be a number");
      assert.equal(typeof body.coinsRemaining, "number", "coinsRemaining should be a number");
      assert.equal(body.coinsRemaining, 500 - STREAK_SHIELD_COST);
      assert.equal(body.streakShields, 3);
    });

    it("deducts exactly STREAK_SHIELD_COST coins from the balance", async () => {
      state.player = makePlayer({ coins: STREAK_SHIELD_COST, streakShields: 0 });

      const { status, body } = await postBuy();

      assert.equal(status, 200);
      assert.equal(body.coinsRemaining, 0, "balance should reach exactly 0, not go negative");
    });
  });

  describe("insufficient coins (pre-check)", () => {
    it("returns 400 not_enough_coins when coins < STREAK_SHIELD_COST", async () => {
      state.player = makePlayer({ coins: STREAK_SHIELD_COST - 1 });

      const { status, body } = await postBuy();

      assert.equal(status, 400);
      assert.equal(body.error, "not_enough_coins");
    });

    it("returns 400 not_enough_coins when player has 0 coins", async () => {
      state.player = makePlayer({ coins: 0 });

      const { status, body } = await postBuy();

      assert.equal(status, 400);
      assert.equal(body.error, "not_enough_coins");
    });
  });

  describe("race-condition safety (DB-level guard)", () => {
    it("returns 400 not_enough_coins when the DB update matches 0 rows (concurrent spend)", async () => {
      // Application-level check passes (coins look sufficient) …
      state.player = makePlayer({ coins: STREAK_SHIELD_COST });

      // … but the DB UPDATE returns 0 rows, simulating a concurrent request
      // that already deducted coins between the SELECT and this UPDATE.
      // The WHERE coins >= STREAK_SHIELD_COST clause on the UPDATE matched
      // nothing, so the handler must detect the empty result and reject.
      state.updateRowsToReturn = [];

      const { status, body } = await postBuy();

      assert.equal(status, 400);
      assert.equal(body.error, "not_enough_coins",
        "handler must reject when DB UPDATE returns 0 rows (race condition detected)");
    });

    it("does not return ok=true when the DB update matches 0 rows", async () => {
      state.player = makePlayer({ coins: 500 });
      state.updateRowsToReturn = [];

      const { status, body } = await postBuy();

      assert.notEqual(status, 200);
      assert.notEqual(body.ok, true);
    });

    it("succeeds normally when the concurrent check passes (rows returned)", async () => {
      state.player = makePlayer({ coins: 400, streakShields: 1 });
      // Simulate the DB confirming the update went through
      state.updateRowsToReturn = [{ coins: 400 - STREAK_SHIELD_COST, streakShields: 2 }];

      const { status, body } = await postBuy();

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.coinsRemaining, 400 - STREAK_SHIELD_COST);
      assert.equal(body.streakShields, 2);
    });
  });

  describe("player not found", () => {
    it("returns 404 when player does not exist", async () => {
      state.player = null;

      const { status, body } = await postBuy();

      assert.equal(status, 404);
      assert.ok(body.error, "should return an error field");
    });
  });
});
