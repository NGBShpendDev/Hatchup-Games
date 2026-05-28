import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

type Player = {
  id: number;
  physiqueGoal: string | null;
  email?: string | null;
  notifyRecapEmail?: boolean;
  notifyRecapPush?: boolean;
  recapEmailLastSentWeek?: number | null;
  recapPushLastSentWeek?: number | null;
  displayName?: string | null;
  username?: string | null;
};
type MealPost = {
  playerId: number;
  name: string;
  emoji: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  createdAt: Date;
};
type Notification = {
  id?: number;
  playerId: number;
  type: string;
  title: string;
  body: string;
  link: string;
  sourceId: number;
};

const state = {
  players: new Map<number, Player>(),
  posts: [] as MealPost[],
  notifications: [] as Notification[],
};

function reset() {
  state.players.clear();
  state.posts = [];
  state.notifications = [];
}

// Column stubs — we tag each one so the mocked `eq()` can identify which
// column is being compared without needing real Drizzle metadata.
const col = (name: string) => ({ __col: name }) as const;

const playersTable = { id: col("players.id") };
const mealPostsTable = {
  playerId: col("mealPosts.playerId"),
  createdAt: col("mealPosts.createdAt"),
};
const notificationsTable = {
  playerId: col("notifications.playerId"),
  type: col("notifications.type"),
  sourceId: col("notifications.sourceId"),
};

type Predicate = Record<string, unknown> & { __sinceIso?: string };

function mergePredicates(parts: Predicate[]): Predicate {
  return Object.assign({}, ...parts);
}

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where: Predicate }) => {
        const id = args.where["players.id"] as number | undefined;
        return id != null ? state.players.get(id) : undefined;
      },
    },
    mealPostsTable: {
      findMany: async (args: { where: Predicate; orderBy?: unknown }) => {
        const pid = args.where["mealPosts.playerId"] as number | undefined;
        const sinceIso = args.where.__sinceIso;
        const since = sinceIso ? new Date(sinceIso) : new Date(0);
        return state.posts.filter(
          (p) => (pid == null || p.playerId === pid) && p.createdAt >= since,
        );
      },
    },
    notificationsTable: {
      findFirst: async (args: { where: Predicate; columns?: unknown }) => {
        const pid = args.where["notifications.playerId"];
        const type = args.where["notifications.type"];
        const src = args.where["notifications.sourceId"];
        return state.notifications.find(
          (n) => n.playerId === pid && n.type === type && n.sourceId === src,
        );
      },
    },
  },
  insert: (_table: unknown) => ({
    values: async (vals: Omit<Notification, "id">) => {
      state.notifications.push({ id: state.notifications.length + 1, ...vals });
    },
  }),
  update: (_table: unknown) => ({
    set: (vals: Partial<Player>) => ({
      where: async (pred: Predicate) => {
        const id = pred["players.id"] as number | undefined;
        if (id == null) return;
        const cur = state.players.get(id);
        if (cur) state.players.set(id, { ...cur, ...vals });
      },
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    mealPostsTable,
    playersTable,
    notificationsTable,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    and: (...parts: Predicate[]) => mergePredicates(parts),
    desc: (c: unknown) => ({ __desc: c }),
    eq: (c: { __col: string }, val: unknown): Predicate => ({ [c.__col]: val }),
    sql: (_strings: TemplateStringsArray, ...values: unknown[]): Predicate => {
      // The recap only uses sql`` once: `${mealPostsTable.createdAt} >= ${sinceISO}`.
      // The since-date string is the last interpolated value.
      const last = values[values.length - 1];
      return { __sinceIso: typeof last === "string" ? last : undefined };
    },
  },
});

mock.module("../lib/logger.ts", {
  namedExports: {
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  },
});

const externalCalls = {
  emails: 0,
  pushes: 0,
};

mock.module("./emailService.ts", {
  namedExports: {
    isEmailConfigured: () => true,
    sendTransactionalEmail: async () => {
      externalCalls.emails += 1;
      return true;
    },
  },
});

mock.module("./nutritionRecapEmail.ts", {
  namedExports: {
    renderRecapEmailHtml: () => "<html></html>",
  },
});

mock.module("./pushNotifications.ts", {
  namedExports: {
    isPushConfigured: () => true,
    sendPushToPlayer: async () => {
      externalCalls.pushes += 1;
    },
  },
});

mock.module("@workspace/integrations-openai-ai-server", {
  namedExports: {
    openai: {
      chat: {
        completions: {
          create: async () => {
            throw new Error("AI disabled in tests");
          },
        },
      },
    },
  },
});

const {
  isoWeekKey,
  deriveHatchlingMood,
  buildRecapMessage,
  sendWeeklyRecapNotification,
} = await import("./nutritionRecap.ts");

describe("isoWeekKey", () => {
  it("returns year*100 + week for a mid-year date", () => {
    // Wed 2026-06-17 → ISO week 25 of 2026
    assert.equal(isoWeekKey(new Date("2026-06-17T12:00:00Z")), 2026 * 100 + 25);
  });

  it("treats Monday as the first day of the ISO week", () => {
    // 2024-01-01 is a Monday → week 1 of 2024
    assert.equal(isoWeekKey(new Date("2024-01-01T00:00:00Z")), 2024 * 100 + 1);
  });

  it("rolls late-December dates into the next ISO year", () => {
    // 2024-12-30 (Mon) is ISO week 1 of 2025
    assert.equal(isoWeekKey(new Date("2024-12-30T00:00:00Z")), 2025 * 100 + 1);
    // 2024-12-31 (Tue) is also ISO week 1 of 2025
    assert.equal(isoWeekKey(new Date("2024-12-31T23:59:59Z")), 2025 * 100 + 1);
  });

  it("rolls early-January dates back into the previous ISO year", () => {
    // 2023-01-01 (Sun) is ISO week 52 of 2022
    assert.equal(isoWeekKey(new Date("2023-01-01T00:00:00Z")), 2022 * 100 + 52);
  });

  it("handles 53-week ISO years", () => {
    // 2020-12-31 (Thu) is ISO week 53 of 2020
    assert.equal(isoWeekKey(new Date("2020-12-31T12:00:00Z")), 2020 * 100 + 53);
  });

  it("returns the same key for two days in the same ISO week", () => {
    const mon = isoWeekKey(new Date("2026-03-09T00:00:00Z"));
    const sun = isoWeekKey(new Date("2026-03-15T23:59:59Z"));
    assert.equal(mon, sun);
  });

  it("returns different keys for adjacent ISO weeks", () => {
    const w1 = isoWeekKey(new Date("2026-03-15T23:59:59Z")); // Sun, week 11
    const w2 = isoWeekKey(new Date("2026-03-16T00:00:00Z")); // Mon, week 12
    assert.notEqual(w1, w2);
  });
});

describe("deriveHatchlingMood", () => {
  it("returns 'hungry' (😟) when no days were logged regardless of adherence", () => {
    assert.deepEqual(deriveHatchlingMood(0, 0), { mood: "hungry", emoji: "😟" });
    assert.deepEqual(deriveHatchlingMood(1, 0), { mood: "hungry", emoji: "😟" });
  });

  it("returns 'thriving' only when adherence is in [0.85, 1.15] AND >=5 days logged", () => {
    assert.deepEqual(deriveHatchlingMood(1.0, 7), { mood: "thriving", emoji: "🤩" });
    assert.deepEqual(deriveHatchlingMood(0.85, 5), { mood: "thriving", emoji: "🤩" });
    assert.deepEqual(deriveHatchlingMood(1.15, 5), { mood: "thriving", emoji: "🤩" });
    // Right adherence but not enough days → drops to happy
    assert.deepEqual(deriveHatchlingMood(1.0, 4), { mood: "happy", emoji: "😊" });
  });

  it("returns 'happy' for adherence in [0.7, 1.3] outside the thriving band", () => {
    assert.deepEqual(deriveHatchlingMood(0.7, 6), { mood: "happy", emoji: "😊" });
    assert.deepEqual(deriveHatchlingMood(1.3, 6), { mood: "happy", emoji: "😊" });
    assert.deepEqual(deriveHatchlingMood(0.8, 6), { mood: "happy", emoji: "😊" });
  });

  it("returns 'okay' for adherence in [0.5, 0.7)", () => {
    assert.deepEqual(deriveHatchlingMood(0.5, 3), { mood: "okay", emoji: "🙂" });
    assert.deepEqual(deriveHatchlingMood(0.69, 3), { mood: "okay", emoji: "🙂" });
  });

  it("returns 'hungry' (🥺) for low-but-positive adherence", () => {
    assert.deepEqual(deriveHatchlingMood(0.49, 3), { mood: "hungry", emoji: "🥺" });
    assert.deepEqual(deriveHatchlingMood(0.1, 1), { mood: "hungry", emoji: "🥺" });
  });

  it("returns 'sad' when adherence is exactly 0 but days were logged", () => {
    assert.deepEqual(deriveHatchlingMood(0, 2), { mood: "sad", emoji: "😢" });
  });
});

describe("buildRecapMessage", () => {
  const baseRecap = {
    weekStart: "2026-06-10T00:00:00.000Z",
    daysLogged: 6,
    mealsLogged: 14,
    averages: { calories: 2100, protein: 165, carbs: 220, fat: 62 },
    targets:  { calories: 2200, protein: 170, carbs: 230, fat: 65 },
    gaps:     { calories: -100, protein: -5,  carbs: -10, fat: -3 },
    ratios:   { calories: 0.95, protein: 0.97, carbs: 0.96, fat: 0.95 },
    adherence: 0.96,
    topFoods: [{ name: "Chicken bowl", emoji: "🍗", count: 4 }],
    hatchlingMood: "thriving" as const,
    hatchlingEmoji: "🤩",
    aiTip: "Add a small post-workout carb to top off glycogen.",
    aiSource: "fallback" as const,
  };

  it("uses the 'missed you' copy when no days were logged", () => {
    const msg = buildRecapMessage({
      ...baseRecap,
      daysLogged: 0,
      mealsLogged: 0,
      hatchlingMood: "hungry",
      hatchlingEmoji: "😟",
    });
    assert.equal(msg.title, "😟 Your Hatchling missed you this week");
    assert.match(msg.body, /didn't log any meals/);
  });

  it("uses the celebratory headline when thriving", () => {
    const msg = buildRecapMessage(baseRecap);
    assert.equal(msg.title, "🤩 Your Hatchling is thriving!");
    assert.match(msg.body, /6\/7 days logged/);
    assert.match(msg.body, /Top food: 🍗 Chicken bowl/);
  });

  it("falls back to neutral headline for non-positive moods", () => {
    const msg = buildRecapMessage({ ...baseRecap, hatchlingMood: "okay", hatchlingEmoji: "🙂" });
    assert.equal(msg.title, "🙂 Weekly nutrition recap");
  });

  it("caps the body at 280 characters", () => {
    const msg = buildRecapMessage({
      ...baseRecap,
      aiTip: "x".repeat(500),
    });
    assert.ok(msg.body.length <= 280, `body was ${msg.body.length} chars`);
  });
});

describe("sendWeeklyRecapNotification", () => {
  beforeEach(() => {
    reset();
  });

  it("inserts exactly one notification per ISO week per player", async () => {
    state.players.set(1, { id: 1, physiqueGoal: "lean_athlete" });
    state.posts = [
      {
        playerId: 1,
        name: "Oatmeal",
        emoji: "🥣",
        calories: 400, proteinG: 20, carbsG: 60, fatG: 10,
        createdAt: new Date("2026-06-14T08:00:00Z"),
      },
    ];

    const now = new Date("2026-06-14T12:00:00Z");

    const first = await sendWeeklyRecapNotification(1, now);
    assert.equal(first, true, "first call should insert");
    assert.equal(state.notifications.length, 1);

    const second = await sendWeeklyRecapNotification(1, now);
    assert.equal(second, false, "second call same week should be a no-op");
    assert.equal(state.notifications.length, 1);

    // Different player → independent
    state.players.set(2, { id: 2, physiqueGoal: "lean_athlete" });
    state.posts.push({
      playerId: 2,
      name: "Salad",
      emoji: "🥗",
      calories: 300, proteinG: 15, carbsG: 20, fatG: 12,
      createdAt: new Date("2026-06-14T08:00:00Z"),
    });
    const otherPlayer = await sendWeeklyRecapNotification(2, now);
    assert.equal(otherPlayer, true);
    assert.equal(state.notifications.length, 2);

    // Different week, same player → inserts again
    const nextWeek = new Date("2026-06-22T12:00:00Z");
    const nextWeekCall = await sendWeeklyRecapNotification(1, nextWeek);
    assert.equal(nextWeekCall, true);
    assert.equal(state.notifications.length, 3);

    // Each notification is tagged with the right ISO-week sourceId
    const weeks = state.notifications.map((n) => n.sourceId).sort();
    assert.deepEqual(weeks, [
      isoWeekKey(now),
      isoWeekKey(now),
      isoWeekKey(nextWeek),
    ].sort());

    for (const n of state.notifications) {
      assert.equal(n.type, "nutrition_recap");
      assert.equal(n.link, "/nutrition");
    }
  });

  it("does NOT fan out to email or push when deliverExternalChannels is omitted", async () => {
    externalCalls.emails = 0;
    externalCalls.pushes = 0;
    state.players.set(10, {
      id: 10,
      physiqueGoal: "lean_athlete",
      email: "p10@example.com",
      notifyRecapEmail: true,
      notifyRecapPush: true,
      displayName: "Ten",
    });
    const ok = await sendWeeklyRecapNotification(10, new Date("2026-06-14T12:00:00Z"));
    assert.equal(ok, true);
    assert.equal(externalCalls.emails, 0, "email should not fire without deliverExternalChannels");
    assert.equal(externalCalls.pushes, 0, "push should not fire without deliverExternalChannels");
  });

  it("fans out to email AND push exactly once per week when deliverExternalChannels is set", async () => {
    externalCalls.emails = 0;
    externalCalls.pushes = 0;
    state.players.set(11, {
      id: 11,
      physiqueGoal: "lean_athlete",
      email: "p11@example.com",
      notifyRecapEmail: true,
      notifyRecapPush: true,
      displayName: "Eleven",
    });
    const now = new Date("2026-06-14T12:00:00Z");

    await sendWeeklyRecapNotification(11, now, { deliverExternalChannels: true });
    assert.equal(externalCalls.emails, 1);
    assert.equal(externalCalls.pushes, 1);

    // Second call same week — in-app idempotency short-circuits before external fanout
    await sendWeeklyRecapNotification(11, now, { deliverExternalChannels: true });
    assert.equal(externalCalls.emails, 1);
    assert.equal(externalCalls.pushes, 1);
  });

  it("respects per-channel opt-out flags", async () => {
    externalCalls.emails = 0;
    externalCalls.pushes = 0;
    state.players.set(12, {
      id: 12,
      physiqueGoal: "lean_athlete",
      email: "p12@example.com",
      notifyRecapEmail: false,
      notifyRecapPush: true,
      displayName: "Twelve",
    });
    await sendWeeklyRecapNotification(12, new Date("2026-06-14T12:00:00Z"), { deliverExternalChannels: true });
    assert.equal(externalCalls.emails, 0, "email should be skipped when notifyRecapEmail is false");
    assert.equal(externalCalls.pushes, 1, "push should still fire when its flag is true");
  });

  it("returns false and inserts nothing when the player does not exist", async () => {
    const result = await sendWeeklyRecapNotification(999, new Date("2026-06-14T12:00:00Z"));
    assert.equal(result, false);
    assert.equal(state.notifications.length, 0);
  });

  it("uses the 'missed you' copy when the player logged nothing this week", async () => {
    state.players.set(3, { id: 3, physiqueGoal: "lean_athlete" });
    const ok = await sendWeeklyRecapNotification(3, new Date("2026-06-14T12:00:00Z"));
    assert.equal(ok, true);
    assert.equal(state.notifications.length, 1);
    const n = state.notifications[0]!;
    assert.match(n.title, /missed you this week/);
    assert.match(n.body, /didn't log any meals/);
    assert.equal(n.type, "nutrition_recap");
    assert.equal(n.link, "/nutrition");
  });
});
