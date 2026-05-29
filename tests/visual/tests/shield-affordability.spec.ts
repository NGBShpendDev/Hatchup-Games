// E2E test for the shield affordability warning on the subscription page.
//
// Task #845 — the "Not enough coins" label and disabled button state are
// client-side only (computed from GET /api/players/me coins field) and had
// no automated coverage. This spec catches regressions if the coin-balance
// fetch or the disable condition changes.
//
// This spec covers:
//   1. When a player has < 200 coins the buy-shield button is disabled and
//      the "Not enough coins" label is visible.
//   2. When a player has >= 200 coins the buy-shield button is enabled and
//      the "Not enough coins" label is absent.
//
// All network calls are stubbed so the test is fully deterministic and
// does not depend on real DB state.
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

// Minimal streak response that satisfies the Streak Protection section.
function makeStreakResponse() {
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
    streakShields: 0,
    shieldActive: false,
    todayReward,
    schedule: [todayReward],
  };
}

// Minimal subscription/me response — free account so both plan cards render.
function makeSubscriptionResponse() {
  return {
    tier: "free",
    source: "expired",
    isPremium: false,
    paidUntil: null,
    trialEndsAt: null,
    daysLeftInTrial: null,
    top10ContextLabel: null,
    pricing: {
      monthly: { id: "price_monthly", unitAmount: 899, currency: "usd", interval: "month" },
      yearly: { id: "price_yearly", unitAmount: 8000, currency: "usd", interval: "year" },
    },
    stripeConfigured: false,
  };
}

// Minimal player response with a configurable coin balance.
function makePlayerResponse(coins: number) {
  return {
    id: 1,
    username: "TestPlayer",
    displayName: "Test Player",
    coins,
    xp: 0,
    level: 1,
    streakDays: 0,
    avatarUrl: null,
    bio: null,
    isAdmin: false,
    isVerified: false,
    isMinor: false,
    subscriptionTier: "free",
    subscriptionSource: "expired",
    paidUntil: null,
    trialEndsAt: null,
    locationVisibility: "city",
    requireWorkoutApproval: false,
    emergencyContactName: null,
    emergencyContactPhone: null,
    createdAt: new Date().toISOString(),
  };
}

async function setupMocks(page: Page, coins: number): Promise<void> {
  // Stub GET /api/players/me — returns the configured coin balance.
  await page.route("**/api/players/me", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makePlayerResponse(coins)),
    });
  });

  // Stub GET /api/players/me/daily-streak
  await page.route("**/api/players/me/daily-streak", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeStreakResponse()),
    });
  });

  // Stub GET /api/subscription/me
  await page.route("**/api/subscription/me", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeSubscriptionResponse()),
    });
  });

  // Stub POST /api/subscription/checkout and portal (plan cards rendered for
  // free accounts — stubs prevent real Stripe calls if accidentally clicked).
  await page.route("**/api/subscription/checkout", async (route: Route) => {
    await route.fulfill({ status: 503, body: JSON.stringify({ error: "stubbed" }) });
  });
  await page.route("**/api/subscription/portal", async (route: Route) => {
    await route.fulfill({ status: 503, body: JSON.stringify({ error: "stubbed" }) });
  });
}

test.describe("Shield affordability warning", () => {
  test.skip(!!skipReason, skipReason);

  test("player with too few coins sees disabled button and 'Not enough coins' label", async ({
    page,
  }) => {
    // Set up mocks with coins below the 200-coin threshold.
    await setupMocks(page, 50);

    await page.goto("/subscription");

    // Wait for the Streak Protection section to render (data loaded).
    const section = page.getByTestId("section-streak-protection");
    await expect(section).toBeVisible({ timeout: 10_000 });

    // ── Buy button is disabled ────────────────────────────────────────────
    const buyButton = page.getByTestId("button-buy-shield");
    await expect(buyButton).toBeVisible();
    await expect(buyButton).toBeDisabled();

    // ── "Not enough coins" warning is visible ─────────────────────────────
    const warning = page.getByTestId("not-enough-coins");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Not enough coins");
  });

  test("player with enough coins sees the buy button enabled", async ({ page }) => {
    // Set up mocks with coins at or above the 200-coin threshold.
    await setupMocks(page, 500);

    await page.goto("/subscription");

    // Wait for the Streak Protection section to render (data loaded).
    const section = page.getByTestId("section-streak-protection");
    await expect(section).toBeVisible({ timeout: 10_000 });

    // ── Buy button is enabled ─────────────────────────────────────────────
    const buyButton = page.getByTestId("button-buy-shield");
    await expect(buyButton).toBeVisible();
    await expect(buyButton).toBeEnabled();

    // ── "Not enough coins" warning is absent ──────────────────────────────
    await expect(page.getByTestId("not-enough-coins")).toHaveCount(0);
  });
});
