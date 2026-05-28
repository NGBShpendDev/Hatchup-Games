// E2E test for the Streak Shield buy flow on the **mobile** profile screen.
//
// Task #812 — covers the StreakProtectionCard component in
// artifacts/hatchup-mobile/app/(tabs)/profile.tsx which was added in task #779.
//
// This spec verifies:
//   1. The Streak Protection card is visible on the mobile profile screen.
//   2. The shield count badge is visible (starts at 0).
//   3. Clicking "Buy Shield" opens a confirmation dialog; confirming it fires
//      POST /api/players/me/streak-shield/buy.
//   4. A success message appears after the API call completes.
//   5. The shield count badge updates to reflect the new shield total.
//
// Network calls are stubbed so the test is fully deterministic and requires
// no real coin balance or DB state.
//
// The spec is skipped when the shared Clerk storage state is missing — see
// tests/visual/README.md for how to capture it.

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

// Minimal DailyStreakState that satisfies the StreakProtectionCard rendering.
function makeStreakResponse(shields: number) {
  const today = new Date().toISOString();
  const todayReward = {
    day: 1,
    coins: 50,
    xp: 25,
    kind: "coins" as const,
    label: "Day 1",
    icon: "🪙",
  };
  return {
    currentDay: 1,
    streakBroken: false,
    alreadyClaimed: true,
    lastClaimedAt: today,
    streakShields: shields,
    shieldActive: false,
    todayReward,
    schedule: [todayReward],
  };
}

// Wire up stateful route mocks for the two streak endpoints.
async function setupMobileShieldMocks(page: Page): Promise<void> {
  let shields = 0;

  // Stub GET /api/players/me/daily-streak
  await page.route("**/api/players/me/daily-streak", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeStreakResponse(shields)),
    });
  });

  // Stub POST /api/players/me/streak-shield/buy
  await page.route("**/api/players/me/streak-shield/buy", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    shields += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        streakShields: shields,
        coinsSpent: 200,
        coinsRemaining: 800,
      }),
    });
  });
}

test.describe("Mobile profile – Shield buy flow", () => {
  test.skip(!!skipReason, skipReason);

  test("card visible → buy → confirm dialog → success message → count increments", async ({
    page,
  }) => {
    await setupMobileShieldMocks(page);

    // ── 1. Navigate to the mobile profile tab ──────────────────────────────
    // Expo Router strips the (tabs) group from the URL; the profile screen
    // is accessible at /hatchup-mobile/profile.
    await page.goto("/hatchup-mobile/profile");

    // ── 2. Streak Protection card is visible ───────────────────────────────
    await expect(page.getByText("Streak Protection")).toBeVisible({ timeout: 10_000 });

    // ── 3. Shield count badge is visible (starts at 0) ────────────────────
    const shieldCount = page.getByTestId("streak-shield-count");
    await expect(shieldCount).toBeVisible({ timeout: 8_000 });
    const initialCount = Number((await shieldCount.textContent())?.trim() ?? "0");
    expect(initialCount).toBe(0);

    // ── 4. Buy button is visible ──────────────────────────────────────────
    const buyButton = page.getByTestId("button-buy-shield");
    await expect(buyButton).toBeVisible();
    await expect(buyButton).toContainText("Buy Shield");

    // ── 5. Click the buy button – confirmation dialog appears ─────────────
    // React Native Web maps Alert.alert to window.confirm on the web platform.
    // We accept it to trigger the "Buy" branch.
    page.once("dialog", (dialog) => dialog.accept());
    await buyButton.click();

    // ── 6. Success message appears ────────────────────────────────────────
    const successMsg = page.getByTestId("shield-buy-message");
    await expect(successMsg).toBeVisible({ timeout: 8_000 });
    await expect(successMsg).toContainText("Shield purchased!");

    // ── 7. Shield count increments to 1 ──────────────────────────────────
    // React Query re-fetches /api/players/me/daily-streak after the mutation
    // invalidates the query key; our stub now returns shields = 1.
    await expect(shieldCount).toHaveText("1", { timeout: 8_000 });
  });

  test("cancelling the confirmation dialog does not call the buy endpoint", async ({
    page,
  }) => {
    await setupMobileShieldMocks(page);

    let buyApiCalled = false;
    page.on("request", (req) => {
      if (req.url().includes("streak-shield/buy") && req.method() === "POST") {
        buyApiCalled = true;
      }
    });

    await page.goto("/hatchup-mobile/profile");
    await expect(page.getByText("Streak Protection")).toBeVisible({ timeout: 10_000 });

    const buyButton = page.getByTestId("button-buy-shield");
    await expect(buyButton).toBeVisible();

    // Dismiss the dialog (equivalent to tapping "Cancel")
    page.once("dialog", (dialog) => dialog.dismiss());
    await buyButton.click();

    // Brief wait to ensure no API call fires
    await page.waitForTimeout(1_000);

    expect(buyApiCalled).toBe(false);

    // Success message must not appear
    await expect(page.getByTestId("shield-buy-message")).toHaveCount(0);

    // Count must remain 0
    const shieldCount = page.getByTestId("streak-shield-count");
    await expect(shieldCount).toHaveText("0");
  });
});
