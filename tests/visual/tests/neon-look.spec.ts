import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const storageStatePath = path.resolve(
  process.env.HATCHUP_STORAGE_STATE ||
    path.join(import.meta.dirname, "..", "auth", "storageState.json"),
);

const hasAuth = existsSync(storageStatePath);

const PAGES: Array<{ name: string; path: string }> = [
  { name: "hatchlings", path: "/hatchlings" },
  { name: "compete", path: "/compete" },
  { name: "social", path: "/social" },
  { name: "groups", path: "/groups" },
];

async function freezeUi(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
  await page.evaluate(() => document.fonts?.ready);
}

test.describe("Neon look visual regression", () => {
  test.skip(
    !hasAuth,
    `No Clerk storage state found at ${storageStatePath}. ` +
      `See tests/visual/README.md for how to capture it before running visual tests.`,
  );

  for (const target of PAGES) {
    test(`${target.name} page matches snapshot`, async ({ page }) => {
      const responses: number[] = [];
      page.on("response", (res) => {
        if (res.url().startsWith(page.url().split("#")[0])) {
          responses.push(res.status());
        }
      });

      await page.goto(target.path, { waitUntil: "networkidle" });

      // If Clerk bounced us to sign-in the auth state is stale; fail loudly
      // rather than snapshot a login screen as if it were the real page.
      expect(
        page.url(),
        `expected to land on ${target.path} but ended up at ${page.url()} — ` +
          `is the storage state still valid?`,
      ).toContain(target.path);

      await freezeUi(page);
      await page.waitForTimeout(250);

      await expect(page).toHaveScreenshot(`${target.name}.png`, {
        fullPage: true,
      });
    });
  }
});
