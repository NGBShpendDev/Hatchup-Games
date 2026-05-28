import { test, expect } from "@playwright/test";
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
    ? "DATABASE_URL is not set — required to seed test hatchlings."
    : "";

const pool = hasDb ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

async function resolvePlayerId(page: import("@playwright/test").Page): Promise<number> {
  const res = await page.request.get("/api/players/me");
  expect(
    res.ok(),
    `GET /api/players/me failed (${res.status()}). Is the storage state still valid?`,
  ).toBe(true);
  const body = (await res.json()) as { id: number };
  expect(typeof body.id).toBe("number");
  return body.id;
}

async function seedHatchling(playerId: number, name: string, xp: number): Promise<number> {
  const client = await pool!.connect();
  try {
    const res = await client.query<{ id: number }>(
      `INSERT INTO hatchlings
         (player_id, name, species, level, xp, realm, fitness_type)
       VALUES ($1, $2, 'Dragon', 1, $3, 'balance', 'balanced')
       RETURNING id`,
      [playerId, name, xp],
    );
    return res.rows[0]!.id;
  } finally {
    client.release();
  }
}

async function cleanupHatchling(id: number): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM hatchlings WHERE id = $1", [id]);
  } catch {
    // non-fatal cleanup
  } finally {
    client.release();
  }
}

// ── Race result: Pal XP bar ───────────────────────────────────────────────────

test.describe("Race result — Pal XP bar", () => {
  test.skip(!!skipReason, skipReason);

  let raceHatchlingId: number | null = null;

  test.afterAll(async () => {
    if (raceHatchlingId !== null) await cleanupHatchling(raceHatchlingId);
    await pool?.end();
  });

  test("race-pal-xp-bar is visible after a completed race", async ({ page }) => {
    const playerId = await resolvePlayerId(page);

    // Seed a hatchling at xp=95 (level 1). The minimum race XP award is
    // score*2+50 ≥ 250 XP — far more than the 5 XP needed to cross the
    // 100-XP/level threshold — so both XP delta and level-up are guaranteed.
    raceHatchlingId = await seedHatchling(playerId, "XP Test Racer", 95);

    await page.goto("/compete/race", { waitUntil: "networkidle" });

    // The outer wrapper for each hatchling card carries data-testid="race-hatchling-select-{id}"
    const hatchlingTile = page.getByTestId(`race-hatchling-select-${raceHatchlingId}`);
    await expect(hatchlingTile).toBeVisible({ timeout: 15_000 });
    await hatchlingTile.click();

    // START RACE becomes enabled once a hatchling is selected
    const startBtn = page.getByRole("button", { name: /START RACE/i });
    await expect(startBtn).toBeEnabled({ timeout: 5_000 });
    await startBtn.click();

    // The frontend waits 4 s (animation) then fires two API calls.
    // Allow 20 s for the full round-trip before asserting the XP bar.
    await expect(page.getByTestId("race-pal-xp-bar")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("race-level-up-banner is visible when the Pal's level increases", async ({ page }) => {
    const playerId = await resolvePlayerId(page);
    const bannerHatchlingId = await seedHatchling(playerId, "Level Up Racer", 95);

    try {
      await page.goto("/compete/race", { waitUntil: "networkidle" });

      const hatchlingTile = page.getByTestId(`race-hatchling-select-${bannerHatchlingId}`);
      await expect(hatchlingTile).toBeVisible({ timeout: 15_000 });
      await hatchlingTile.click();

      const startBtn = page.getByRole("button", { name: /START RACE/i });
      await expect(startBtn).toBeEnabled({ timeout: 5_000 });
      await startBtn.click();

      // Level-up banner appears when hatchlingNewLevel > hatchlingPrevLevel.
      // Seeding at xp=95 guarantees a level-up on the very first race.
      await expect(page.getByTestId("race-level-up-banner")).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await cleanupHatchling(bannerHatchlingId);
    }
  });
});

// ── Battle result: Pal XP block ───────────────────────────────────────────────

test.describe("Battle result — Pal XP block", () => {
  test.skip(!!skipReason, skipReason);

  let battlePool: InstanceType<typeof Pool> | null = null;
  let battleHatchlingId: number | null = null;

  test.beforeAll(async () => {
    battlePool = hasDb
      ? new Pool({ connectionString: process.env.DATABASE_URL })
      : null;
  });

  test.afterAll(async () => {
    if (battleHatchlingId !== null && battlePool) {
      const client = await battlePool.connect();
      try {
        await client.query("DELETE FROM hatchlings WHERE id = $1", [battleHatchlingId]);
      } catch {
        // non-fatal
      } finally {
        client.release();
      }
    }
    await battlePool?.end();
  });

  test(
    "battle-pal-xp-block and battle-pal-xp-bar are visible after a completed bot battle",
    async ({ page }) => {
      const playerId = await resolvePlayerId(page);

      // Seed a hatchling at xp=90 — any battle XP grant crosses the 100-XP
      // level threshold so the level-up banner should also appear.
      const seedClient = await battlePool!.connect();
      try {
        const res = await seedClient.query<{ id: number }>(
          `INSERT INTO hatchlings
             (player_id, name, species, level, xp, realm, fitness_type)
           VALUES ($1, 'Battle XP Pal', 'Dragon', 1, 90, 'balance', 'balanced')
           RETURNING id`,
          [playerId],
        );
        battleHatchlingId = res.rows[0]!.id;
      } finally {
        seedClient.release();
      }

      await page.goto("/compete/battle", { waitUntil: "networkidle" });

      // Pick the seeded hatchling via its specific testid
      const hatchlingBtn = page.getByTestId(`battle-hatchling-select-${battleHatchlingId}`);
      await expect(hatchlingBtn).toBeVisible({ timeout: 15_000 });
      await hatchlingBtn.click();

      // Advance through loadout
      const equipBtn = page.getByRole("button", { name: /Equip Artifacts & Find Battle/i });
      await expect(equipBtn).toBeEnabled({ timeout: 5_000 });
      await equipBtn.click();

      const skipBtn = page.getByRole("button", { name: /Skip/i }).first();
      await expect(skipBtn).toBeVisible({ timeout: 5_000 });
      await skipBtn.click();

      // Queue — bot opponent pairs after 30 s
      await expect(
        page.locator("text=Matched with a bot opponent!"),
      ).toBeVisible({ timeout: 45_000 });

      // Battle phase — wait for Strike button (our turn)
      const strikeBtn = page.getByRole("button", { name: /^Strike$/i });
      await expect(strikeBtn).toBeVisible({ timeout: 20_000 });

      // Click Strike until the battle ends (Victory!/Defeated!/Draw!)
      const ended = page
        .locator("text=Victory!")
        .or(page.locator("text=Defeated!"))
        .or(page.locator("text=Draw!"));

      for (let i = 0; i < 40; i++) {
        if ((await ended.count()) > 0) break;
        const btn = page.getByRole("button", { name: /^Strike$/i }).first();
        if ((await btn.count()) > 0 && (await btn.isEnabled().catch(() => false))) {
          await btn.click();
        }
        await page.waitForTimeout(800);
      }

      await expect(ended).toBeVisible({ timeout: 10_000 });

      // Pal XP block and bar appear when the battle_end WS message includes hatchlingXp
      await expect(page.getByTestId("battle-pal-xp-block")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("battle-pal-xp-bar")).toBeVisible({
        timeout: 5_000,
      });
    },
  );
});
