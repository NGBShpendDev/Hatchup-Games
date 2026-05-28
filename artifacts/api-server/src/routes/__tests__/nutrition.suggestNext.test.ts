// Regression tests for GET /nutrition/suggest-next.
//
// The endpoint has three observable paths:
//   1. No `pantry`/`useAi` query → static catalog suggestion, source="catalog".
//   2. AI requested and the model returns a well-shaped JSON object → the
//      response should adopt the AI fields, set source="ai", and pass through
//      the optional `tip` and `tags` fields.
//   3. AI requested but the model either throws OR returns an unusable shape
//      (missing required numeric macros) → fall back to the static catalog
//      and surface `aiError` so the client can show a "couldn't personalize"
//      hint.
//
// We mount the real nutrition router on a tiny Express app with the openai
// client, auth, db, and ancillary services mocked. `openaiNext` is a mutable
// hook so each test can stage either a successful completion, a throw, or a
// malformed JSON payload.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── Mutable in-memory state ─────────────────────────────────────────────────
const state = {
  player: {
    id: 1,
    clerkId: "u_1",
    username: "ash",
    displayName: "Ash",
    physiqueGoal: "lean_athlete" as string | null,
    activeHatchlingId: null as number | null,
  },
  // Sum of today's meal macros returned by the db.execute totals query.
  // Defaults to all zeros so every macro is "behind" target.
  totalsRow: { calories: 0, protein: 0, carbs: 0, fat: 0 } as Record<string, number>,
  // Rows returned by the "frequent tags" query when the AI path runs.
  tagRows: [] as Array<{ tag: string | null; cnt: number }>,
  // Next openai response handler. Tests reassign this to switch behaviour.
  openaiNext: null as null | (() => Promise<unknown>),
  openaiCalls: 0,
};

function resetState() {
  state.player.physiqueGoal = "lean_athlete";
  state.totalsRow = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  state.tagRows = [];
  state.openaiNext = null;
  state.openaiCalls = 0;
}

// ── Mocks ────────────────────────────────────────────────────────────────────
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: "u_1" }),
  },
});

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
      lean_athlete: { calories: 2200, protein: 170, carbs: 230, fat: 65, tip: "Balanced." },
    },
    buildRecapMessage: () => "recap",
    computeWeeklyRecap: async () => null,
    sendWeeklyRecapNotification: async () => true,
  },
});
mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    recapPreviewLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("@workspace/integrations-openai-ai-server", {
  namedExports: {
    openai: {
      chat: {
        completions: {
          create: async () => {
            state.openaiCalls += 1;
            if (!state.openaiNext) {
              throw new Error("openaiNext was not staged for this test");
            }
            return state.openaiNext();
          },
        },
      },
    },
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: () => ({}),
    and: () => ({}),
    or: () => ({}),
    desc: () => ({}),
    sql: Object.assign(
      (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ __sql: true }),
      { raw: (_s: string) => ({}) },
    ),
    inArray: () => ({}),
    notInArray: () => ({}),
  },
});

// Fake DB: enough surface for the suggest-next handler.
//
// db.execute is called twice in the AI path:
//   1. SUM(calories|protein|carbs|fat) of today's meal posts
//   2. frequent tag rows from the last 30 days
// We dispatch on call order — first call returns totals, subsequent calls
// return the frequent tags rows.
let executeCallIndex = 0;

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async () => state.player,
    },
  },
  execute: async () => {
    const idx = executeCallIndex++;
    if (idx === 0) return { rows: [state.totalsRow] };
    return { rows: state.tagRows };
  },
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    mealPostsTable: {},
    mealLikesTable: {},
    mealCommentsTable: {},
    nutritionChallengeProgressTable: {},
    nutritionDailyStreaksTable: {},
    nutritionStreakHitsTable: {},
    playersTable: {},
    groupMembersTable: {},
    hatchlingsTable: {},
    notificationsTable: {},
  },
});

// ── Imports that depend on the mocks above ──────────────────────────────────
const express = (await import("express")).default;
const nutritionRouter = (await import("../nutrition.ts")).default;

// ── Server setup ────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  // The AI failure branches call req.log.warn — pino-http is not wired up
  // in this minimal app, so attach a no-op logger.
  app.use((req, _res, next) => {
    (req as unknown as { log: { warn: () => void; error: () => void; info: () => void } }).log = {
      warn: () => {}, error: () => {}, info: () => {},
    };
    next();
  });
  app.use(nutritionRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

beforeEach(() => {
  resetState();
  executeCallIndex = 0;
});

async function getJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { res, body: (await res.json()) as Record<string, unknown> };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("GET /nutrition/suggest-next", () => {
  it("returns a static catalog suggestion when no pantry/useAi is supplied", async () => {
    const { res, body } = await getJson("/nutrition/suggest-next");

    assert.equal(res.status, 200);
    assert.equal(state.openaiCalls, 0, "AI must not be called on the catalog path");
    assert.equal(body.hasGap, true);
    assert.equal(body.usedAi, false);
    assert.equal(body.aiError, undefined);

    const suggestion = body.suggestion as Record<string, unknown>;
    assert.ok(suggestion, "suggestion should be present when there is a macro gap");
    assert.equal(suggestion.source, "catalog");
    assert.equal(typeof suggestion.name, "string");
    assert.equal(typeof suggestion.calories, "number");
    assert.equal(typeof suggestion.proteinG, "number");
    // The catalog path never carries AI-only fields.
    assert.equal(suggestion.tip, undefined);
    assert.equal(suggestion.tags, undefined);
  });

  it("uses the AI suggestion when the model returns a well-shaped response", async () => {
    state.openaiNext = async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            name: "Tofu stir-fry",
            emoji: "🥡",
            description: "Tofu with veg over rice",
            summary: "~30g protein, vegan",
            servings: 1.5,
            calories: 520,
            protein_g: 32,
            carbs_g: 60,
            fat_g: 14,
            tip: "Add chili oil for spice.",
            tags: ["vegan", "high-protein"],
          }),
        },
      }],
    });

    const { res, body } = await getJson("/nutrition/suggest-next?useAi=true&pantry=tofu,rice");

    assert.equal(res.status, 200);
    assert.equal(state.openaiCalls, 1);
    assert.equal(body.usedAi, true);
    assert.equal(body.aiError, undefined);

    const suggestion = body.suggestion as Record<string, unknown>;
    assert.equal(suggestion.source, "ai");
    assert.equal(suggestion.name, "Tofu stir-fry");
    assert.equal(suggestion.emoji, "🥡");
    assert.equal(suggestion.calories, 520);
    assert.equal(suggestion.proteinG, 32);
    assert.equal(suggestion.carbsG, 60);
    assert.equal(suggestion.fatG, 14);
    assert.equal(suggestion.servings, 1.5);
    assert.equal(suggestion.tip, "Add chili oil for spice.");
    assert.deepEqual(suggestion.tags, ["vegan", "high-protein"]);
  });

  it("falls back to the catalog and surfaces aiError when the AI throws", async () => {
    state.openaiNext = async () => { throw new Error("upstream 503"); };

    const { res, body } = await getJson("/nutrition/suggest-next?useAi=true");

    assert.equal(res.status, 200);
    assert.equal(state.openaiCalls, 1);
    assert.equal(body.usedAi, true);
    assert.equal(typeof body.aiError, "string");
    assert.match(body.aiError as string, /AI service unavailable/i);

    const suggestion = body.suggestion as Record<string, unknown>;
    assert.ok(suggestion, "should still return a catalog suggestion on AI failure");
    assert.equal(suggestion.source, "catalog");
    assert.equal(suggestion.tip, undefined);
    assert.equal(suggestion.tags, undefined);
  });

  it("falls back to the catalog and surfaces aiError when the AI returns an unusable shape", async () => {
    // Missing required numeric macros (`calories`, `protein_g`, etc.). The
    // route's validator should reject this and fall back to the catalog.
    state.openaiNext = async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            name: "Mystery plate",
            description: "Looks tasty but no macros",
          }),
        },
      }],
    });

    const { res, body } = await getJson("/nutrition/suggest-next?useAi=true");

    assert.equal(res.status, 200);
    assert.equal(state.openaiCalls, 1);
    assert.equal(body.usedAi, true);
    assert.equal(typeof body.aiError, "string");
    assert.match(body.aiError as string, /unusable shape/i);

    const suggestion = body.suggestion as Record<string, unknown>;
    assert.ok(suggestion);
    assert.equal(suggestion.source, "catalog");
    // Bad-shape AI output must not leak into the response.
    assert.notEqual(suggestion.name, "Mystery plate");
  });
});
