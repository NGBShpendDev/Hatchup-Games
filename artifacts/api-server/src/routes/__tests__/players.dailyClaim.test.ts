// Contract tests for POST /players/me/daily-claim
//
// Covers every documented branch in the daily-claim handler:
//   - First-ever claim → streak day 1
//   - Consecutive-day claim → streak increments
//   - Missed-day claim → streak resets to 1, streakBroken=true
//   - Double-claim on the same UTC day → 400 already_claimed_today
//   - rare_egg bonus → adds a Rare egg to the incubator
//   - epic_egg bonus → adds an Epic egg to the incubator
//   - streak_freeze bonus → streakFreezeGranted=true, DB update issued
//   - Incubator at full capacity (6 eggs) → eggAdded=false
//
// All external modules (Clerk, auth middleware, DB, safety helpers,
// badgeService) are replaced with lightweight in-memory fakes using
// Node's built-in `node:test` mock system, matching the pattern used
// by the other contract test suites in this directory.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

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

interface EggRow {
  id?: number;
  playerId: number;
  rarity: string;
  isHatched: boolean;
  eggType?: string;
  stepsRequired?: number;
  name?: string;
  description?: string;
  realm?: string;
}

interface DailyReward {
  day: number;
  coins: number;
  xp: number;
  bonus?: string;
  kind: string;
  label: string;
  icon: string;
}

const state = {
  authPlayerId: 1 as number | null,
  player: null as PlayerRow | null,
  eggs: [] as EggRow[],
  eggsInserted: [] as EggRow[],
  // All db.update().set(vals) calls are recorded here in order
  playerUpdates: [] as Record<string, unknown>[],
  rewardForDay: (_day: number): DailyReward => ({
    day: 1, coins: 50, xp: 25, kind: "coins", label: "50 Coins", icon: "🪙",
  }),
};

function resetState() {
  state.authPlayerId = 1;
  state.player = null;
  state.eggs = [];
  state.eggsInserted = [];
  state.playerUpdates = [];
  state.rewardForDay = (_day: number): DailyReward => ({
    day: 1, coins: 50, xp: 25, kind: "coins", label: "50 Coins", icon: "🪙",
  });
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

// Helper: UTC date string "YYYY-MM-DD" for a given offset from today
function utcDaysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ── Mocks — must all be declared before router import ────────────────────────

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
    filterDiscoverableCandidates: async <T>(
      _viewerId: unknown,
      players: T[],
    ): Promise<T[]> => players,
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
    getDailyReward: (day: number) => state.rewardForDay(day),
    DAILY_REWARD_SCHEDULE: [],
    BADGE_MAP: {},
    computeLevelProgress: () => ({ level: 1, xp: 0, xpForNext: 100, progress: 0 }),
    awardBadge: async () => null,
  },
});

// drizzle-orm operators — opaque markers (the fake db ignores where predicates)
mock.module("drizzle-orm", {
  namedExports: {
    eq: (_c: unknown, v: unknown) => ({ __op: "eq", val: v }),
    and: (..._args: unknown[]) => ({ __op: "and" }),
    or: (..._args: unknown[]) => ({ __op: "or" }),
    gte: () => ({ __op: "gte" }),
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

// Fake DB — minimal surface covering daily-claim's actual queries
const colRef = (name: string) => ({ __col: name });

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (_opts?: unknown) => {
        return state.player ? { ...state.player } : undefined;
      },
    },
    eggsTable: {
      findMany: async (_opts?: unknown) => {
        return state.eggs.map(e => ({ ...e }));
      },
    },
    playerArtifactsTable: {
      findMany: async (_opts?: unknown) => [],
    },
    artifactsTable: {
      findMany: async (_opts?: unknown) => [],
    },
    hatchlingsTable: {
      findMany: async (_opts?: unknown) => [],
      findFirst: async (_opts?: unknown) => undefined,
    },
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
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        state.playerUpdates.push(vals);
        // Propagate scalar fields so a same-test re-read sees the update
        if (state.player) {
          if (typeof vals.dailyRewardStreak === "number") {
            state.player.dailyRewardStreak = vals.dailyRewardStreak;
          }
          if (vals.lastRewardClaimedAt instanceof Date) {
            state.player.lastRewardClaimedAt = vals.lastRewardClaimedAt;
          }
          // Simulate SQL increment expressions for numeric shield/freeze fields
          if (
            vals.streakShields !== undefined &&
            typeof vals.streakShields === "object" &&
            vals.streakShields !== null &&
            "__op" in (vals.streakShields as object)
          ) {
            state.player.streakShields = (state.player.streakShields ?? 0) + 1;
          }
        }
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: async (row: Record<string, unknown>) => {
      // Capture any egg inserts (eggs have a `rarity` field)
      if (typeof row.rarity === "string" && typeof row.playerId === "number") {
        state.eggsInserted.push(row as unknown as EggRow);
        state.eggs.push({ ...row, isHatched: false } as EggRow);
      }
      return {};
    },
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

// Table stubs — only fields that players.ts references by name matter here
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

// ── Imports that depend on the mocks above ───────────────────────────────────

const express = (await import("express")).default;
const playersRouter = (await import("../players.ts")).default;

// ── Express server ───────────────────────────────────────────────────────────

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
  closeServer = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

beforeEach(() => { resetState(); });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function post(path: string, body: unknown = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /players/me/daily-claim", () => {
  describe("first-time claim (no prior claim)", () => {
    it("returns ok=true with streakDay=1 and correct reward values", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null, dailyRewardStreak: 0 });
      state.rewardForDay = () => ({
        day: 1, coins: 50, xp: 25, kind: "coins", label: "50 Coins", icon: "🪙",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.streakDay, 1);
      assert.equal(body.newStreakDay, 1);
      assert.equal(body.coinsGranted, 50);
      assert.equal(body.xpGranted, 25);
      assert.equal(body.streakBroken, false);
      assert.equal(body.eggAdded, false);
      assert.equal(body.bonus, null);
      assert.ok(Array.isArray(body.newBadges), "newBadges should be an array");
    });

    it("stores lastRewardClaimedAt and dailyRewardStreak=1 in the DB update", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null, dailyRewardStreak: 0 });

      await post("/players/me/daily-claim");

      assert.ok(state.playerUpdates.length > 0, "DB update should have been called");
      const baseUpdate = state.playerUpdates[0]!;
      assert.equal(baseUpdate.dailyRewardStreak, 1);
      assert.ok(
        baseUpdate.lastRewardClaimedAt instanceof Date,
        "lastRewardClaimedAt must be a Date",
      );
    });
  });

  describe("consecutive-day claim", () => {
    it("increments streak when last claim was yesterday", async () => {
      state.player = makePlayer({
        lastRewardClaimedAt: utcDaysAgo(1),
        dailyRewardStreak: 3,
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.streakDay, 4);
      assert.equal(body.streakBroken, false);
    });

    it("passes the new streak day to getDailyReward", async () => {
      let rewardDayReceived = -1;
      state.player = makePlayer({
        lastRewardClaimedAt: utcDaysAgo(1),
        dailyRewardStreak: 6,
      });
      state.rewardForDay = (day: number) => {
        rewardDayReceived = day;
        return { day, coins: 150, xp: 250, kind: "xp", label: "250 XP Boost", icon: "⚡" };
      };

      await post("/players/me/daily-claim");

      assert.equal(rewardDayReceived, 7, "getDailyReward should receive newStreakDay=7");
    });
  });

  describe("missed-day claim (streak reset)", () => {
    it("resets to day 1 and flags streakBroken when 2+ days have passed", async () => {
      state.player = makePlayer({
        lastRewardClaimedAt: utcDaysAgo(2),
        dailyRewardStreak: 10,
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.streakDay, 1);
      assert.equal(body.streakBroken, true);
    });

    it("resets to day 1 when last claim was 3 or more days ago", async () => {
      state.player = makePlayer({
        lastRewardClaimedAt: utcDaysAgo(5),
        dailyRewardStreak: 28,
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.streakDay, 1);
      assert.equal(body.streakBroken, true);
    });
  });

  describe("double-claim guard", () => {
    it("returns 400 already_claimed_today when claimed earlier today (UTC)", async () => {
      const todayMidnight = utcDaysAgo(0);
      // Set claim time to today at UTC midnight
      state.player = makePlayer({
        lastRewardClaimedAt: todayMidnight,
        dailyRewardStreak: 5,
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 400);
      assert.equal(body.error, "already_claimed_today");
    });

    it("returns 400 when claimed just moments ago (same UTC day)", async () => {
      const claimedJustNow = new Date();
      claimedJustNow.setUTCSeconds(claimedJustNow.getUTCSeconds() - 30);
      state.player = makePlayer({
        lastRewardClaimedAt: claimedJustNow,
        dailyRewardStreak: 2,
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 400);
      assert.equal(body.error, "already_claimed_today");
    });
  });

  describe("rare_egg bonus", () => {
    it("adds a Rare egg to the incubator and sets eggAdded=true", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.eggs = []; // incubator empty
      state.rewardForDay = () => ({
        day: 5, coins: 125, xp: 100, bonus: "rare_egg",
        kind: "egg", label: "Rare Egg", icon: "🥚",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.eggAdded, true);
      assert.equal(body.bonus, "rare_egg");
      assert.equal(state.eggsInserted.length, 1);
      assert.equal(state.eggsInserted[0]!.rarity, "Rare");
    });

    it("does not add an egg when incubator is at capacity (6 eggs)", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      // Fill incubator to max
      state.eggs = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1, playerId: 1, rarity: "Common", isHatched: false,
      }));
      state.rewardForDay = () => ({
        day: 5, coins: 125, xp: 100, bonus: "rare_egg",
        kind: "egg", label: "Rare Egg", icon: "🥚",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.eggAdded, false);
      assert.equal(state.eggsInserted.length, 0);
    });
  });

  describe("epic_egg bonus", () => {
    it("adds an Epic egg to the incubator and sets eggAdded=true", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.eggs = [];
      state.rewardForDay = () => ({
        day: 21, coins: 250, xp: 250, bonus: "epic_egg",
        kind: "egg", label: "Epic Egg", icon: "🟣",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.eggAdded, true);
      assert.equal(body.bonus, "epic_egg");
      assert.equal(state.eggsInserted.length, 1);
      assert.equal(state.eggsInserted[0]!.rarity, "Epic");
    });

    it("does not add an Epic egg when incubator is full", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.eggs = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1, playerId: 1, rarity: "Rare", isHatched: false,
      }));
      state.rewardForDay = () => ({
        day: 21, coins: 250, xp: 250, bonus: "epic_egg",
        kind: "egg", label: "Epic Egg", icon: "🟣",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.eggAdded, false);
      assert.equal(state.eggsInserted.length, 0);
    });
  });

  describe("streak_freeze bonus", () => {
    it("sets streakFreezeGranted=true when bonus is streak_freeze", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.rewardForDay = () => ({
        day: 10, coins: 100, xp: 100, bonus: "streak_freeze",
        kind: "streak_freeze", label: "Streak Freeze", icon: "🧊",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.bonus, "streak_freeze");
      assert.equal(body.streakFreezeGranted, true);
      assert.equal(body.eggAdded, false);
    });

    it("issues a DB update to increment streakFreezes", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null, streakFreezes: 1 });
      state.rewardForDay = () => ({
        day: 10, coins: 100, xp: 100, bonus: "streak_freeze",
        kind: "streak_freeze", label: "Streak Freeze", icon: "🧊",
      });

      await post("/players/me/daily-claim");

      // The route issues the base update (coins/xp/streak) plus a separate
      // streakFreezes increment update — at least 2 updates total.
      assert.ok(
        state.playerUpdates.length >= 2,
        "Expected a separate DB update for streakFreezes increment",
      );
      // The streak_freeze update contains the streakFreezes field (as a sql expr)
      const freezeUpdate = state.playerUpdates.find(u =>
        Object.prototype.hasOwnProperty.call(u, "streakFreezes"),
      );
      assert.ok(freezeUpdate, "No DB update contained streakFreezes");
    });

    it("does not add an egg when bonus is streak_freeze", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.rewardForDay = () => ({
        day: 10, coins: 100, xp: 100, bonus: "streak_freeze",
        kind: "streak_freeze", label: "Streak Freeze", icon: "🧊",
      });

      await post("/players/me/daily-claim");

      assert.equal(state.eggsInserted.length, 0);
    });
  });

  describe("streak_shield bonus", () => {
    it("sets streakShieldGranted=true when bonus is streak_shield", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.rewardForDay = () => ({
        day: 3, coins: 100, xp: 100, bonus: "streak_shield",
        kind: "xp", label: "Streak Shield", icon: "🛡️",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.bonus, "streak_shield");
      assert.equal(body.streakShieldGranted, true);
      assert.equal(body.eggAdded, false);
    });

    it("issues a DB update to increment streakShields by exactly 1", async () => {
      const initialShields = 2;
      state.player = makePlayer({ lastRewardClaimedAt: null, streakShields: initialShields });
      state.rewardForDay = () => ({
        day: 3, coins: 100, xp: 100, bonus: "streak_shield",
        kind: "xp", label: "Streak Shield", icon: "🛡️",
      });

      await post("/players/me/daily-claim");

      // The route issues the base update (coins/xp/streak) plus a separate
      // streakShields increment update — at least 2 updates total.
      assert.ok(
        state.playerUpdates.length >= 2,
        "Expected a separate DB update for streakShields increment",
      );
      // The streak_shield update contains the streakShields field (as a sql expr)
      const shieldUpdate = state.playerUpdates.find(u =>
        Object.prototype.hasOwnProperty.call(u, "streakShields"),
      );
      assert.ok(shieldUpdate, "No DB update contained streakShields");
      // Fake DB simulates the SQL +1 expression — verify exact increment
      assert.equal(
        state.player!.streakShields,
        initialShields + 1,
        `streakShields should be ${initialShields + 1} after claiming a shield day`,
      );
    });

    it("applies on day 20 as well (second scheduled shield day)", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: utcDaysAgo(1), dailyRewardStreak: 19 });
      state.rewardForDay = () => ({
        day: 20, coins: 225, xp: 225, bonus: "streak_shield",
        kind: "coins", label: "Streak Shield", icon: "🛡️",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.streakShieldGranted, true);
      assert.equal(body.streakDay, 20);
    });

    it("does not grant a shield on a non-shield day", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.rewardForDay = () => ({
        day: 1, coins: 50, xp: 25, kind: "coins", label: "50 Coins", icon: "🪙",
      });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);
      assert.equal(body.streakShieldGranted, false);
      const shieldUpdate = state.playerUpdates.find(u =>
        Object.prototype.hasOwnProperty.call(u, "streakShields"),
      );
      assert.equal(shieldUpdate, undefined, "No DB update should touch streakShields on non-shield day");
    });

    it("does not add an egg when bonus is streak_shield", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });
      state.rewardForDay = () => ({
        day: 3, coins: 100, xp: 100, bonus: "streak_shield",
        kind: "xp", label: "Streak Shield", icon: "🛡️",
      });

      await post("/players/me/daily-claim");

      assert.equal(state.eggsInserted.length, 0);
    });
  });

  describe("response shape", () => {
    it("includes all expected fields on a successful claim", async () => {
      state.player = makePlayer({ lastRewardClaimedAt: null });

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 200);

      // All fields documented in the route's res.json call
      const requiredFields = [
        "ok", "day", "coinsGranted", "xpGranted",
        "streakDay", "newStreakDay", "eggAdded",
        "artifactGranted", "streakFreezeGranted", "streakShieldGranted", "bonus", "streakBroken", "newBadges",
      ];
      for (const field of requiredFields) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(body, field),
          `Response missing field: ${field}`,
        );
      }
    });

    it("returns 404 when player does not exist", async () => {
      state.player = null; // no player in DB

      const { status, body } = await post("/players/me/daily-claim");

      assert.equal(status, 404);
      assert.ok(typeof body.error === "string");
    });
  });
});
