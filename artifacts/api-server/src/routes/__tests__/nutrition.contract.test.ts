// Contract tests for the /nutrition/* endpoints.
//
// Each route is hit through a real Express server, and every response body is
// parsed with the generated Zod schema from `@workspace/api-zod`. If the
// OpenAPI spec and the actual handler ever drift, the matching `.parse()`
// here will throw and fail the test. Database, auth, AI and external
// service modules are stubbed via `mock.module` so the routes run in
// isolation against in-memory state.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── Mutable in-memory state shared between tests and the fake DB ─────────────
interface MealPostRow {
  id: number;
  playerId: number;
  imageUrl: string | null;
  emoji: string;
  name: string;
  tag: string;
  description: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  aiAnalyzed: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
}

interface CommentRow {
  id: number;
  mealPostId: number;
  playerId: number;
  content: string;
  createdAt: Date;
}

interface LikeRow { id: number; mealPostId: number; playerId: number }

interface StreakRow {
  playerId: number;
  currentStreak: number;
  longestStreak: number;
  lastHitDate: { toString: () => string } | null;
  rewardedOnDate: { toString: () => string } | null;
}

interface ChallengeProgressRow {
  playerId: number;
  challengeKey: string;
  currentValue: number;
  completedAt: Date | null;
}

interface HatchlingRow {
  id: number;
  playerId: number;
  name: string;
  happiness: number;
  energy: number;
}

const state = {
  player: {
    id: 1,
    clerkId: "u_1",
    username: "ash",
    displayName: "Ash",
    physiqueGoal: "lean_athlete" as string | null,
    level: 5,
    fitnessXp: 100,
    xp: 200,
    coins: 0,
    activeHatchlingId: null as number | null,
  },
  posts: [] as MealPostRow[],
  likes: [] as LikeRow[],
  likeForCurrentRequest: null as LikeRow | null,
  comments: [] as CommentRow[],
  streak: null as StreakRow | null,
  hatchling: null as HatchlingRow | null,
  challengeProgress: [] as ChallengeProgressRow[],
  challengeProgressFirst: null as ChallengeProgressRow | null,
  sumRow: { calories: 0, protein: 0, carbs: 0, fat: 0, cnt: 0 },
};

function resetState() {
  state.player.physiqueGoal = "lean_athlete";
  state.posts = [];
  state.likes = [];
  state.likeForCurrentRequest = null;
  state.comments = [];
  state.streak = null;
  state.hatchling = null;
  state.challengeProgress = [];
  state.challengeProgressFirst = null;
  state.sumRow = { calories: 0, protein: 0, carbs: 0, fat: 0, cnt: 0 };
}

// ── Mocks ────────────────────────────────────────────────────────────────────
// Bypass Clerk: every request looks authenticated as user "u_1". The real
// auth middlewares then look up the player against the fake DB below, which
// returns player id 1, so req.playerId is wired up naturally.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: "u_1" }),
  },
});

// Stubbed services so the routes never reach real implementations.
mock.module("../../services/badgeService.ts", {
  namedExports: { awardBadge: async () => null },
});
mock.module("../safety.ts", {
  namedExports: { getHiddenPlayerIds: async () => [] as number[] },
});
mock.module("../storage.ts", {
  namedExports: { verifyUploadToken: () => true },
});
mock.module("../../lib/objectStorage.ts", {
  namedExports: {
    ObjectStorageService: class { async trySetObjectEntityAclPolicy() {} },
  },
});

mock.module("../../services/nutritionRecap.ts", {
  namedExports: {
    MACRO_GOAL_TARGETS: {
      lean_athlete: { calories: 2200, protein: 170, carbs: 230, fat: 65, tip: "Balanced macros — fuel performance and stay lean." },
    },
    buildRecapMessage: () => "Your weekly nutrition recap is ready.",
    computeWeeklyRecap: async () => ({
      weekStart: "2026-05-25T00:00:00.000Z",
      daysLogged: 5,
      mealsLogged: 12,
      averages: { calories: 2100, protein: 160, carbs: 220, fat: 60 },
      targets:  { calories: 2200, protein: 170, carbs: 230, fat: 65 },
      gaps:     { calories: -100, protein: -10, carbs: -10, fat: -5 },
      ratios:   { calories: 0.95, protein: 0.94, carbs: 0.95, fat: 0.92 },
      adherence: 0.94,
      topFoods: [{ name: "Chicken bowl", emoji: "🍗", count: 4 }],
      hatchlingMood: "thriving",
      hatchlingEmoji: "🤩",
      aiTip: "Solid week — keep protein steady.",
      aiSource: "fallback",
    }),
    sendWeeklyRecapNotification: async () => true,
  },
});

mock.module("@workspace/integrations-openai-ai-server", {
  namedExports: {
    openai: {
      chat: {
        completions: {
          create: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  calories: 450, protein_g: 30, carbs_g: 45, fat_g: 15,
                  quality_score: 7, suggestions: ["Add veggies."],
                  // For macro-target route
                  protein: 170, carbs: 230, fat: 65,
                  tip: "Balanced fuel.",
                }),
              },
            }],
          }),
        },
      },
    },
  },
});

// drizzle-orm helpers — the routes only use these as opaque markers; the fake
// db never inspects them.
mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: () => ({}),
    and: () => ({}),
    or: () => ({}),
    desc: () => ({}),
    sql: Object.assign(
      (_strings: TemplateStringsArray, ..._values: unknown[]) => ({}),
      { raw: (_s: string) => ({}) },
    ),
    inArray: () => ({}),
    notInArray: () => ({}),
  },
});

// Fake DB: returns shapes that satisfy the route handlers' field accesses.
// Insert/update/delete are no-ops aside from returning a plausible row so the
// `await db.insert(t).values(...).returning()` destructure works.
const queryHandlers: Record<string, any> = {
  playersTable: {
    findFirst: async () => state.player,
    findMany: async () => [state.player],
  },
  mealPostsTable: {
    findFirst: async () => state.posts[0],
    findMany: async () => state.posts,
  },
  mealLikesTable: {
    findFirst: async () => state.likeForCurrentRequest ?? undefined,
    findMany: async () => state.likes,
  },
  mealCommentsTable: {
    findMany: async () => state.comments,
  },
  nutritionDailyStreaksTable: {
    findFirst: async () => state.streak ?? undefined,
  },
  nutritionChallengeProgressTable: {
    findFirst: async () => state.challengeProgressFirst ?? undefined,
    findMany: async () => state.challengeProgress,
  },
  hatchlingsTable: {
    findFirst: async () => state.hatchling ?? undefined,
  },
  groupMembersTable: { findMany: async () => [] },
};

let insertedIdCounter = 100;

const fakeDb = {
  query: new Proxy({}, {
    get: (_t, name: string) =>
      queryHandlers[name] ?? { findFirst: async () => undefined, findMany: async () => [] },
  }),
  insert: (_table: unknown) => ({
    values: (vals: any) => {
      const id = ++insertedIdCounter;
      const row = {
        id,
        createdAt: new Date("2026-05-28T12:00:00.000Z"),
        likesCount: 0,
        commentsCount: 0,
        ...vals,
      };
      const chain: any = {
        returning: async () => [row],
        onConflictDoNothing: () => ({ returning: async () => [{ id }] }),
        then: (resolve: any, reject: any) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
      return chain;
    },
  }),
  update: (_table: unknown) => ({
    set: (_v: unknown) => ({
      where: (_w: unknown) => Promise.resolve(undefined),
    }),
  }),
  delete: (_table: unknown) => ({
    where: (_w: unknown) => ({ returning: async () => [{ id: 1 }] }),
  }),
  // db.select({...}).from(table).where(...) — used to look up group memberships.
  // Returning [] forces the feed route to fall back to discover, which is fine
  // for contract testing (we exercise both modes via the `mode` query param).
  select: (_cols?: unknown) => ({
    from: (_t: unknown) => ({
      where: (_w: unknown) => Promise.resolve([]),
    }),
  }),
  execute: async () => ({ rows: [state.sumRow] }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    mealPostsTable: {},
    mealLikesTable: {},
    mealCommentsTable: {},
    nutritionChallengeProgressTable: {},
    nutritionDailyStreaksTable: {},
    playersTable: {},
    groupMembersTable: {},
    hatchlingsTable: {},
    notificationsTable: {},
  },
});

mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    recapPreviewLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// ── Imports that depend on the mocks above ───────────────────────────────────
const express = (await import("express")).default;
const nutritionRouter = (await import("../nutrition.ts")).default;
const {
  ListNutritionPostsResponse,
  ToggleMealPostLikeResponse,
  ListMealPostCommentsResponse,
  AddMealPostCommentBody, // request validator (unused — body is server-side)
  AnalyzeMealDescriptionResponse,
  ListNutritionChallengesResponse,
  IncrementNutritionChallengeProgressResponse,
  GetNutritionMacroTargetResponse,
  GetNutritionStreakResponse,
  GetNutritionSummaryResponse,
  SendNutritionRecapResponse,
  UpdatePhysiqueGoalResponse,
} = await import("@workspace/api-zod");
void AddMealPostCommentBody;

// ── Local zod mirrors for endpoints whose response isn't generated ───────────
// The `createMealPost` response uses oneOf+nullable refs which Orval doesn't
// emit as a zod schema. We mirror the OpenAPI shape here so the contract is
// still pinned in tests.
const { z } = await import("zod");
const CreateMealPostResultZ = z.object({
  id: z.number(),
  playerId: z.number(),
  imageUrl: z.string().nullable(),
  emoji: z.string(),
  name: z.string(),
  tag: z.string(),
  description: z.string().nullable(),
  calories: z.number().nullable(),
  proteinG: z.number().nullable(),
  carbsG: z.number().nullable(),
  fatG: z.number().nullable(),
  aiAnalyzed: z.boolean(),
  likesCount: z.number(),
  commentsCount: z.number(),
  createdAt: z.string(),
  newBadges: z.array(z.string()),
  hatchlingStatChange: z.unknown().nullable(),
  dailyMacroReward: z.unknown().nullable(),
});

// ── Server setup ─────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(nutritionRouter);
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

// ── Helpers ──────────────────────────────────────────────────────────────────
async function getJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { res, body: await res.json() };
}
async function postJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}
async function putJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

function samplePost(overrides: Partial<MealPostRow> = {}): MealPostRow {
  return {
    id: 1,
    playerId: 1,
    imageUrl: null,
    emoji: "🍗",
    name: "Chicken bowl",
    tag: "high-protein",
    description: null,
    calories: 500,
    proteinG: 40,
    carbsG: 50,
    fatG: 15,
    aiAnalyzed: false,
    likesCount: 3,
    commentsCount: 1,
    createdAt: new Date("2026-05-28T10:00:00.000Z"),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("nutrition contract — responses parse against generated Zod", () => {
  it("GET /nutrition/posts (discover) matches ListNutritionPostsResponse", async () => {
    state.posts = [samplePost(), samplePost({ id: 2, name: "Eggs" })];
    const { res, body } = await getJson("/nutrition/posts?mode=discover");
    assert.equal(res.status, 200);
    const parsed = ListNutritionPostsResponse.parse(body);
    assert.equal(parsed.posts.length, 2);
    assert.equal(parsed.mode, "discover");
    assert.equal(parsed.fellBackToDiscover, false);
  });

  it("GET /nutrition/posts (feed) falls back to discover for users with no groups", async () => {
    state.posts = [samplePost()];
    const { res, body } = await getJson("/nutrition/posts?mode=feed");
    assert.equal(res.status, 200);
    const parsed = ListNutritionPostsResponse.parse(body);
    assert.equal(parsed.fellBackToDiscover, true);
    assert.equal(parsed.mode, "discover");
  });

  it("POST /nutrition/posts matches CreateMealPostResult", async () => {
    const { res, body } = await postJson("/nutrition/posts", {
      playerId: 1,
      name: "Salmon plate",
      tag: "high-protein",
      calories: 600,
      proteinG: 45,
      carbsG: 30,
      fatG: 25,
    });
    assert.equal(res.status, 201);
    CreateMealPostResultZ.parse(body);
  });

  it("POST /nutrition/posts/:id/like matches ToggleMealPostLikeResponse (like)", async () => {
    state.posts = [samplePost({ id: 7, likesCount: 4 })];
    const { res, body } = await postJson("/nutrition/posts/7/like", {});
    assert.equal(res.status, 200);
    const parsed = ToggleMealPostLikeResponse.parse(body);
    assert.equal(parsed.liked, true);
  });

  it("POST /nutrition/posts/:id/like matches ToggleMealPostLikeResponse (unlike)", async () => {
    state.posts = [samplePost({ id: 7, likesCount: 4 })];
    state.likeForCurrentRequest = { id: 9, mealPostId: 7, playerId: 1 };
    const { res, body } = await postJson("/nutrition/posts/7/like", {});
    assert.equal(res.status, 200);
    const parsed = ToggleMealPostLikeResponse.parse(body);
    assert.equal(parsed.liked, false);
  });

  it("GET /nutrition/posts/:id/comments matches ListMealPostCommentsResponse", async () => {
    state.comments = [
      { id: 1, mealPostId: 7, playerId: 1, content: "Yum!", createdAt: new Date("2026-05-28T10:30:00.000Z") },
      { id: 2, mealPostId: 7, playerId: 1, content: "Great form", createdAt: new Date("2026-05-28T10:35:00.000Z") },
    ];
    const { res, body } = await getJson("/nutrition/posts/7/comments");
    assert.equal(res.status, 200);
    const parsed = ListMealPostCommentsResponse.parse(body);
    assert.equal(parsed.length, 2);
  });

  it("POST /nutrition/posts/:id/comments matches MealComment", async () => {
    const { res, body } = await postJson("/nutrition/posts/7/comments", { content: "Nice meal!" });
    assert.equal(res.status, 201);
    // Comment response has same shape as ListMealPostCommentsResponseItem.
    ListMealPostCommentsResponse.parse([body]);
  });

  it("POST /nutrition/analyze matches AnalyzeMealDescriptionResponse", async () => {
    const { res, body } = await postJson("/nutrition/analyze", {
      description: "Grilled chicken breast with rice and broccoli",
    });
    assert.equal(res.status, 200);
    AnalyzeMealDescriptionResponse.parse(body);
  });

  it("GET /nutrition/challenges matches ListNutritionChallengesResponse", async () => {
    state.challengeProgress = [
      { playerId: 1, challengeKey: "protein_streak_7", currentValue: 3, completedAt: null },
    ];
    const { res, body } = await getJson("/nutrition/challenges");
    assert.equal(res.status, 200);
    const parsed = ListNutritionChallengesResponse.parse(body);
    assert.ok(parsed.length >= 1, "should return all defined challenges");
  });

  it("POST /nutrition/challenges/:key/progress matches IncrementNutritionChallengeProgressResponse", async () => {
    const { res, body } = await postJson("/nutrition/challenges/protein_streak_7/progress", {
      playerId: 1,
      increment: 1,
    });
    assert.equal(res.status, 200);
    IncrementNutritionChallengeProgressResponse.parse(body);
  });

  it("POST /nutrition/challenges/:key/progress matches schema when already completed", async () => {
    state.challengeProgressFirst = {
      playerId: 1,
      challengeKey: "protein_streak_7",
      currentValue: 7,
      completedAt: new Date("2026-05-20T00:00:00.000Z"),
    };
    const { res, body } = await postJson("/nutrition/challenges/protein_streak_7/progress", {
      playerId: 1,
      increment: 1,
    });
    assert.equal(res.status, 200);
    const parsed = IncrementNutritionChallengeProgressResponse.parse(body);
    assert.equal(parsed.alreadyCompleted, true);
  });

  it("GET /nutrition/macro-target matches GetNutritionMacroTargetResponse (AI path)", async () => {
    const { res, body } = await getJson("/nutrition/macro-target");
    assert.equal(res.status, 200);
    const parsed = GetNutritionMacroTargetResponse.parse(body);
    assert.equal(parsed.aiPersonalized, true);
  });

  it("GET /nutrition/streak matches GetNutritionStreakResponse (no streak yet)", async () => {
    const { res, body } = await getJson("/nutrition/streak");
    assert.equal(res.status, 200);
    const parsed = GetNutritionStreakResponse.parse(body);
    assert.equal(parsed.currentStreak, 0);
    assert.equal(parsed.longestStreak, 0);
    assert.equal(parsed.lastHitDate, null);
    assert.equal(parsed.hitToday, false);
  });

  it("GET /nutrition/streak matches schema with an active streak", async () => {
    const today = new Date().toISOString().slice(0, 10);
    state.streak = {
      playerId: 1,
      currentStreak: 4,
      longestStreak: 9,
      lastHitDate: { toString: () => today },
      rewardedOnDate: { toString: () => today },
    };
    const { res, body } = await getJson("/nutrition/streak");
    assert.equal(res.status, 200);
    const parsed = GetNutritionStreakResponse.parse(body);
    assert.equal(parsed.currentStreak, 4);
    assert.equal(parsed.hitToday, true);
  });

  it("GET /nutrition/summary matches GetNutritionSummaryResponse", async () => {
    const { res, body } = await getJson("/nutrition/summary");
    assert.equal(res.status, 200);
    GetNutritionSummaryResponse.parse(body);
  });

  it("POST /nutrition/recap/send matches SendNutritionRecapResponse", async () => {
    const { res, body } = await postJson("/nutrition/recap/send", {});
    assert.equal(res.status, 200);
    const parsed = SendNutritionRecapResponse.parse(body);
    assert.equal(parsed.sent, true);
  });

  it("PUT /nutrition/physique-goal matches UpdatePhysiqueGoalResponse", async () => {
    const { res, body } = await putJson("/nutrition/physique-goal", {
      playerId: 1,
      physiqueGoal: "muscle_gain",
    });
    assert.equal(res.status, 200);
    const parsed = UpdatePhysiqueGoalResponse.parse(body);
    assert.equal(parsed.physiqueGoal, "muscle_gain");
  });
});
