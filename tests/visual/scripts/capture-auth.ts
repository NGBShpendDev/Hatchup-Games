/**
 * Capture a Clerk storage state for the visual regression suite.
 *
 * What this does
 *   1. Ensures a dedicated Clerk test user exists (idempotent).
 *   2. Ensures a matching player row exists in the database, with a
 *      starter hatchling so the /hatchlings page renders meaningful
 *      content.
 *   3. Mints a one-shot Clerk sign-in token and drives a headless
 *      Playwright browser through the app's /sign-in flow.
 *   4. Saves the resulting browser storage (cookies + localStorage)
 *      to tests/visual/auth/storageState.json so subsequent
 *      `pnpm --filter @workspace/visual-tests run test` invocations
 *      run authenticated snapshots instead of skipping.
 *
 * Required env
 *   CLERK_SECRET_KEY  Replit-managed Clerk backend key
 *   DATABASE_URL      Postgres connection string
 *
 * Optional env
 *   HATCHUP_BASE_URL          App URL (default http://localhost:3000)
 *   HATCHUP_STORAGE_STATE     Output path (default tests/visual/auth/storageState.json)
 *   HATCHUP_TEST_EMAIL        Test user email (default visual-tests+clerk_test@hatchup.test)
 *   HATCHUP_TEST_USERNAME     Player username (default visual_tester)
 *   HATCHUP_TEST_DISPLAY_NAME Player display name (default Visual Tester)
 */
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import path from "node:path";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = (process.env.HATCHUP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TEST_EMAIL = process.env.HATCHUP_TEST_EMAIL || "visual-tests+clerk_test@hatchup.test";
const TEST_USERNAME = process.env.HATCHUP_TEST_USERNAME || "visual_tester";
const TEST_DISPLAY_NAME = process.env.HATCHUP_TEST_DISPLAY_NAME || "Visual Tester";
const OUT_PATH = path.resolve(
  process.env.HATCHUP_STORAGE_STATE ||
    path.join(import.meta.dirname, "..", "auth", "storageState.json"),
);

if (!CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is required");
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const CLERK_API = "https://api.clerk.com/v1";

async function clerkFetch(p: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${CLERK_API}${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function ensureClerkUser(): Promise<string> {
  const search = await clerkFetch(
    `/users?email_address=${encodeURIComponent(TEST_EMAIL)}&limit=1`,
  );
  if (!search.ok) {
    throw new Error(`Clerk list users failed: ${search.status} ${await search.text()}`);
  }
  const users = (await search.json()) as Array<{ id: string }>;
  if (users.length > 0) {
    console.log(`Found existing Clerk user: ${users[0].id}`);
    return users[0].id;
  }

  const create = await clerkFetch(`/users`, {
    method: "POST",
    body: JSON.stringify({
      email_address: [TEST_EMAIL],
      username: TEST_USERNAME,
      first_name: TEST_DISPLAY_NAME,
      skip_password_requirement: true,
    }),
  });
  if (!create.ok) {
    throw new Error(`Clerk create user failed: ${create.status} ${await create.text()}`);
  }
  const user = (await create.json()) as { id: string };
  console.log(`Created Clerk user: ${user.id}`);
  return user.id;
}

async function ensurePlayer(pool: Pool, clerkId: string): Promise<number> {
  const upsert = await pool.query<{ id: number }>(
    `INSERT INTO players (clerk_id, username, display_name, onboarding_complete, subscription_tier, subscription_source, trial_ends_at)
       VALUES ($1, $2, $3, true, 'premium', 'trial', NOW() + INTERVAL '365 days')
       ON CONFLICT (clerk_id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             onboarding_complete = true
       RETURNING id`,
    [clerkId, TEST_USERNAME, TEST_DISPLAY_NAME],
  );
  const playerId = upsert.rows[0].id;
  console.log(`Player row id: ${playerId}`);

  const existing = await pool.query(
    `SELECT 1 FROM hatchlings WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  if (existing.rowCount === 0) {
    await pool.query(
      `INSERT INTO hatchlings (player_id, name, species, rarity, category, ability_name, ability_desc, level, xp)
         VALUES ($1, 'Flicker', 'Emberling', 'Rare', 'dragons', 'Solar Blast', 'A flash of warm light.', 5, 320)`,
      [playerId],
    );
    console.log(`Seeded starter hatchling for player ${playerId}`);
  }
  return playerId;
}

async function createSignInToken(clerkUserId: string): Promise<string> {
  const res = await clerkFetch(`/sign_in_tokens`, {
    method: "POST",
    body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 600 }),
  });
  if (!res.ok) {
    throw new Error(`Clerk sign-in token failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

async function captureStorageState(token: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const url = `${BASE_URL}/sign-in?__clerk_ticket=${encodeURIComponent(token)}&redirect_url=${encodeURIComponent("/hatchlings")}`;
    console.log(`Opening ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForURL(
      (u) => !u.pathname.includes("/sign-in") && !u.pathname.includes("/sign-up"),
      { timeout: 45000 },
    );
    await page.waitForLoadState("networkidle").catch(() => {});
    mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    await context.storageState({ path: OUT_PATH });
    console.log(`Saved storage state to ${OUT_PATH}`);
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const clerkUserId = await ensureClerkUser();
    await ensurePlayer(pool, clerkUserId);
    const token = await createSignInToken(clerkUserId);
    await captureStorageState(token);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
