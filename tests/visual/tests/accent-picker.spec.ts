// UI test for the share-card accent color picker on /settings/privacy.
//
// The backend OG renderer is already unit-tested in api-server. This
// spec covers the picker UI:
//   - Free-tier accent swatches are interactive.
//   - Premium-tier swatches are visually locked (aria-pressed=false,
//     "(Premium — tap to upgrade)" suffix on aria-label) and clicking
//     one redirects to /subscription?from=accent instead of selecting.
//   - Picking a free swatch and clicking "Save Privacy Settings" PATCHes
//     /privacy-settings with the chosen id, and the choice persists
//     after the page reloads.
//
// The privacy-settings GET/PATCH endpoints are stubbed with page.route
// so this spec doesn't depend on DB seed state (the captured Clerk
// player can be premium or free). Only the Clerk storage state from
// scripts/capture-auth.ts is required — without it the spec skips,
// matching the convention used by the other tests/visual specs.

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

// Mirror of artifacts/api-server/src/services/accentColors.ts. Kept
// here as plain data so the spec doesn't have to reach across the
// monorepo to type-check.
const ACCENT_OPTIONS = [
  { id: "default", name: "HatchUp Sunset", from: "#ff3d8b", to: "#ff6b3d", premium: false },
  { id: "ocean",   name: "Ocean",          from: "#3da6ff", to: "#5cf2d6", premium: false },
  { id: "forest",  name: "Forest",         from: "#34d399", to: "#84cc16", premium: false },
  { id: "violet",  name: "Violet",         from: "#a855f7", to: "#ec4899", premium: false },
  { id: "ember",      name: "Ember",     from: "#f97316", to: "#eab308", premium: true },
  { id: "ruby",       name: "Ruby",      from: "#ef4444", to: "#f43f5e", premium: true },
  { id: "aurora",     name: "Aurora",    from: "#22d3ee", to: "#a78bfa", premium: true },
  { id: "gold",       name: "Gold",      from: "#facc15", to: "#f59e0b", premium: true },
  { id: "midnight",   name: "Midnight",  from: "#6366f1", to: "#0ea5e9", premium: true },
  { id: "monochrome", name: "Mono",      from: "#e5e7eb", to: "#9ca3af", premium: true },
  { id: "neon-lime",  name: "Neon Lime", from: "#84cc16", to: "#22d3ee", premium: true },
  { id: "blossom",    name: "Blossom",   from: "#f9a8d4", to: "#fbcfe8", premium: true },
] as const;

const FREE_IDS = ACCENT_OPTIONS.filter((o) => !o.premium).map((o) => o.id);
const PREMIUM_IDS = ACCENT_OPTIONS.filter((o) => o.premium).map((o) => o.id);

type State = {
  shareAccentColor: string | null;
  patchCalls: Array<Record<string, unknown>>;
};

// Build a privacy-settings response body that mimics what
// artifacts/api-server/src/routes/safety.ts returns for a FREE-tier
// player. Only the fields the picker reads are populated — the rest
// of the settings page tolerates undefined values.
function buildPrivacyResponse(state: State) {
  return {
    locationVisibility: "city",
    requireWorkoutApproval: false,
    emergencyContactName: null,
    emergencyContactPhone: null,
    isVerified: false,
    isMinor: false,
    emailVerifiedAt: null,
    shareAccentColor: state.shareAccentColor,
    shareAccentColorEffective: state.shareAccentColor ?? "default",
    shareAccentColorOptions: ACCENT_OPTIONS.map((opt) => ({
      ...opt,
      // Free tier — premium options are NOT available.
      available: !opt.premium,
    })),
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
  };
}

async function setupMocks(page: Page, state: State): Promise<void> {
  // Settings page GET — always reflects the latest saved value so a
  // reload sees the persisted selection.
  await page.route("**/api/players/*/privacy-settings", async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildPrivacyResponse(state)),
      });
      return;
    }
    if (method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.patchCalls.push(body);
      if ("shareAccentColor" in body) {
        const raw = body.shareAccentColor;
        state.shareAccentColor =
          raw === null || raw === "" || typeof raw !== "string" ? null : raw;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          email: null,
          emailVerifiedAt: null,
        }),
      });
      return;
    }
    await route.fallback();
  });

  // The settings page also fetches push preferences on mount. Stub it
  // so the test doesn't make a real network request that depends on
  // backend state.
  await page.route("**/api/push/preferences", async (route: Route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        invites: true,
        social: true,
        endingSoon: true,
        completed: true,
        socialChannels: {
          reactions: { inbox: true, push: true, email: false },
          replies:   { inbox: true, push: true, email: false },
          mentions:  { inbox: true, push: true, email: false },
          followers: { inbox: true, push: true, email: false },
        },
      }),
    });
  });
}

test.describe("Settings · Privacy — share-card accent picker", () => {
  test.skip(!!skipReason, skipReason);

  test("free-tier picker locks premium swatches and persists a free pick after reload", async ({ page }) => {
    const state: State = { shareAccentColor: null, patchCalls: [] };
    await setupMocks(page, state);

    await page.goto("/settings/privacy");

    // The accent card heading anchors the section.
    await expect(page.getByText("Share card accent")).toBeVisible();

    // Free swatches are interactive.
    for (const id of FREE_IDS) {
      const button = page.getByTestId(`accent-option-${id}`);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
    }

    // Premium swatches render visually locked: they keep an
    // accessible "(Premium — tap to upgrade)" suffix on aria-label,
    // are NOT in the pressed state, and clicking one redirects the
    // user to the subscription paywall instead of selecting it.
    for (const id of PREMIUM_IDS) {
      const button = page.getByTestId(`accent-option-${id}`);
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(button).toHaveAttribute("aria-label", /Premium — tap to upgrade/);
    }

    // Clicking a locked premium swatch redirects to the paywall.
    await page.getByTestId("accent-option-ember").click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe("/subscription?from=accent");
    // No PATCH should have fired from that click.
    expect(state.patchCalls).toEqual([]);

    // Go back to the picker to continue the persistence flow.
    await page.goto("/settings/privacy");
    await expect(page.getByText("Share card accent")).toBeVisible();

    // Helper copy that nudges free users toward Premium.
    await expect(page.getByText("Unlock the full palette with HatchUp Premium.")).toBeVisible();

    // Pick a free swatch and save.
    const ocean = page.getByTestId("accent-option-ocean");
    await ocean.click();
    await expect(ocean).toHaveAttribute("aria-pressed", "true");

    const saveButton = page.getByRole("button", { name: "Save Privacy Settings" });
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();

    // The PATCH fires with shareAccentColor=ocean and the success toast
    // confirms the save round-tripped to (our fake) backend.
    await expect.poll(() => state.shareAccentColor).toBe("ocean");
    expect(state.patchCalls.at(-1)).toMatchObject({ shareAccentColor: "ocean" });
    await expect(page.getByText("Privacy settings saved")).toBeVisible();

    // Reload — the GET mock now returns shareAccentColor="ocean" so
    // the picker should hydrate with that selection.
    await page.reload();
    await expect(page.getByText("Share card accent")).toBeVisible();
    await expect(page.getByTestId("accent-option-ocean")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("accent-option-default")).toHaveAttribute("aria-pressed", "false");

    // Premium gating still applies after reload.
    await expect(page.getByTestId("accent-option-ember"))
      .toHaveAttribute("aria-label", /Premium — tap to upgrade/);
    await expect(page.getByTestId("accent-option-ember"))
      .toHaveAttribute("aria-pressed", "false");
  });
});
