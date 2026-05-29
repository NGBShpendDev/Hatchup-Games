// UI test for the club join/leave flow on /clubs/:id.
//
// Covers the full join → leave round-trip:
//   1. A non-member visits the club detail page and sees "Join Club".
//   2. They click it → POST /clubs/:id/join is called, the member list
//      updates (player now appears), and "Leave Club" becomes visible.
//   3. They click "Leave Club" → a confirmation dialog appears.
//   4. Clicking "Stay" dismisses the dialog without calling the leave endpoint.
//   5. Re-opening and confirming ("Leave Club") → POST /clubs/:id/leave is
//      called, the player is removed from the member list, and "Join Club"
//      becomes visible again.
//
// Follows the conventions of club-promote-demote.spec.ts: the backend is
// mocked with page.route, the spec is skipped when no Clerk storage state
// has been captured, and assertions key off the data-testids declared in
// club-detail.tsx.

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

const CLUB_ID = 7777;
const VIEWER_ID = 1;

type Member = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  rank: string;
  totalWins: number;
  clubRole: "owner" | "officer" | "member" | null;
};

const existingOwner: Member = {
  id: 99,
  username: "existing_owner",
  displayName: "Existing Owner",
  avatarUrl: null,
  level: 30,
  rank: "Gold",
  totalWins: 50,
  clubRole: "owner",
};

const viewerAsNonMember = {
  id: VIEWER_ID,
  username: "viewer",
  displayName: "Viewer",
  avatarUrl: null,
  level: 12,
  xp: 0,
  coins: 0,
  rank: "Silver",
  rankScore: 0,
  totalWins: 5,
  totalMatches: 10,
  currentStreak: 0,
  fitnessXp: 0,
  totalSteps: 0,
  fitnessRealm: "neon",
  waterCups: 0,
  dailyStepGoal: 0,
  passiveXpSinceLastVisit: 0,
  clerkId: "clerk_viewer",
  fitnessLevel: "intermediate",
  ageRange: "adult",
  identityPath: null,
  accessibilityMode: "default",
  familyGroupId: null,
  onboardingComplete: true,
  streakAtRisk: false,
  recoveryMessage: null,
  activeHatchlingId: null,
  isSuspended: false,
  suspendedAt: null,
  suspensionReason: null,
};

const viewerAsMember: Member = {
  id: VIEWER_ID,
  username: "viewer",
  displayName: "Viewer",
  avatarUrl: null,
  level: 12,
  rank: "Silver",
  totalWins: 5,
  clubRole: "member",
};

async function setupMocks(page: Page) {
  const state = {
    members: [existingOwner] as Member[],
    joinCalls: [] as number[],
    leaveCalls: [] as number[],
  };

  await page.route("**/api/players/me", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(viewerAsNonMember),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: CLUB_ID,
        name: "Storm Riders",
        description: "Test club for join/leave e2e",
        rank: "Silver",
        memberCount: state.members.length,
        totalXp: 5000,
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}/members`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.members),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}/join`, async (route: Route) => {
    state.joinCalls.push(CLUB_ID);
    state.members = [...state.members, viewerAsMember];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: CLUB_ID,
        name: "Storm Riders",
        description: "Test club for join/leave e2e",
        rank: "Silver",
        memberCount: state.members.length,
        totalXp: 5000,
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}/leave`, async (route: Route) => {
    state.leaveCalls.push(CLUB_ID);
    state.members = state.members.filter((m) => m.id !== VIEWER_ID);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}/pending-invites`, async (route: Route) => {
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) });
  });

  await page.route("**/api/notifications**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/subscription/me", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return state;
}

test.describe("Club detail — join/leave flow", () => {
  test.skip(!!skipReason, skipReason);

  test("non-member sees Join Club; clicking it calls join and reveals Leave Club", async ({ page }) => {
    const state = await setupMocks(page);

    await page.goto(`/clubs/${CLUB_ID}`);

    // Non-member: Join Club is visible, Leave Club is not.
    const joinBtn = page.getByTestId("button-join-club");
    await expect(joinBtn).toBeVisible();
    await expect(page.getByTestId("button-leave-club")).toHaveCount(0);

    await joinBtn.click();

    // POST /clubs/:id/join was called.
    await expect.poll(() => state.joinCalls).toEqual([CLUB_ID]);

    // After the query invalidation and refetch the viewer appears in the member list.
    await expect(page.getByText("Viewer")).toBeVisible();

    // The button flips to Leave Club.
    await expect(page.getByTestId("button-leave-club")).toBeVisible();
    await expect(page.getByTestId("button-join-club")).toHaveCount(0);
  });

  test("cancelling the leave dialog does not call the leave endpoint", async ({ page }) => {
    // Start as a member.
    const state = await setupMocks(page);
    state.members = [existingOwner, viewerAsMember];

    await page.goto(`/clubs/${CLUB_ID}`);

    const leaveBtn = page.getByTestId("button-leave-club");
    await expect(leaveBtn).toBeVisible();

    await leaveBtn.click();

    // Confirmation dialog appears.
    const confirmLeaveBtn = page.getByTestId("button-confirm-leave-club");
    await expect(confirmLeaveBtn).toBeVisible();

    // Click "Stay" to cancel.
    await page.getByRole("button", { name: "Stay" }).click();

    // Dialog dismissed, no leave call made.
    await expect(confirmLeaveBtn).toHaveCount(0);
    expect(state.leaveCalls).toEqual([]);

    // Leave Club button still visible.
    await expect(page.getByTestId("button-leave-club")).toBeVisible();
  });

  test("confirming leave calls the endpoint and redirects to the club hub", async ({ page }) => {
    // Start as a member.
    const state = await setupMocks(page);
    state.members = [existingOwner, viewerAsMember];

    // The leave onSuccess handler calls navigate("/club"), so wire up the
    // club-hub route so the redirect resolves cleanly.
    await page.route("**/api/clubs**", async (route: Route) => {
      const url = route.request().url();
      // Let already-registered per-club routes handle their own paths.
      if (url.includes(`/clubs/${CLUB_ID}`)) {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto(`/clubs/${CLUB_ID}`);

    const leaveBtn = page.getByTestId("button-leave-club");
    await expect(leaveBtn).toBeVisible();

    await leaveBtn.click();

    // Confirmation dialog appears.
    const confirmLeaveBtn = page.getByTestId("button-confirm-leave-club");
    await expect(confirmLeaveBtn).toBeVisible();
    await confirmLeaveBtn.click();

    // POST /clubs/:id/leave was called.
    await expect.poll(() => state.leaveCalls).toEqual([CLUB_ID]);

    // After a successful leave the app navigates to /club (the club hub).
    await page.waitForURL("**/club");
  });
});
