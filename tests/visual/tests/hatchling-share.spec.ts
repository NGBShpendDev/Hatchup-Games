// Confirms the hatchling detail share flow works end-to-end on the Expo
// mobile web app:
//   1. Navigate directly to the Expo dev/web server's hatchling detail route.
//   2. Stub GET /api/hatchlings/:id so no real DB record is required.
//   3. Inject a navigator.share spy via addInitScript (RN Web delegates
//      Share.share() to navigator.share({ text, url })).
//   4. Wait for the share button (testID="button-share-hatchling") — it only
//      mounts once hatchling data has loaded.
//   5. Click it and verify the share API received the hatchling name.
//
// Auth: the Expo app uses Clerk. Clerk cookies are scoped to the "localhost"
// domain (not port-specific), so the storageState captured for the main web
// app at localhost:3000 satisfies the auth check on the Expo server too.
//
// Like the other tests/visual specs this one is skipped when the shared
// Clerk storage state is absent — see tests/visual/README.md.

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

// The Expo dev server port is pinned in the artifact TOML (PORT = "25366").
// Override with HATCHUP_MOBILE_PORT for CI or static builds.
const MOBILE_PORT = Number(process.env.HATCHUP_MOBILE_PORT) || 25366;
const MOBILE_BASE_URL =
  process.env.HATCHUP_MOBILE_BASE_URL || `http://localhost:${MOBILE_PORT}`;

const HATCHLING_ID = 1;

const STUB_HATCHLING = {
  id: HATCHLING_ID,
  playerId: 1,
  name: "Sparky",
  species: "Sparkpup",
  rarity: "rare",
  realm: "fire",
  level: 7,
  xp: 300,
  happiness: 80,
  hunger: 60,
  energy: 90,
  powerScore: 450,
  battleWins: 3,
  evolutionStage: 1,
  loyaltyScore: 70,
  motivationScore: 65,
  confidenceScore: 75,
  isShiny: false,
  personality: "brave",
  genetics: {},
  abilityName: "Flame Burst",
  abilityDesc: "Deals fire damage to all enemies.",
};

async function stubHatchlingApi(page: Page) {
  // Intercept the GET by id call regardless of what base URL the Expo app
  // has configured (EXPO_PUBLIC_DOMAIN may be the Replit dev domain).
  await page.route(
    `**/api/hatchlings/${HATCHLING_ID}`,
    async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(STUB_HATCHLING),
        });
        return;
      }
      await route.fallback();
    },
  );
}

test.describe("Hatchling detail — mobile share button", () => {
  test.skip(!!skipReason, skipReason);

  test("tapping share triggers Share.share() with the hatchling name", async ({
    page,
  }) => {
    // Install the spy *before* the page loads so RN Web's Share module can
    // call it. RN Web maps Share.share({ message }) → navigator.share({ text }).
    await page.addInitScript(() => {
      type ShareCall = { text?: string; url?: string };
      const calls: ShareCall[] = [];
      (window as unknown as Record<string, unknown>).__shareCalls = calls;

      Object.defineProperty(navigator, "share", {
        configurable: true,
        writable: true,
        value: async (data: ShareData) => {
          calls.push({ text: data?.text, url: data?.url });
        },
      });
    });

    await stubHatchlingApi(page);

    // Navigate to the hatchling detail screen on the Expo web server.
    // Using the direct port avoids the proxy path-prefix stripping issue.
    await page.goto(`${MOBILE_BASE_URL}/hatchling/${HATCHLING_ID}`, {
      waitUntil: "networkidle",
    });

    // The share button is conditional on `pal` being loaded — wait for it.
    const shareBtn = page.getByTestId("button-share-hatchling");
    await expect(shareBtn).toBeVisible({ timeout: 15_000 });

    await shareBtn.click();

    // Give the async share handler a tick to resolve.
    await page.waitForTimeout(300);

    const shareCalls = await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>).__shareCalls as Array<{
          text?: string;
          url?: string;
        }>,
    );

    expect(shareCalls).toHaveLength(1);
    // The share message must include the hatchling name and the app name.
    expect(shareCalls[0]!.text).toContain("Sparky");
    expect(shareCalls[0]!.text).toContain("HatchUp");
  });
});
