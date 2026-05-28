// Verifies that the Streak Shield celebration banner inside the
// StreakCalendarModal fires and then auto-dismisses when the claim
// API returns streakShieldGranted: true.
//
// Strategy: stub GET /api/players/me/daily-streak so the modal
// auto-opens with day 3 unclaimed (day 3 carries the streak_shield
// bonus in the schedule), then stub POST /api/players/me/daily-claim
// to return streakShieldGranted: true. No real DB write is needed.
//
// The test is skipped when the shared Clerk storage state is absent —
// see tests/visual/README.md for how to capture it.

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

const SHIELD_DAY = 3;

function makeSchedule(alreadyClaimed: boolean) {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const isShieldDay = day === SHIELD_DAY || day === 20;
    return {
      day,
      coins: 50 + day * 10,
      xp: 20 + day * 5,
      kind: isShieldDay ? "coins" : day % 7 === 0 ? "chest" : "coins",
      label: isShieldDay ? "Streak Shield" : `${50 + day * 10} Coins`,
      icon: isShieldDay ? "🛡️" : "🪙",
      ...(isShieldDay ? { bonus: "streak_shield" } : {}),
    };
  });
}

function makeStreakState(alreadyClaimed: boolean) {
  return {
    currentDay: alreadyClaimed ? SHIELD_DAY : SHIELD_DAY - 1,
    streakBroken: false,
    alreadyClaimed,
    lastClaimedAt: alreadyClaimed ? new Date().toISOString() : null,
    streakShields: alreadyClaimed ? 1 : 0,
    shieldActive: false,
    todayReward: {
      day: SHIELD_DAY,
      coins: 80,
      xp: 35,
      kind: "coins",
      label: "Streak Shield",
      icon: "🛡️",
      bonus: "streak_shield",
    },
    schedule: makeSchedule(alreadyClaimed),
  };
}

function makeClaimResult() {
  return {
    ok: true,
    day: SHIELD_DAY,
    coinsGranted: 80,
    xpGranted: 35,
    streakDay: SHIELD_DAY,
    newStreakDay: SHIELD_DAY + 1,
    eggAdded: false,
    bonus: "streak_shield",
    shieldConsumed: false,
    streakShieldGranted: true,
    newBadges: [],
    artifactGranted: null,
    hatchlingBump: null,
  };
}

async function setupStreakMocks(page: Page) {
  let streakFetchCount = 0;

  // Stub the streak state — first call returns unclaimed so the modal
  // auto-opens; subsequent calls (after claim invalidation) return claimed.
  await page.route("**/api/players/me/daily-streak", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const claimed = streakFetchCount > 0;
    streakFetchCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeStreakState(claimed)),
    });
  });

  // Stub the claim endpoint to grant a shield.
  await page.route("**/api/players/me/daily-claim", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeClaimResult()),
    });
  });
}

function makeBuyStreakState(purchased: boolean) {
  return {
    currentDay: 5,
    streakBroken: false,
    alreadyClaimed: false,
    lastClaimedAt: null,
    streakShields: purchased ? 1 : 0,
    shieldActive: false,
    todayReward: {
      day: 5,
      coins: 100,
      xp: 45,
      kind: "coins",
      label: "100 Coins",
      icon: "🪙",
    },
    schedule: Array.from({ length: 30 }, (_, i) => {
      const day = i + 1;
      return {
        day,
        coins: 50 + day * 10,
        xp: 20 + day * 5,
        kind: "coins",
        label: `${50 + day * 10} Coins`,
        icon: "🪙",
      };
    }),
  };
}

async function setupBuyShieldMocks(page: Page) {
  let fetchCount = 0;

  await page.route("**/api/players/me/daily-streak", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const purchased = fetchCount > 0;
    fetchCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeBuyStreakState(purchased)),
    });
  });

  await page.route(
    "**/api/players/me/buy-streak-shield",
    async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, streakShields: 1, coinsSpent: 200 }),
      });
    },
  );
}

test.describe("Streak Shield purchase via coins", () => {
  test.skip(!!skipReason, skipReason);

  test("shield count badge increments and celebration appears after clicking the buy button", async ({
    page,
  }) => {
    await setupBuyShieldMocks(page);

    await page.goto("/", { waitUntil: "networkidle" });

    // Modal auto-opens because streak is unclaimed.
    const claimBtn = page.getByRole("button", { name: /Claim Day/i });
    await expect(claimBtn).toBeVisible({ timeout: 10_000 });

    // Click the "200¢" buy button.
    const buyBtn = page.getByRole("button", { name: /200¢/i });
    await expect(buyBtn).toBeVisible({ timeout: 5_000 });
    await buyBtn.click();

    // The celebration banner must appear (triggerShieldCelebration fires on buy).
    const banner = page.getByTestId("shield-celebration-banner");
    await expect(banner).toBeVisible({ timeout: 5_000 });

    // After the refetch the shield count badge should show "1".
    const shieldBadge = page
      .locator(".text-cyan-400")
      .filter({ hasText: /^1$/ });
    await expect(shieldBadge).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Streak Shield celebration banner", () => {
  test.skip(!!skipReason, skipReason);

  test("banner appears after claiming a shield day and auto-dismisses within ~3 s", async ({
    page,
  }) => {
    await setupStreakMocks(page);

    // Navigate to home — the page auto-opens the modal when alreadyClaimed is false.
    await page.goto("/", { waitUntil: "networkidle" });

    // Modal should appear automatically (streak is unclaimed).
    const claimBtn = page.getByRole("button", {
      name: new RegExp(`Claim Day ${SHIELD_DAY} Reward`, "i"),
    });
    await expect(claimBtn).toBeVisible({ timeout: 10_000 });

    // Claim the reward.
    await claimBtn.click();

    // The celebration banner must appear.
    const banner = page.getByTestId("shield-celebration-banner");
    await expect(banner).toBeVisible({ timeout: 5_000 });

    // The timer inside the component clears after 2500 ms; allow 5 s.
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  });

  test("banner is absent before claiming (shield day visible in calendar, no celebration yet)", async ({
    page,
  }) => {
    await setupStreakMocks(page);

    await page.goto("/", { waitUntil: "networkidle" });

    // Modal is open (unclaimed), but we have NOT clicked claim yet.
    const claimBtn = page.getByRole("button", {
      name: new RegExp(`Claim Day ${SHIELD_DAY} Reward`, "i"),
    });
    await expect(claimBtn).toBeVisible({ timeout: 10_000 });

    // No celebration banner before the claim is triggered.
    await expect(
      page.getByTestId("shield-celebration-banner"),
    ).toHaveCount(0);

    // The shield-day tile should be highlighted in the calendar (data-day attribute).
    const shieldTile = page.locator(`[data-day="${SHIELD_DAY}"]`);
    await expect(shieldTile).toBeVisible();
  });
});
