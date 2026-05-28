// Unit tests for notifyModerationAction.
//
// Verifies that the helper:
//   - inserts an in-app notification with the right type/title/body/link
//   - includes the admin reason in the body when provided
//   - only sends email when a provider is configured AND the player has an
//     address on file AND has opted in via notifyModerationEmail
//   - never throws — failures are swallowed and logged
//
// DB and email-provider are mocked via `node:test` module mocks.

import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

interface InsertedNotification {
  playerId: number;
  type: string;
  title: string;
  body: string;
  link: string;
  sourceId?: number | null;
}

interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const state = {
  inserts: [] as InsertedNotification[],
  insertShouldThrow: false,
  player: null as null | {
    email: string | null;
    notifyModerationEmail: boolean;
    displayName: string | null;
    username: string;
  },
  emailConfigured: true,
  emails: [] as SentEmail[],
  emailSendShouldThrow: false,
};

function reset() {
  state.inserts = [];
  state.insertShouldThrow = false;
  state.player = null;
  state.emailConfigured = true;
  state.emails = [];
  state.emailSendShouldThrow = false;
}

mock.module("drizzle-orm", {
  namedExports: {
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  },
});

mock.module("@workspace/db", {
  namedExports: {
    db: {
      insert(_table: unknown) {
        return {
          async values(v: InsertedNotification) {
            if (state.insertShouldThrow) throw new Error("insert failed");
            state.inserts.push(v);
          },
        };
      },
      query: {
        playersTable: {
          findFirst: async () => state.player,
        },
      },
    },
    notificationsTable: {},
    playersTable: { id: {} },
  },
});

mock.module("./pushNotifications.ts", {
  namedExports: {
    sendPushToPlayer: async () => {},
  },
});

mock.module("./emailService.ts", {
  namedExports: {
    isEmailConfigured: () => state.emailConfigured,
    sendTransactionalEmail: async (msg: SentEmail) => {
      if (state.emailSendShouldThrow) throw new Error("email failed");
      state.emails.push(msg);
      return true;
    },
  },
});

let notifyModerationAction: typeof import("./moderationNotify.ts").notifyModerationAction;

before(async () => {
  ({ notifyModerationAction } = await import("./moderationNotify.ts"));
});

beforeEach(reset);

describe("notifyModerationAction", () => {
  it("inserts an in-app notification on suspend with reason in the body", async () => {
    state.player = { email: null, notifyModerationEmail: true, displayName: null, username: "alice" };
    await notifyModerationAction(42, "suspend", "Spamming chat");
    assert.equal(state.inserts.length, 1);
    const n = state.inserts[0]!;
    assert.equal(n.playerId, 42);
    assert.equal(n.type, "account_suspended");
    assert.match(n.title, /suspended/i);
    assert.match(n.body, /Spamming chat/);
    assert.equal(n.link, "/safety/guidelines");
  });

  it("uses fallback body copy when no reason is provided", async () => {
    state.player = { email: null, notifyModerationEmail: true, displayName: null, username: "alice" };
    await notifyModerationAction(42, "unsuspend", null);
    const n = state.inserts[0]!;
    assert.equal(n.type, "account_restored");
    assert.match(n.body, /reinstated/i);
    assert.doesNotMatch(n.body, /Reason:/);
  });

  it("uses the verify copy with link to /safety/guidelines", async () => {
    state.player = { email: null, notifyModerationEmail: true, displayName: null, username: "alice" };
    await notifyModerationAction(42, "verify", "Looks good");
    const n = state.inserts[0]!;
    assert.equal(n.type, "account_verified");
    assert.match(n.title, /verified/i);
    assert.equal(n.link, "/safety/guidelines");
  });

  it("sends email when configured, email on file, and notifyModerationEmail=true", async () => {
    state.player = { email: "a@b.test", notifyModerationEmail: true, displayName: "Alice", username: "alice" };
    await notifyModerationAction(42, "suspend", "Spamming chat");
    assert.equal(state.emails.length, 1);
    const e = state.emails[0]!;
    assert.equal(e.to, "a@b.test");
    assert.match(e.subject, /suspended/i);
    assert.match(e.html, /Spamming chat/);
    assert.match(e.html, /\/safety\/guidelines/);
  });

  it("skips email when email provider is not configured", async () => {
    state.emailConfigured = false;
    state.player = { email: "a@b.test", notifyModerationEmail: true, displayName: "Alice", username: "alice" };
    await notifyModerationAction(42, "suspend", null);
    assert.equal(state.inserts.length, 1);
    assert.equal(state.emails.length, 0);
  });

  it("skips email when player has no address on file", async () => {
    state.player = { email: null, notifyModerationEmail: true, displayName: null, username: "alice" };
    await notifyModerationAction(42, "suspend", null);
    assert.equal(state.emails.length, 0);
  });

  it("skips email when player has opted out via notifyModerationEmail=false", async () => {
    state.player = { email: "a@b.test", notifyModerationEmail: false, displayName: "Alice", username: "alice" };
    await notifyModerationAction(42, "verify", null);
    assert.equal(state.inserts.length, 1);
    assert.equal(state.emails.length, 0);
  });

  it("never throws when the notifications insert fails", async () => {
    state.insertShouldThrow = true;
    state.player = { email: "a@b.test", notifyModerationEmail: true, displayName: "Alice", username: "alice" };
    await assert.doesNotReject(() => notifyModerationAction(42, "suspend", null));
    // The email path should still attempt to fire.
    assert.equal(state.emails.length, 1);
  });

  it("never throws when the email send fails", async () => {
    state.emailSendShouldThrow = true;
    state.player = { email: "a@b.test", notifyModerationEmail: true, displayName: "Alice", username: "alice" };
    await assert.doesNotReject(() => notifyModerationAction(42, "suspend", null));
    assert.equal(state.inserts.length, 1);
  });

  it("HTML-escapes the moderator reason in the email body", async () => {
    state.player = { email: "a@b.test", notifyModerationEmail: true, displayName: "Alice", username: "alice" };
    await notifyModerationAction(42, "suspend", "<script>alert(1)</script>");
    const e = state.emails[0]!;
    assert.doesNotMatch(e.html, /<script>alert/);
    assert.match(e.html, /&lt;script&gt;alert/);
  });
});
