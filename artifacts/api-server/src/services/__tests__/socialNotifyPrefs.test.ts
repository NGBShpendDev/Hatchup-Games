// Unit tests for the per-type, per-channel social notification resolver.
//
// `socialChannelsForType` is the single seam every social notification path
// flows through to decide whether the inbox, push, and email channels each
// fire for a given recipient. The tests below lock in:
//   1. Unknown / non-social types short-circuit to `null` so callers know
//      no per-type gate applies.
//   2. The legacy master toggle (`notifySocial<Base>`) still acts as a
//      nuclear off-switch — when false, every channel returns false.
//   3. Each per-channel flag gates independently: turning push off does
//      not silence inbox or email, and so on.
//   4. The email channel defaults to *off* (opt-in), while inbox/push
//      default to *on* — matching the schema defaults.
//   5. Every supported notification type maps to the right base bucket.

import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

type PlayerRow = Record<string, boolean>;

const state = {
  player: null as PlayerRow | null,
};

const playersTable = { id: { __col: "id" } };

mock.module("drizzle-orm", {
  namedExports: {
    eq: (_c: unknown, _v: unknown) => ({}),
  },
});

mock.module("@workspace/db", {
  namedExports: {
    db: {
      query: {
        playersTable: {
          findFirst: async () => (state.player ?? undefined) as never,
        },
      },
    },
    playersTable,
  },
});

const {
  socialChannelsForType,
  socialPrefBaseForType,
  isSocialNotificationAllowed,
  SOCIAL_NOTIFY_PREF_KEYS,
} = await import("../socialNotifyPrefs.ts");

const BASES = ["Reactions", "Replies", "Mentions", "Followers"] as const;

function defaults(overrides: Record<string, boolean> = {}): PlayerRow {
  const row: PlayerRow = {};
  for (const base of BASES) {
    row[`notifySocial${base}`] = true;
    row[`notifySocial${base}Inbox`] = true;
    row[`notifySocial${base}Push`] = true;
    row[`notifySocial${base}Email`] = false;
  }
  for (const k of Object.keys(overrides)) {
    row[k] = overrides[k];
  }
  return row;
}

beforeEach(() => {
  state.player = defaults();
});

describe("socialPrefBaseForType", () => {
  it("maps each social type to its base bucket", () => {
    assert.equal(socialPrefBaseForType("post_reaction"), "Reactions");
    assert.equal(socialPrefBaseForType("comment_like"), "Reactions");
    assert.equal(socialPrefBaseForType("post_comment"), "Replies");
    assert.equal(socialPrefBaseForType("post_mention"), "Mentions");
    assert.equal(socialPrefBaseForType("comment_mention"), "Mentions");
    assert.equal(socialPrefBaseForType("club_mention"), "Mentions");
    assert.equal(socialPrefBaseForType("new_follower"), "Followers");
  });

  it("returns null for non-social types", () => {
    assert.equal(socialPrefBaseForType("challenge_invite"), null);
    assert.equal(socialPrefBaseForType("nutrition_recap"), null);
    assert.equal(socialPrefBaseForType("totally_made_up"), null);
  });
});

describe("socialChannelsForType", () => {
  it("returns null for unknown / non-social types so no gate applies", async () => {
    state.player = defaults();
    assert.equal(await socialChannelsForType(1, "challenge_invite"), null);
    assert.equal(await socialChannelsForType(1, "unknown_type"), null);
  });

  it("falls back to (inbox=true, push=true, email=false) when the player row is missing", async () => {
    state.player = null;
    const ch = await socialChannelsForType(1, "post_reaction");
    assert.deepEqual(ch, { inbox: true, push: true, email: false });
  });

  it("uses schema defaults (inbox=on, push=on, email=off) when nothing is overridden", async () => {
    state.player = defaults();
    for (const type of ["post_reaction", "post_comment", "post_mention", "new_follower"]) {
      const ch = await socialChannelsForType(1, type);
      assert.deepEqual(ch, { inbox: true, push: true, email: false }, `defaults for ${type}`);
    }
  });

  it("legacy master toggle (notifySocial<Base>=false) silences every channel — even when per-channel email is on", async () => {
    for (const base of BASES) {
      state.player = defaults({
        [`notifySocial${base}`]: false,
        // Per-channel flags all on (including email) — master must override.
        [`notifySocial${base}Inbox`]: true,
        [`notifySocial${base}Push`]: true,
        [`notifySocial${base}Email`]: true,
      });
      // Pick one type for each base.
      const type = base === "Reactions" ? "post_reaction"
        : base === "Replies" ? "post_comment"
        : base === "Mentions" ? "post_mention"
        : "new_follower";
      const ch = await socialChannelsForType(1, type);
      assert.deepEqual(ch, { inbox: false, push: false, email: false }, `master off for ${base}`);
    }
  });

  it("per-channel inbox=false silences only inbox; push stays on, email follows its own flag", async () => {
    state.player = defaults({ notifySocialReactionsInbox: false });
    const ch = await socialChannelsForType(1, "post_reaction");
    assert.deepEqual(ch, { inbox: false, push: true, email: false });

    state.player = defaults({ notifySocialReactionsInbox: false, notifySocialReactionsEmail: true });
    const ch2 = await socialChannelsForType(1, "comment_like");
    assert.deepEqual(ch2, { inbox: false, push: true, email: true });
  });

  it("per-channel push=false silences only push", async () => {
    state.player = defaults({ notifySocialRepliesPush: false });
    const ch = await socialChannelsForType(1, "post_comment");
    assert.deepEqual(ch, { inbox: true, push: false, email: false });
  });

  it("per-channel email=true opts in to email without touching inbox/push", async () => {
    state.player = defaults({ notifySocialMentionsEmail: true });
    const ch = await socialChannelsForType(1, "post_mention");
    assert.deepEqual(ch, { inbox: true, push: true, email: true });

    // comment_mention and club_mention share the same base.
    const ch2 = await socialChannelsForType(1, "comment_mention");
    assert.deepEqual(ch2, { inbox: true, push: true, email: true });
    const ch3 = await socialChannelsForType(1, "club_mention");
    assert.deepEqual(ch3, { inbox: true, push: true, email: true });
  });

  it("each base is gated independently — turning Followers off does not affect Reactions", async () => {
    state.player = defaults({
      notifySocialFollowers: false,
      notifySocialReactionsEmail: true,
    });
    const followers = await socialChannelsForType(1, "new_follower");
    assert.deepEqual(followers, { inbox: false, push: false, email: false });

    const reactions = await socialChannelsForType(1, "post_reaction");
    assert.deepEqual(reactions, { inbox: true, push: true, email: true });
  });

  it("post_reaction and comment_like share the Reactions bucket", async () => {
    state.player = defaults({ notifySocialReactionsPush: false });
    const a = await socialChannelsForType(1, "post_reaction");
    const b = await socialChannelsForType(1, "comment_like");
    assert.deepEqual(a, b);
    assert.equal(a?.push, false);
  });

  it("inbox channel ON when only the inbox flag is set, even with push and email off", async () => {
    state.player = defaults({
      notifySocialReactionsPush: false,
      notifySocialReactionsEmail: false,
      notifySocialReactionsInbox: true,
    });
    const ch = await socialChannelsForType(1, "post_reaction");
    assert.deepEqual(ch, { inbox: true, push: false, email: false });
  });

  it("all twelve per-channel toggles act independently", async () => {
    // Sweep: for each base × channel, flip just that single channel off
    // (or, for email, on) and assert nothing else moves.
    for (const base of BASES) {
      const type = base === "Reactions" ? "post_reaction"
        : base === "Replies" ? "post_comment"
        : base === "Mentions" ? "post_mention"
        : "new_follower";

      // inbox off
      state.player = defaults({ [`notifySocial${base}Inbox`]: false });
      assert.deepEqual(
        await socialChannelsForType(1, type),
        { inbox: false, push: true, email: false },
        `${base}: inbox off should only silence inbox`,
      );

      // push off
      state.player = defaults({ [`notifySocial${base}Push`]: false });
      assert.deepEqual(
        await socialChannelsForType(1, type),
        { inbox: true, push: false, email: false },
        `${base}: push off should only silence push`,
      );

      // email on
      state.player = defaults({ [`notifySocial${base}Email`]: true });
      assert.deepEqual(
        await socialChannelsForType(1, type),
        { inbox: true, push: true, email: true },
        `${base}: email opt-in should only enable email`,
      );
    }
  });
});

describe("isSocialNotificationAllowed (back-compat shim)", () => {
  it("returns true for non-social types (no per-type gate applies)", async () => {
    state.player = defaults();
    assert.equal(await isSocialNotificationAllowed(1, "challenge_invite"), true);
  });

  it("tracks the inbox channel only", async () => {
    state.player = defaults({ notifySocialReactionsInbox: false });
    assert.equal(await isSocialNotificationAllowed(1, "post_reaction"), false);

    state.player = defaults({ notifySocialReactionsPush: false });
    assert.equal(
      await isSocialNotificationAllowed(1, "post_reaction"),
      true,
      "push off does not affect the inbox-shim's answer",
    );

    state.player = defaults({ notifySocialReactions: false });
    assert.equal(
      await isSocialNotificationAllowed(1, "post_reaction"),
      false,
      "master off still silences inbox",
    );
  });
});

describe("SOCIAL_NOTIFY_PREF_KEYS", () => {
  it("lists every base's master key", () => {
    assert.deepEqual([...SOCIAL_NOTIFY_PREF_KEYS].sort(), [
      "notifySocialFollowers",
      "notifySocialMentions",
      "notifySocialReactions",
      "notifySocialReplies",
    ]);
  });
});
