// UI test for every upsell entry point that links to /subscription?from=...
//
// Task #623 added five new upsell sources (hatchling_cap, coach_cap,
// battle_cap, leaderboard_scope, customization_slot) on top of the
// existing `accent` source. This spec is the automated coverage that
// Task #628 asked for: for each `from` value it asserts that the
// paywall renders the correct per-source banner copy (eyebrow / title /
// body / highlighted feature row) and that the
// `console.info("[subscription] upsell_view", { from })` breadcrumb
// fires exactly once per visit.
//
// It also exercises the in-app surfaces that link to the paywall, with
// the cap-hit responses stubbed at the network boundary so the tests
// are deterministic (no need to prime real daily-cap counters):
//   B1. The leaderboard locked-scope button.
//   B2. The accent picker upsell button on /settings/privacy.
//   B3. The coach cap upsell pill — stubs POST /api/coach/chat → 402.
//   B4. The hatch-cap toast Upgrade action — stubs POST /api/eggs/:id/hatch → 402.
//   B5. The battle-cap toast Upgrade action — stubs the battle WS to
//       reply with battle_daily_cap_reached on join_queue.
//
// `customization_slot` is the one source key with no in-app source
// surface yet (only its paywall copy is wired). See the trailing
// comment in this file for the explicit acknowledgement.
//
// /api/subscription/me is mocked to return a FREE-tier response so the
// banner renders (new players default to a 7-day Premium trial, which
// hides `banner-upsell-<from>` because of the `!isPremium` guard in
// `artifacts/hatchup/src/pages/subscription.tsx`).
//
// Like the other tests/visual specs this one is skipped when the
// shared Clerk storage state is missing — see tests/visual/README.md
// for how to capture it.

import { test, expect, type Page, type Route, type ConsoleMessage } from "@playwright/test";
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

// Mirror of UPSELL_SOURCE_COPY in artifacts/hatchup/src/pages/subscription.tsx.
// Kept here as plain data so the spec doesn't have to reach across the
// monorepo to type-check.
const UPSELL_SOURCES = [
  {
    key: "accent",
    eyebrow: "Cosmetic upgrade",
    title: "Unlock the full accent palette",
    bodyIncludes: "every share-card accent gradient",
    highlightFeature: "Premium cosmetics + 12 customization slots",
  },
  {
    key: "hatchling_cap",
    eyebrow: "Roster full",
    title: "Hatch as many Pals as you want",
    bodyIncludes: "Free accounts cap at 6 Hatchlings",
    highlightFeature: "Unlimited Hatchlings",
  },
  {
    key: "coach_cap",
    eyebrow: "Coach is tapped out",
    title: "Unlimited AI coaching",
    bodyIncludes: "5 AI coach messages per day",
    highlightFeature: "Unlimited AI coach + advanced analytics",
  },
  {
    key: "battle_cap",
    eyebrow: "Daily battles used",
    title: "Battle without the daily cap",
    bodyIncludes: "5 battle entries per day",
    highlightFeature: "Unlimited battles + ranked play",
  },
  {
    key: "leaderboard_scope",
    eyebrow: "Local boards locked",
    title: "Compete in your city, county, and state",
    bodyIncludes: "world and country leaderboards",
    highlightFeature: "Local leaderboards (nearby, city, county, state)",
  },
  {
    key: "customization_slot",
    eyebrow: "Customization locked",
    title: "Unlock 12 customization slots",
    bodyIncludes: "Free accounts get 2 customization slots",
    highlightFeature: "Premium cosmetics + 12 customization slots",
  },
] as const;

// Build a /api/subscription/me response matching the FREE-tier shape
// from artifacts/api-server/src/services/entitlement.ts so the paywall
// thinks the viewer is free and renders the per-source banner.
function freeSubscriptionResponse() {
  return {
    tier: "free",
    source: "expired",
    trialEndsAt: null,
    paidUntil: null,
    daysLeftInTrial: null,
    top10ContextLabel: null,
    features: {
      hatchlingStorageCap: 6,
      dailyCoachPromptCap: 5,
      dailyBattleEntryCap: 5,
      allowedScopes: ["world", "country"],
      advancedAnalytics: false,
      premiumCosmetics: false,
      customizationSlots: 2,
      unlimitedSocial: false,
    },
    pricing: {
      monthly: { amount: 899, currency: "usd", interval: "month", label: "$8.99 / month" },
      yearly:  { amount: 8000, currency: "usd", interval: "year",  label: "$80 / year (save 26%)" },
    },
    stripeConfigured: false,
  };
}

async function mockFreeSubscription(page: Page): Promise<void> {
  await page.route("**/api/subscription/me", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(freeSubscriptionResponse()),
    });
  });
}

// Capture every `[subscription] upsell_view` console.info call. We
// install the listener before navigation so we don't miss the initial
// render's log.
function captureUpsellBreadcrumbs(page: Page): string[] {
  const logs: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "info") return;
    const text = msg.text();
    if (text.includes("[subscription] upsell_view")) logs.push(text);
  });
  return logs;
}

test.describe("Subscription paywall — per-source upsell copy + breadcrumb", () => {
  test.skip(!!skipReason, skipReason);

  for (const source of UPSELL_SOURCES) {
    test(`from=${source.key} renders the right banner + highlight and logs once per visit`, async ({ page }) => {
      await mockFreeSubscription(page);
      const breadcrumbs = captureUpsellBreadcrumbs(page);

      // Initial visit — banner copy, highlighted feature row.
      await page.goto(`/subscription?from=${source.key}`);

      const banner = page.getByTestId(`banner-upsell-${source.key}`);
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(source.eyebrow);
      await expect(banner).toContainText(source.title);
      await expect(banner).toContainText(source.bodyIncludes);

      const highlight = page.getByTestId(`feature-highlight-${source.key}`);
      await expect(highlight).toBeVisible();
      await expect(highlight).toHaveText(source.highlightFeature);

      // Breadcrumb fires exactly once per visit, with the right `from`.
      await expect.poll(() => breadcrumbs.length).toBe(1);
      expect(breadcrumbs[0]).toContain(source.key);

      // Reloading the page produces exactly one additional breadcrumb
      // (the useEffect re-runs on mount, no duplicates from React
      // strict-mode double-render or stale captures).
      await page.reload();
      await expect(page.getByTestId(`banner-upsell-${source.key}`)).toBeVisible();
      await expect.poll(() => breadcrumbs.length).toBe(2);
      expect(breadcrumbs[1]).toContain(source.key);
    });
  }
});

test.describe("Subscription paywall — in-app source surfaces link with the correct from", () => {
  test.skip(!!skipReason, skipReason);

  test("B1: locked leaderboard scope routes to /subscription?from=leaderboard_scope", async ({ page }) => {
    await mockFreeSubscription(page);
    const breadcrumbs = captureUpsellBreadcrumbs(page);

    await page.goto("/leaderboard");

    // `city` is a Premium-only scope for a free viewer
    // (allowedScopes=["world","country"]).
    await page.getByTestId("scope-city").click();

    const upsell = page.getByTestId("banner-leaderboard-scope-upsell");
    await expect(upsell).toBeVisible();

    await upsell.click();

    // Navigation lands on the paywall with the right `from`.
    await expect.poll(() => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    }).toBe("/subscription?from=leaderboard_scope");

    await expect(page.getByTestId("banner-upsell-leaderboard_scope")).toBeVisible();
    await expect(page.getByTestId("feature-highlight-leaderboard_scope"))
      .toHaveText("Local leaderboards (nearby, city, county, state)");

    // Breadcrumb fired exactly once for this visit.
    await expect.poll(() => breadcrumbs.length).toBe(1);
    expect(breadcrumbs[0]).toContain("leaderboard_scope");
  });

  test("B2: accent upsell on /settings/privacy routes to /subscription?from=accent", async ({ page }) => {
    await mockFreeSubscription(page);
    const breadcrumbs = captureUpsellBreadcrumbs(page);

    // Stub privacy-settings so this spec doesn't depend on the player's
    // DB state — we just need the page to render the accent picker in
    // FREE tier so the upsell link/locked swatches are interactive.
    // The accent-picker.spec.ts file documents the shape; we reuse a
    // minimal version of it here.
    await page.route("**/api/players/*/privacy-settings", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            locationVisibility: "city",
            requireWorkoutApproval: false,
            emergencyContactName: null,
            emergencyContactPhone: null,
            isVerified: false,
            isMinor: false,
            emailVerifiedAt: null,
            shareAccentColor: null,
            shareAccentColorEffective: "default",
            shareAccentColorOptions: [
              { id: "default", name: "HatchUp Sunset", from: "#ff3d8b", to: "#ff6b3d", premium: false, available: true },
              { id: "ember",   name: "Ember",          from: "#f97316", to: "#eab308", premium: true,  available: false },
            ],
            shareAccentColorTier: "free",
            weeklyRecapEnabled: true,
            weeklyRecapDayOfWeek: 0,
            weeklyRecapHourLocal: 9,
            weeklyRecapTzOffsetMinutes: 0,
            weeklyRecapTimezone: "UTC",
            email: null,
            notifyRecapEmail: true,
            notifyChampionEmail: true,
            notifyModerationEmail: true,
            notifyRecapPush: true,
            weeklyRecapLastSentAt: null,
            locationHiddenSince: null,
          }),
        });
        return;
      }
      await route.fallback();
    });
    await page.route("**/api/push/preferences", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invites: true, social: true, endingSoon: true, completed: true,
          socialChannels: {
            reactions: { inbox: true, push: true, email: false },
            replies:   { inbox: true, push: true, email: false },
            mentions:  { inbox: true, push: true, email: false },
            followers: { inbox: true, push: true, email: false },
          },
        }),
      });
    });

    await page.goto("/settings/privacy");
    await expect(page.getByText("Share card accent")).toBeVisible();

    const upsellLink = page.getByTestId("link-accent-upsell");
    await expect(upsellLink).toBeVisible();
    await upsellLink.scrollIntoViewIfNeeded();
    await upsellLink.click();

    await expect.poll(() => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    }).toBe("/subscription?from=accent");

    const banner = page.getByTestId("banner-upsell-accent");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Cosmetic upgrade");
    await expect(banner).toContainText("Unlock the full accent palette");

    await expect.poll(() => breadcrumbs.length).toBe(1);
    expect(breadcrumbs[0]).toContain("accent");
  });

  test("B3: coach cap upsell pill appears on 402 and links to /subscription?from=coach_cap", async ({ page }) => {
    await mockFreeSubscription(page);

    // Deterministically drive the cap-hit: stub POST /api/coach/chat
    // to return a 402 with the same body shape the real backend emits.
    // The coach page reads `cap` off the body and renders the
    // coach-cap-upsell pill (a <Link href="/subscription?from=coach_cap">).
    await page.route("**/api/coach/chat", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        body: JSON.stringify({ error: "coach_daily_cap_reached", cap: 5 }),
      });
    });

    await page.goto("/coach");

    // Send a message via the quick prompt chip so we don't have to
    // know the textarea's exact selector. Any prompt will do — the
    // network stub responds 402 regardless.
    await page.getByRole("button", { name: "Today's workout?" }).click();

    const pill = page.getByTestId("coach-cap-upsell");
    await expect(pill).toBeVisible();

    const link = pill.locator("a").first();
    await expect(link).toHaveAttribute("href", "/subscription?from=coach_cap");

    await link.click();
    await expect.poll(() => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    }).toBe("/subscription?from=coach_cap");
    await expect(page.getByTestId("banner-upsell-coach_cap")).toBeVisible();
  });

  test("B4: hatchling cap toast Upgrade action routes to /subscription?from=hatchling_cap", async ({ page }) => {
    await mockFreeSubscription(page);

    // Stub the eggs list to return exactly one ready egg the user can
    // hatch, and the hatchling list to return whatever the test player
    // already has (we don't care for this flow — the page only reads
    // hatchlings for the "Your Pals" grid below the eggs).
    await page.route("**/api/eggs**", async (route: Route) => {
      const url = new URL(route.request().url());
      // List endpoint: /api/eggs?playerId=...&hatched=false
      if (route.request().method() === "GET" && url.pathname.endsWith("/api/eggs")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: 999_001,
              playerId: 1,
              eggType: "balanced",
              rarity: "Common",
              isReady: true,
              progressPct: 100,
              stepsProgress: 5000,
              stepsRequired: 5000,
            },
          ]),
        });
        return;
      }
      await route.fallback();
    });

    // The hatch POST returns 402 with hatchling_cap_reached — hatch.tsx
    // shows a toast with an "Upgrade" action that navigates to
    // /subscription?from=hatchling_cap.
    await page.route("**/api/eggs/*/hatch", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        body: JSON.stringify({ error: "hatchling_cap_reached", cap: 6 }),
      });
    });

    // Avoid the page choking on the hatchlings list — empty array is
    // fine, the eggs grid is what we interact with.
    await page.route("**/api/hatchlings**", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        return;
      }
      await route.fallback();
    });

    await page.goto("/hatch");

    // Click the HATCH NOW button on our stubbed ready egg, name the
    // pal, and confirm. The hatch flow runs animation phases for
    // ~1.6s before firing the POST, which Playwright will patiently
    // wait through via the toast expectation below.
    await page.getByRole("button", { name: /HATCH NOW/i }).click();
    await page.getByPlaceholder("Enter name...").fill("CapTest");
    await page.getByRole("button", { name: /Confirm & Hatch!/i }).click();

    // Toast shows "Roster full" with an Upgrade action button.
    const upgradeAction = page.getByRole("button", { name: /^Upgrade$/ });
    await expect(upgradeAction).toBeVisible({ timeout: 10_000 });
    await upgradeAction.click();

    await expect.poll(() => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    }).toBe("/subscription?from=hatchling_cap");
    await expect(page.getByTestId("banner-upsell-hatchling_cap")).toBeVisible();
  });

  test("B5: battle cap WS error → toast Upgrade routes to /subscription?from=battle_cap", async ({ page }) => {
    await mockFreeSubscription(page);

    // The battle queue flow needs: hatchlings to choose from, a player
    // record, owned-artifacts (empty is fine), a ws-token endpoint that
    // hands back any string, and a mocked /api/ws/battle that emits the
    // cap-reached error in response to join_queue.

    const stubHatchling = {
      id: 4242,
      playerId: 1,
      name: "QueueBot",
      species: "Sparkpup",
      rarity: "Common",
      realm: "balance",
      level: 5,
      happiness: 80,
      hunger: 80,
      energy: 80,
      isShiny: false,
      personality: "brave",
      genetics: {},
    };

    await page.route("**/api/hatchlings**", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([stubHatchling]),
        });
        return;
      }
      await route.fallback();
    });

    await page.route("**/api/players/*", async (route: Route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "GET" && /\/api\/players\/\d+$/.test(url.pathname)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: 1, level: 5, battleElo: 1000 }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route("**/api/players/me/artifacts", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.route("**/api/battles/history**", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route("**/api/battles/rivals**", async (route: Route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route("**/api/battles/ws-token", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "stub-ws-token" }),
      });
    });

    // Intercept the WS handshake itself — when the client sends
    // {type:"join_queue", ...} reply with the cap-reached error that
    // battle.tsx's WS onmessage handler maps to the Upgrade toast.
    await page.routeWebSocket(/\/api\/ws\/battle/, (ws) => {
      ws.onMessage((raw) => {
        let parsed: { type?: string } = {};
        try {
          parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch {
          // ignore — only react to join_queue
        }
        if (parsed.type === "join_queue") {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "battle_daily_cap_reached",
              message: "You've used today's free battles.",
            }),
          );
        }
      });
    });

    await page.goto("/battle");

    // Select the (only) hatchling, then equip → skip loadout to fire
    // connectWs() → join_queue → mocked WS error → toast.
    await page.getByRole("button", { name: /QueueBot/ }).first().click();
    await page.getByRole("button", { name: /Equip Artifacts & Find Battle/i }).click();
    await page.getByRole("button", { name: /Skip \(no artifacts\)/i }).click();

    const upgradeAction = page.getByRole("button", { name: /^Upgrade$/ });
    await expect(upgradeAction).toBeVisible({ timeout: 10_000 });
    await upgradeAction.click();

    await expect.poll(() => {
      const u = new URL(page.url());
      return u.pathname + u.search;
    }).toBe("/subscription?from=battle_cap");
    await expect(page.getByTestId("banner-upsell-battle_cap")).toBeVisible();
  });
});

// ── Documentation: customization_slot has no in-app source surface yet ──────
//
// UPSELL_SOURCE_COPY in subscription.tsx defines a `customization_slot`
// entry, but as of this commit no page in artifacts/hatchup/src links
// to /subscription?from=customization_slot (only `accent` triggers
// from=accent for the share-card accent picker; customization_slot
// copy is reserved for a future cosmetic-slot picker surface).
//
// Part A above already pins the paywall rendering contract for the
// customization_slot key so any future source surface that adopts it
// gets the right banner copy out of the box. When a real source
// surface is added, append a `B5: customization_slot ...` test here
// mirroring B1/B2/B4.
