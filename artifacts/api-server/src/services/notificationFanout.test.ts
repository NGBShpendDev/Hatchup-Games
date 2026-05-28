import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

interface CapturedPush {
  playerId: number;
  payload: {
    title: string;
    body: string;
    link?: string;
    category: string;
    tag?: string;
  };
}

const captured: CapturedPush[] = [];

mock.module("./pushNotifications.ts", {
  namedExports: {
    async sendPushToPlayer(playerId: number, payload: CapturedPush["payload"]) {
      captured.push({ playerId, payload });
    },
  },
});

const { pushForNotification, NOTIFICATION_TYPE_TO_PUSH_CATEGORY } = await import("./notificationFanout.ts");

describe("pushForNotification", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("fans out a known notification type to its mapped push category", async () => {
    const ok = await pushForNotification(
      {
        playerId: 7,
        type: "rematch_invite",
        title: "Wants a rematch",
        body: "tap to accept",
        link: "/compete/battle?rematch=abc",
      },
      { tag: "rematch-invite-abc" },
    );

    assert.equal(ok, true);
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      playerId: 7,
      payload: {
        title: "Wants a rematch",
        body: "tap to accept",
        link: "/compete/battle?rematch=abc",
        category: "invites",
        tag: "rematch-invite-abc",
      },
    });
  });

  it("falls back to '/' when link is null", async () => {
    await pushForNotification({
      playerId: 1,
      type: "account_suspended",
      title: "Suspended",
      body: "details",
      link: null,
    });
    assert.equal(captured[0]?.payload.link, "/");
    assert.equal(captured[0]?.payload.category, "invites");
  });

  it("returns false and does not push for unknown types", async () => {
    const ok = await pushForNotification({
      playerId: 1,
      type: "totally_made_up_type",
      title: "x",
      body: "y",
      link: "/z",
    });
    assert.equal(ok, false);
    assert.equal(captured.length, 0);
  });

  it("maps every expected notification type to a real push category", () => {
    const expectedCategories = new Set(["invites", "endingSoon", "completed", "nutritionRecap"]);
    for (const [type, category] of Object.entries(NOTIFICATION_TYPE_TO_PUSH_CATEGORY)) {
      assert.ok(
        expectedCategories.has(category),
        `type ${type} mapped to unknown category ${category}`,
      );
    }
    // Sanity-check the headline types listed in the task description are covered.
    for (const t of [
      "account_suspended",
      "account_restored",
      "account_verified",
      "tournament_eliminated",
      "tournament_advanced",
      "tournament_champion",
      "challenge_invite",
      "club_invite",
      "rematch_invite",
      "nutrition_recap",
    ]) {
      assert.ok(NOTIFICATION_TYPE_TO_PUSH_CATEGORY[t], `missing mapping for ${t}`);
    }
  });
});
