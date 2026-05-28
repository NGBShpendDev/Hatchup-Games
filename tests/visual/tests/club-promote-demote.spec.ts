// UI test for the promote/demote member role flow on /clubs/:id.
//
// Pins the happy path the task brief calls out: an owner viewing the
// club detail page can click "Promote" on a member row, the PATCH
// /clubs/:id/members/:playerId endpoint is called with clubRole:"officer",
// and the member's badge flips from Member to Officer after the refetch.
//
// Mirrors the conventions of club-transfer-ownership.spec.ts: backend is
// mocked with page.route, spec is skipped when no Clerk storage state has
// been captured, and assertions key off the data-testids declared in
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

const CLUB_ID = 4343;
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

function makeViewer(): Member {
  return {
    id: VIEWER_ID,
    username: "viewer",
    displayName: "Viewer",
    avatarUrl: null,
    level: 20,
    rank: "Gold",
    totalWins: 12,
    clubRole: "owner",
  };
}

function makeTarget(role: Member["clubRole"]): Member {
  return {
    id: TARGET_ID,
    username: "recruit",
    displayName: "Recruit",
    avatarUrl: null,
    level: 18,
    rank: "Gold",
    totalWins: 9,
    clubRole: role,
  };
}

async function setupMocks(page: Page) {
  // Member list — role flips after the PATCH so the refetch re-renders
  // with the updated Officer badge.
  const state = {
    members: [makeViewer(), makeTarget("member")] as Member[],
    roleCalls: [] as Array<{ id: number; playerId: number; clubRole: string }>,
  };

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
        name: "Neon Promoters",
        description: "Test club for promote/demote e2e",
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

  await page.route(`**/api/clubs/${CLUB_ID}/pending-invites`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route(
    new RegExp(`/api/clubs/${CLUB_ID}/members/\\d+$`),
    async (route: Route) => {
      const url = route.request().url();
      const match = url.match(/\/members\/(\d+)/);
      const playerId = match ? Number(match[1]) : -1;
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        clubRole?: string;
      };
      const nextRole = (body.clubRole ?? "member") as Member["clubRole"];
      state.roleCalls.push({
        id: CLUB_ID,
        playerId,
        clubRole: String(nextRole),
      });

      state.members = state.members.map((m) =>
        m.id === playerId ? { ...m, clubRole: nextRole } : m,
      );

      const updated = state.members.find((m) => m.id === playerId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      });
    },
  );

  // Catch-alls for background fetches the Layout fires.
  await page.route("**/api/notifications**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/subscription/me", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return state;
}

test.describe("Club detail — promote member", () => {
  test.skip(!!skipReason, skipReason);

  test("owner clicks Promote, PATCH fires, member badge flips to Officer", async ({ page }) => {
    const state = await setupMocks(page);

    await page.goto(`/clubs/${CLUB_ID}`);

    // Starting state: target is a Member with a Promote button visible.
    const targetCard = page.locator(`a[href="/players/${TARGET_ID}"]`);
    await expect(targetCard.getByText("Member", { exact: true })).toBeVisible();

    const promoteBtn = page.getByTestId(`button-promote-member-${TARGET_ID}`);
    await expect(promoteBtn).toBeVisible();
    await promoteBtn.click();

    // The PATCH endpoint was called exactly once with clubRole=officer.
    await expect.poll(() => state.roleCalls).toEqual([
      { id: CLUB_ID, playerId: TARGET_ID, clubRole: "officer" },
    ]);

    // After the refetch the target's badge swaps to Officer and the
    // Promote button is replaced by a Demote button.
    await expect(targetCard.getByText("Officer", { exact: true })).toBeVisible();
    await expect(page.getByTestId(`button-demote-member-${TARGET_ID}`)).toBeVisible();
    await expect(page.getByTestId(`button-promote-member-${TARGET_ID}`)).toHaveCount(0);
  });
});
