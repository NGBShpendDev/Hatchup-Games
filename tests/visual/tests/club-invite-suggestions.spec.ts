// UI test for the club invite suggestions flow on /clubs/:id.
//
// Pins the happy path the task brief calls out:
//   1. A signed-in club owner opens the "Invite player" sheet.
//   2. Before typing, the "Suggested for you" header
//      (data-testid="invite-suggestions-header") is visible and player
//      suggestion rows are rendered.
//   3. After typing a search query the suggestions header disappears and
//      search result rows appear instead.
//
// The whole backend is mocked with page.route so this spec only needs a
// Clerk-authenticated browser context. Follows the conventions of
// club-promote-demote.spec.ts and club-transfer-ownership.spec.ts.

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

const CLUB_ID = 5151;
const VIEWER_ID = 1;
const SUGGESTION_ID = 10;
const SEARCH_RESULT_ID = 20;

async function setupMocks(page: Page) {
  await page.route("**/api/players/me", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: VIEWER_ID,
        username: "viewer",
        displayName: "Viewer",
        avatarUrl: null,
        level: 20,
        xp: 0,
        coins: 0,
        rank: "Gold",
        rankScore: 0,
        totalWins: 12,
        totalMatches: 20,
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
      }),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: CLUB_ID,
        name: "Neon Invitors",
        description: "Test club for invite-suggestions e2e",
        rank: "Gold",
        memberCount: 1,
        totalXp: 9999,
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    });
  });

  // Members list — viewer is the sole owner so canInvite is true and
  // SUGGESTION_ID / SEARCH_RESULT_ID are not already members.
  await page.route(`**/api/clubs/${CLUB_ID}/members`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: VIEWER_ID,
          username: "viewer",
          displayName: "Viewer",
          avatarUrl: null,
          level: 20,
          rank: "Gold",
          totalWins: 12,
          clubRole: "owner",
        },
      ]),
    });
  });

  await page.route(`**/api/clubs/${CLUB_ID}/pending-invites`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // Invite-suggestions — returned before any search query is typed.
  await page.route("**/api/players/invite-suggestions**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: SUGGESTION_ID,
          username: "suggested_player",
          displayName: "Suggested Player",
          avatarUrl: null,
          level: 15,
          rank: "Silver",
          totalWins: 5,
        },
      ]),
    });
  });

  // Player search — returned once a query is typed.
  await page.route("**/api/players/search**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: SEARCH_RESULT_ID,
          username: "found_player",
          displayName: "Found Player",
          avatarUrl: null,
          level: 12,
          rank: "Bronze",
          totalWins: 3,
        },
      ]),
    });
  });

  // Catch-alls for background fetches the Layout fires.
  await page.route("**/api/notifications**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/subscription/me", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

test.describe("Club detail — invite suggestions", () => {
  test.skip(!!skipReason, skipReason);

  test(
    "suggestions header visible before typing; hidden and replaced by search results after typing",
    async ({ page }) => {
      await setupMocks(page);

      await page.goto(`/clubs/${CLUB_ID}`);

      // Open the invite sheet.
      const openInviteBtn = page.getByTestId("button-open-invite");
      await expect(openInviteBtn).toBeVisible();
      await openInviteBtn.click();

      // Before typing — suggestions header and a suggestion row must be visible.
      const suggestionsHeader = page.getByTestId("invite-suggestions-header");
      await expect(suggestionsHeader).toBeVisible();

      const suggestionRow = page.getByTestId(`invite-result-${SUGGESTION_ID}`);
      await expect(suggestionRow).toBeVisible();

      // Type a search query — the header must disappear and the search
      // result row must appear in its place.
      const searchInput = page.getByTestId("input-invite-search");
      await searchInput.fill("found");

      await expect(suggestionsHeader).toHaveCount(0);

      const searchRow = page.getByTestId(`invite-result-${SEARCH_RESULT_ID}`);
      await expect(searchRow).toBeVisible();

      // The suggestion row from before must no longer be shown.
      await expect(page.getByTestId(`invite-result-${SUGGESTION_ID}`)).toHaveCount(0);
    },
  );
});
