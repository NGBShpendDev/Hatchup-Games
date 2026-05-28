// E2E test for the Streak Shield purchase flow.
//
// Task #740 added a Streak Protection section to the subscription page
// with a "Buy a Streak Shield" button plus a shield count display, and a
// shield badge on the home-screen streak counter.
//
// This spec covers:
//   1. The Streak Protection section is visible on /subscription.
//   2. Clicking the buy button triggers POST /api/players/me/streak-shield/buy
//      and a success toast "Shield purchased!" appears.
//   3. The shield count display (shield-count) becomes visible and shows ≥ 1.
//   4. Navigating to the home page shows the shield badge (home-shield-badge).
//
// Network calls are stubbed at the route boundary so the test is fully
// deterministic and does not depend on real coin balances or DB state.
//
// Like the other tests/visual specs this one is skipped when the shared
// Clerk storage state is missing — see tests/visual/README.md for how to
// capture it.

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

// Minimal DailyStreakState that satisfies the UI rendering requirements.
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

async function setupShieldMocks(page: Page): Promise<void> {
  // Stateful counter: starts at 0, incremented by the buy endpoint.
  let shields = 0;

  // Stub GET /api/players/me/daily-streak — returns the current shield count.
  await page.route("**/api/players/me/daily-streak", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeStreakResponse(shields)),
    });
  });

  // Stub POST /api/players/me/streak-shield/buy — always succeeds and
  // bumps the shared counter so the subsequent streak re-fetch reflects
  // the new shield.
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

test.describe("Shield purchase flow", () => {
  test.skip(!!skipReason, skipReason);

  test("section visible → buy → toast + count → home badge", async ({ page }) => {
    await setupShieldMocks(page);

    // ── 1. Navigate to the subscription page ────────────────────────────────
    await page.goto("/subscription");

    // ── 2. Streak Protection section is visible ──────────────────────────────
    const section = page.getByTestId("section-streak-protection");
    await expect(section).toBeVisible();

    // Before purchase the shield-count badge is hidden (shields = 0).
    await expect(page.getByTestId("shield-count")).toBeHidden();

    // ── 3. Click the buy button ──────────────────────────────────────────────
    const buyButton = page.getByTestId("button-buy-shield");
    await expect(buyButton).toBeVisible();
    await buyButton.click();

    // ── 4. Success toast appears ──────────────────────────────────────────────
    // The toast title is "Shield purchased!" (set in subscription.tsx onSuccess).
    await expect(page.getByText("Shield purchased!", { exact: false })).toBeVisible({
      timeout: 8_000,
    });

    // ── 5. Shield count display becomes visible and shows ≥ 1 ────────────────
    // React Query re-fetches /api/players/me/daily-streak after invalidation;
    // our stub now returns shields = 1 so the conditional badge renders.
    const shieldCount = page.getByTestId("shield-count");
    await expect(shieldCount).toBeVisible({ timeout: 8_000 });
    const countText = await shieldCount.textContent();
    expect(Number(countText?.trim())).toBeGreaterThanOrEqual(1);

    // ── 6. Home page shows the shield badge ──────────────────────────────────
    await page.goto("/");

    // The home page fetches /api/players/me/daily-streak; our stub still
    // returns shields = 1 so the home-shield-badge renders.
    await expect(page.getByTestId("home-shield-badge")).toBeVisible({
      timeout: 8_000,
    });
  });
});
