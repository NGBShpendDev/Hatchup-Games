// UI test for the SuspendedScreen full-screen blocker.
//
// Covers two behaviors that the app-level shell depends on:
//   - When the signed-in player's `isSuspended` flag is true, the app
//     replaces the whole route shell with the SuspendedScreen rather
//     than rendering any of the normal navigable pages.
//   - The "Submit appeal" CTA inside SuspendedScreen actually fires
//     POST /api/account/appeals with the message the user typed.
//
// Backend state is mocked entirely with page.route so this spec only
// requires a Clerk-authenticated browser context (the protected app
// shell needs a real Clerk session to mount). If no storage state is
// captured the test skips with a clear reason, matching the
// convention in showcase-swap.spec.ts and rematch-notifications.spec.ts.

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

const SUSPENDED_AT = "2025-04-12T15:30:00.000Z";
const SUSPENSION_REASON = "spam and harassment";

type Player = {
  id: number;
  username: string;
  displayName: string;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  // The PlayerProfile shape has many fields; the suspended-screen path
  // only inspects isSuspended/suspendedAt/suspensionReason. Anything
  // else can default to safe empties.
  [key: string]: unknown;
};

function makeSuspendedPlayer(): Player {
  return {
    id: 42,
    username: "suspended_user",
    displayName: "Suspended User",
    isSuspended: true,
    suspendedAt: SUSPENDED_AT,
    suspensionReason: SUSPENSION_REASON,
    avatarUrl: null,
    bio: null,
    xp: 0,
    level: 1,
    coins: 0,
    streakDays: 0,
  };
}

async function setupSuspendedMocks(
  page: Page,
  state: {
    player: Player;
    appealPosts: Array<{ message: string }>;
  },
) {
  // PlayerProvider boot fetch.
  await page.route("**/api/players/me", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.player),
    });
  });
  // SuspendedScreen reads the dedicated snapshot.
  await page.route("**/api/players/me/suspension", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        isSuspended: true,
        suspendedAt: SUSPENDED_AT,
        suspensionReason: SUSPENSION_REASON,
        suspendedByAdmin: { id: 1, username: "alice", displayName: "Alice Admin" },
      }),
    });
  });
  // No prior appeal on record.
  await page.route("**/api/account/appeals/mine", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ appeal: null }),
    });
  });
  // Capture the appeal submission and return a created row so the
  // toast path completes.
  await page.route("**/api/account/appeals", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as { message?: string };
    state.appealPosts.push({ message: String(body?.message ?? "") });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        appeal: {
          id: 1,
          playerId: state.player.id,
          message: body?.message ?? "",
          status: "pending",
          reviewerNote: null,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        },
      }),
    });
  });
  // Catch-all benign stubs for anything else the shell might eagerly
  // fetch on boot — the SuspendedScreen short-circuits the router so
  // most of this never runs, but the PlayerProvider/Clerk path can
  // still hit a few endpoints depending on what's wired up.
  await page.route("**/api/notifications/unread-count", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) });
  });
}

test.describe("SuspendedScreen — full-shell blocker", () => {
  test.skip(!!skipReason, skipReason);

  test("replaces the app shell when the player is suspended", async ({ page }) => {
    const state = {
      player: makeSuspendedPlayer(),
      appealPosts: [] as Array<{ message: string }>,
    };
    await setupSuspendedMocks(page, state);

    await page.goto("/");

    // The full-screen blocker is mounted.
    const screen = page.getByTestId("screen-account-suspended");
    await expect(screen).toBeVisible();

    // It shows the recorded reason (the "no reason" placeholder must
    // NOT appear when a reason exists).
    await expect(page.getByTestId("text-suspended-reason")).toContainText(SUSPENSION_REASON);
    await expect(page.getByTestId("text-suspended-no-reason")).toHaveCount(0);

    // The "Suspended since …" header is rendered with the admin label.
    const since = page.getByTestId("text-suspended-since");
    await expect(since).toBeVisible();
    await expect(since).toContainText("by Alice Admin");

    // None of the normal app routes render alongside it — e.g. the
    // home page hatchling grid never mounts. We assert on a few
    // hallmark testids that would be present on the normal shell.
    await expect(page.locator('[data-testid^="card-hatchling-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-nav-hatchlings"]')).toHaveCount(0);
  });

  test("submitting an appeal POSTs to /api/account/appeals with the typed message", async ({ page }) => {
    const state = {
      player: makeSuspendedPlayer(),
      appealPosts: [] as Array<{ message: string }>,
    };
    await setupSuspendedMocks(page, state);

    await page.goto("/");
    await expect(page.getByTestId("screen-account-suspended")).toBeVisible();

    // Open the appeal dialog.
    await page.getByTestId("button-open-appeal").click();
    await expect(page.getByTestId("dialog-submit-appeal")).toBeVisible();

    // Type a message that comfortably clears APPEAL_MIN_LEN.
    const message =
      "I think this suspension is a mistake — I was reporting spam, not creating it.";
    await page.getByTestId("textarea-appeal-message").fill(message);

    // The submit button enables and we click it.
    const submit = page.getByTestId("button-submit-appeal");
    await expect(submit).toBeEnabled();
    await submit.click();

    // POST /api/account/appeals fired exactly once with the trimmed
    // message verbatim.
    await expect.poll(() => state.appealPosts.length).toBe(1);
    expect(state.appealPosts[0]!.message).toBe(message);
  });
});
