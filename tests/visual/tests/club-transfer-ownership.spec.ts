// UI test for the "Transfer ownership" flow on /clubs/:id.
//
// Pins the happy path the task brief calls out:
//   1. A signed-in club owner opens the Transfer ownership sheet.
//   2. Picks another member and confirms the AlertDialog.
//   3. The badges swap: the new pick gets the yellow Owner / Crown
//      badge, the former owner is shown as Officer.
//   4. The "Leave Club" button becomes enabled (it was disabled while
//      the viewer was still the owner — see the title="Transfer
//      ownership before leaving" affordance in club-detail.tsx).
//
// The whole backend is mocked with page.route so this spec only needs a
// Clerk-authenticated browser context. It mirrors the conventions used
// by rematch-notifications.spec.ts: skip cleanly when no storage state
// has been captured, and assert on test-ids declared in the page.

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

const CLUB_ID = 4242;
const VIEWER_ID = 1;
const TARGET_ID = 2;

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

function makeViewer(role: Member["clubRole"]): Member {
  return {
    id: VIEWER_ID,
    username: "viewer",
    displayName: "Viewer",
    avatarUrl: null,
    level: 20,
    rank: "Gold",
    totalWins: 12,
    clubRole: role,
  };
}

function makeTarget(role: Member["clubRole"]): Member {
  return {
    id: TARGET_ID,
    username: "successor",
    displayName: "Successor",
    avatarUrl: null,
    level: 18,
    rank: "Gold",
    totalWins: 9,
    clubRole: role,
  };
}

async function setupMocks(page: Page) {
  // Members list — we flip the roles AFTER the transfer endpoint is
  // called so the UI re-renders with the swapped badges.
  const state = {
    members: [makeViewer("owner"), makeTarget("member")] as Member[],
    transferCalls: [] as Array<{ id: number; newOwnerId: number }>,
  };

  // /api/players/me — must report the viewer's id so the page can
  // detect they are the owner of this club.
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
        name: "Neon Nighthawks",
        description: "Test club for ownership transfer e2e",
        rank: "Gold",
        memberCount: state.members.length,
        totalXp: 12345,
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

  // Pending invites — the page treats a 403 here as "viewer is not an
  // admin, hide the section". Returning an empty array is fine for an
  // owner viewer and avoids extra UI noise.
  await page.route(`**/api/clubs/${CLUB_ID}/pending-invites`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route(
    `**/api/clubs/${CLUB_ID}/transfer-ownership`,
    async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        newOwnerId?: number;
      };
      const newOwnerId = body.newOwnerId ?? -1;
      state.transferCalls.push({ id: CLUB_ID, newOwnerId });

      // Flip the roles so the next /members refetch shows the swap.
      state.members = state.members.map((m) => {
        if (m.id === VIEWER_ID) return { ...m, clubRole: "officer" };
        if (m.id === newOwnerId) return { ...m, clubRole: "owner" };
        return m;
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, newOwnerId }),
      });
    },
  );

  // Catch-alls so unrelated background fetches the Layout fires don't
  // hang or generate console noise. They all return benign payloads.
  await page.route("**/api/notifications**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/subscription/me", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return state;
}

test.describe("Club detail — transfer ownership", () => {
  test.skip(!!skipReason, skipReason);

  test("owner picks a member, confirms, badges swap, Leave Club becomes enabled", async ({ page }) => {
    const state = await setupMocks(page);

    await page.goto(`/clubs/${CLUB_ID}`);

    // Sanity-check the starting state: viewer is shown as owner so the
    // Leave Club button is disabled and Transfer ownership is visible.
    const openTransfer = page.getByTestId("button-open-transfer-ownership");
    await expect(openTransfer).toBeVisible();

    const leaveBtn = page.getByTestId("button-leave-club");
    await expect(leaveBtn).toBeVisible();
    await expect(leaveBtn).toBeDisabled();

    // Open the transfer ownership bottom sheet.
    await openTransfer.click();

    // Pick the candidate. The Transfer button is disabled until a
    // member is chosen.
    const transferBtn = page.getByTestId("button-transfer-ownership");
    await expect(transferBtn).toBeDisabled();
    await page.getByTestId(`button-pick-new-owner-${TARGET_ID}`).click();
    await expect(transferBtn).toBeEnabled();
    await transferBtn.click();

    // Confirm in the AlertDialog.
    const confirm = page.getByTestId("button-confirm-transfer-ownership");
    await expect(confirm).toBeVisible();
    await confirm.click();

    // The endpoint was called exactly once with the right newOwnerId.
    await expect.poll(() => state.transferCalls).toEqual([
      { id: CLUB_ID, newOwnerId: TARGET_ID },
    ]);

    // After the refetch the badges have swapped. We scope by the Link
    // to /players/<id> so each member's role chip is unambiguous.
    const newOwnerCard = page.locator(`a[href="/players/${TARGET_ID}"]`);
    await expect(newOwnerCard.getByText("Owner", { exact: true })).toBeVisible();

    const oldOwnerCard = page.locator(`a[href="/players/${VIEWER_ID}"]`);
    await expect(oldOwnerCard.getByText("Officer", { exact: true })).toBeVisible();

    // And the Transfer ownership entry-point disappears (viewer is no
    // longer the owner), while Leave Club becomes enabled.
    await expect(page.getByTestId("button-open-transfer-ownership")).toHaveCount(0);
    await expect(page.getByTestId("button-leave-club")).toBeEnabled();
  });
});
