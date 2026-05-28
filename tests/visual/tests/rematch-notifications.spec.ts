// UI test for the rematch invite buttons on the notifications page.
//
// Covers the two inline actions added to /notifications:
//   - Clicking Accept on a pending rematch invite calls
//     POST /api/battles/rematch/<id>/accept AND navigates to
//     /compete/battle?rematch=<id> (so the user lands in the queue).
//   - Clicking Decline calls POST /api/battles/rematch/<id>/decline AND
//     marks the underlying notification row as read
//     (POST /api/notifications/<id>/read).
//
// Backend state is mocked entirely with page.route — this spec only
// requires a Clerk-authenticated browser context so the protected
// /notifications route actually renders. If no storage state has been
// captured the test skips with a clear reason, matching the convention
// in showcase-swap.spec.ts.

import { test, expect, type Page, type Route } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const storageStatePath = path.resolve(
  process.env.HATCHUP_STORAGE_STATE ||
    path.join(import.meta.dirname, "..", "auth", "storageState.json"),
);

const hasAuth = existsSync(storageStatePath);
const skipReason = !hasAuth
  ? `No Clerk storage state found at ${storageStatePath}. ` +
    `See tests/visual/README.md for how to capture it before running this spec.`
  : "";

const INVITE_ID = "test-invite-abc";
const NOTIF_ID = 4242;

type NotifRow = {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
  sourceId: number | null;
};

function makeRematchNotif(overrides: Partial<NotifRow> = {}): NotifRow {
  return {
    id: NOTIF_ID,
    type: "rematch_invite",
    title: "Rival wants a rematch!",
    body: "Casual battle · expires in 5 minutes",
    link: `/compete/battle?rematch=${INVITE_ID}`,
    read: false,
    createdAt: new Date().toISOString(),
    sourceId: 555,
    ...overrides,
  };
}

// Wire up route mocks for the notifications page. The accept/decline
// stubs push into the captured arrays so the test can assert which
// endpoints fired with what params.
async function setupMocks(
  page: Page,
  state: {
    notif: NotifRow;
    acceptCalls: string[];
    declineCalls: string[];
    markReadCalls: number[];
  },
) {
  await page.route("**/api/notifications?**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([state.notif]) });
  });
  await page.route("**/api/notifications/unread-count", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ count: state.notif.read ? 0 : 1 }),
    });
  });
  await page.route("**/api/notifications/*/read", async (route: Route) => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split("/").filter(Boolean).at(-2));
    if (!Number.isNaN(id)) {
      state.markReadCalls.push(id);
      if (id === state.notif.id) state.notif.read = true;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/battles/rematch/*/accept", async (route: Route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").filter(Boolean).at(-2)!;
    state.acceptCalls.push(id);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, inviteId: id }),
    });
  });
  await page.route("**/api/battles/rematch/*/decline", async (route: Route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").filter(Boolean).at(-2)!;
    state.declineCalls.push(id);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  // The /compete/battle landing page would normally need a lot of
  // upstream data — for this test we only care that navigation occurred,
  // so stub anything it might fetch eagerly to a benign empty payload.
  await page.route("**/api/battles/rematch/pending", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

test.describe("Notifications page — rematch invite actions", () => {
  test.skip(!!skipReason, skipReason);

  test("clicking Accept calls /battles/rematch/:id/accept and navigates to /compete/battle?rematch=<id>", async ({ page }) => {
    const state = {
      notif: makeRematchNotif(),
      acceptCalls: [] as string[],
      declineCalls: [] as string[],
      markReadCalls: [] as number[],
    };
    await setupMocks(page, state);

    await page.goto("/notifications");
    const row = page.getByTestId(`notification-row-${NOTIF_ID}`);
    await expect(row).toBeVisible();

    const accept = page.getByTestId(`button-accept-rematch-${NOTIF_ID}`);
    await expect(accept).toBeVisible();
    await accept.click();

    // The accept endpoint was hit with the invite id from the link.
    await expect.poll(() => state.acceptCalls).toEqual([INVITE_ID]);

    // The page navigated to the rematch queue link.
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(`/compete/battle?rematch=${INVITE_ID}`);

    // Decline was NOT called.
    expect(state.declineCalls).toEqual([]);
  });

  test("clicking Decline calls /battles/rematch/:id/decline and marks the notification row as read", async ({ page }) => {
    const state = {
      notif: makeRematchNotif(),
      acceptCalls: [] as string[],
      declineCalls: [] as string[],
      markReadCalls: [] as number[],
    };
    await setupMocks(page, state);

    await page.goto("/notifications");
    const decline = page.getByTestId(`button-decline-rematch-${NOTIF_ID}`);
    await expect(decline).toBeVisible();
    await decline.click();

    // Decline endpoint hit with the invite id; accept not called.
    await expect.poll(() => state.declineCalls).toEqual([INVITE_ID]);
    expect(state.acceptCalls).toEqual([]);

    // The unread row was marked read via the notifications API.
    await expect.poll(() => state.markReadCalls).toContain(NOTIF_ID);

    // We stay on /notifications — decline doesn't navigate.
    expect(new URL(page.url()).pathname).toBe("/notifications");
  });
});
