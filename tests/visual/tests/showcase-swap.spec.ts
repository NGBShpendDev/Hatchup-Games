import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

const storageStatePath = path.resolve(
  process.env.HATCHUP_STORAGE_STATE ||
    path.join(import.meta.dirname, "..", "auth", "storageState.json"),
);

const hasAuth = existsSync(storageStatePath);
const hasDb = !!process.env.DATABASE_URL;

const skipReason = !hasAuth
  ? `No Clerk storage state found at ${storageStatePath}. ` +
    `See tests/visual/README.md for how to capture it before running this spec.`
  : !hasDb
    ? "DATABASE_URL is not set — required to seed test artifacts for the signed-in player."
    : "";

const pool = hasDb ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

type SeedResult = {
  playerId: number;
  artifacts: Array<{ id: number; name: string }>;
};

async function seedShowcase(page: Page): Promise<SeedResult> {
  // Resolve the signed-in player id via the API the app itself uses,
  // so this works for whichever Clerk user the storage state belongs to.
  const me = await page.request.get("/api/players/me");
  expect(
    me.ok(),
    `GET /api/players/me failed (${me.status()}). Is the storage state still valid?`,
  ).toBe(true);
  const meBody = (await me.json()) as { id: number };
  const playerId = meBody.id;
  expect(typeof playerId).toBe("number");

  const client = await pool!.connect();
  try {
    const artifactsRes = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM artifacts WHERE is_hidden = false ORDER BY id LIMIT 4`,
    );
    expect(
      artifactsRes.rows.length,
      "need at least 4 catalog artifacts to seed the swap test",
    ).toBeGreaterThanOrEqual(4);
    const [a1, a2, a3, a4] = artifactsRes.rows;

    await client.query("BEGIN");
    await client.query(`DELETE FROM player_artifacts WHERE player_id = $1`, [playerId]);
    await client.query(
      `INSERT INTO player_artifacts
         (player_id, artifact_id, is_equipped, is_featured, featured_order)
       VALUES
         ($1, $2, false, true,  0),
         ($1, $3, false, true,  1),
         ($1, $4, false, true,  2),
         ($1, $5, false, false, NULL)`,
      [playerId, a1!.id, a2!.id, a3!.id, a4!.id],
    );
    await client.query("COMMIT");

    return { playerId, artifacts: [a1!, a2!, a3!, a4!] };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function fetchFeaturedFlags(playerId: number) {
  const res = await pool!.query<{ artifact_id: number; is_featured: boolean }>(
    `SELECT artifact_id, is_featured
       FROM player_artifacts
      WHERE player_id = $1
      ORDER BY artifact_id`,
    [playerId],
  );
  return new Map(res.rows.map((r) => [r.artifact_id, r.is_featured]));
}

test.describe("Showcase swap flow", () => {
  test.skip(!!skipReason, skipReason);

  test.afterAll(async () => {
    await pool?.end();
  });

  test("swaps a featured artifact via the picker → swap-target → single toast", async ({
    page,
  }) => {
    const seed = await seedShowcase(page);
    const [a1, a2, a3, a4] = seed.artifacts;

    await page.goto(`/players/${seed.playerId}`, { waitUntil: "networkidle" });

    // 1. Showcase renders the 3 seeded featured artifacts and is full.
    const showcase = page.getByTestId("section-showcase");
    await expect(showcase).toBeVisible();
    await expect(showcase).toContainText("3/3 featured · 4 total");
    await expect(page.getByTestId(`card-showcase-artifact-${a1!.id}`)).toBeVisible();
    await expect(page.getByTestId(`card-showcase-artifact-${a2!.id}`)).toBeVisible();
    await expect(page.getByTestId(`card-showcase-artifact-${a3!.id}`)).toBeVisible();

    const trigger = page.getByTestId("button-add-featured").first();
    await expect(trigger).toBeVisible();
    // When the showcase is full the trigger flips from "Add artifact" to
    // "Swap artifact" — that label is part of the one-tap swap promise.
    await expect(trigger).toContainText(/Swap artifact/i);

    // 2. Open the picker sheet — only the un-featured discovered artifact (a4)
    //    should be addable.
    await trigger.click();
    await expect(page.getByText("Swap into your showcase")).toBeVisible();
    const pickA4 = page.getByTestId(`button-feature-from-sheet-${a4!.id}`);
    await expect(pickA4).toBeVisible();
    await expect(page.getByTestId(`button-feature-from-sheet-${a1!.id}`)).toHaveCount(0);

    // 3. Pick a4 → the sheet transitions to the swap-target step listing the
    //    three currently-featured artifacts plus a back button.
    await pickA4.click();
    await expect(page.getByText("Swap with…")).toBeVisible();
    await expect(page.getByTestId(`button-swap-target-${a1!.id}`)).toBeVisible();
    await expect(page.getByTestId(`button-swap-target-${a2!.id}`)).toBeVisible();
    await expect(page.getByTestId(`button-swap-target-${a3!.id}`)).toBeVisible();
    const cancel = page.getByTestId("button-swap-cancel");
    await expect(cancel).toBeVisible();
    await expect(cancel).toContainText(/Pick a different artifact/i);

    // 4. Back button returns to the picker without firing a toast.
    await cancel.click();
    await expect(page.getByText("Swap into your showcase")).toBeVisible();
    await expect(pickA4).toBeVisible();
    await expect(page.getByText("Showcase swapped")).toHaveCount(0);

    // 5. Pick a4 again and target a2 — the actual swap.
    await pickA4.click();
    await page.getByTestId(`button-swap-target-${a2!.id}`).click();

    // 6. Exactly ONE "Showcase swapped" toast — the regression guard. The
    //    underlying per-toggle mutations would otherwise emit "Removed from
    //    showcase" + "Featured on profile" as two separate toasts.
    const swappedToast = page.getByText("Showcase swapped", { exact: false });
    await expect(swappedToast).toHaveCount(1);
    await expect(page.getByText("Removed from showcase", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Featured on profile", { exact: false })).toHaveCount(0);

    // 7. Sheet closed, showcase reflects the swap (a4 in, a2 no longer featured).
    await expect(page.getByText("Swap with…")).toHaveCount(0);
    await expect(showcase).toContainText("3/3 featured · 4 total");
    await expect(page.getByTestId(`card-showcase-artifact-${a1!.id}`)).toBeVisible();
    await expect(page.getByTestId(`card-showcase-artifact-${a3!.id}`)).toBeVisible();
    await expect(page.getByTestId(`card-showcase-artifact-${a4!.id}`)).toBeVisible();
    const a2Card = page.getByTestId(`card-showcase-artifact-${a2!.id}`);
    if ((await a2Card.count()) > 0) {
      // If it still renders as a non-featured tile, it must not carry the
      // FEATURED label anymore.
      await expect(a2Card).not.toContainText("FEATURED");
    }

    // 8. Persisted DB state matches.
    const flags = await fetchFeaturedFlags(seed.playerId);
    expect(flags.get(a1!.id)).toBe(true);
    expect(flags.get(a2!.id)).toBe(false);
    expect(flags.get(a3!.id)).toBe(true);
    expect(flags.get(a4!.id)).toBe(true);
  });
});
