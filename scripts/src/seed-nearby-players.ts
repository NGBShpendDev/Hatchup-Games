/**
 * Seed friendly NPC-style demo accounts in top cities so the Explore
 * "Players Nearby" strip doesn't feel empty for early users.
 *
 * Usage: pnpm --filter @workspace/scripts run seed:nearby-players
 *
 * Idempotent: each demo account uses a deterministic username
 * (`demo_<city-slug>_<n>`) so re-running the script upserts instead of
 * inserting duplicates. All accounts are marked with `is_demo=true` and
 * `location_visibility="city"` so they can be cleaned up later with:
 *
 *   DELETE FROM players WHERE is_demo = true;
 *
 * Uses raw SQL via the shared pool rather than the Drizzle query builder
 * so it stays resilient to columns being added to the schema before
 * `db push` has been run.
 */
import { pool } from "@workspace/db";

type DemoCity = {
  city: string;
  state: string;
  country: string;
  countryCode: string;
};

const CITIES: DemoCity[] = [
  { city: "New York", state: "New York", country: "United States", countryCode: "US" },
  { city: "Los Angeles", state: "California", country: "United States", countryCode: "US" },
  { city: "Chicago", state: "Illinois", country: "United States", countryCode: "US" },
  { city: "Austin", state: "Texas", country: "United States", countryCode: "US" },
  { city: "Seattle", state: "Washington", country: "United States", countryCode: "US" },
  { city: "Miami", state: "Florida", country: "United States", countryCode: "US" },
  { city: "Toronto", state: "Ontario", country: "Canada", countryCode: "CA" },
  { city: "London", state: "England", country: "United Kingdom", countryCode: "GB" },
  { city: "Berlin", state: "Berlin", country: "Germany", countryCode: "DE" },
  { city: "Tokyo", state: "Tokyo", country: "Japan", countryCode: "JP" },
  { city: "Sydney", state: "New South Wales", country: "Australia", countryCode: "AU" },
  { city: "Singapore", state: "Singapore", country: "Singapore", countryCode: "SG" },
];

const FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Taylor", "Jamie",
  "Avery", "Quinn", "Reese", "Skylar", "Rowan", "Hayden", "Emerson", "Sage",
  "Phoenix", "River", "Kai", "Nova",
];

const LAST_NAMES = [
  "Hatcher", "Stone", "Vale", "Wilder", "Frost", "Bloom", "Reign", "Storm",
  "Ash", "Crest", "Lark", "Pike", "Quill", "Sparrow", "Vega", "Wren",
];

const RANKS = ["Bronze", "Silver", "Gold", "Platinum"];
const REALMS = ["strength", "endurance", "agility"];

const PER_CITY = 10;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Tiny deterministic PRNG so demo data is stable across re-runs.
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

async function seedCity(city: DemoCity): Promise<{ inserted: number; updated: number; skipped: number }> {
  const slug = slugify(city.city);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 1; i <= PER_CITY; i++) {
    const username = `demo_${slug}_${i}`;
    const rand = seededRandom(
      Array.from(username).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7),
    );
    const first = pick(FIRST_NAMES, rand);
    const last = pick(LAST_NAMES, rand);
    const displayName = `${first} ${last}`;
    const level = 1 + Math.floor(rand() * 25);
    const xp = level * 100 + Math.floor(rand() * 100);
    const rank = pick(RANKS, rand);
    const rankScore = Math.floor(rand() * 2500);
    const fitnessRealm = pick(REALMS, rand);
    const totalSteps = Math.floor(rand() * 200_000);
    const totalWorkouts = Math.floor(rand() * 60);
    const currentStreak = Math.floor(rand() * 14);
    const avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(username)}`;

    // Safe upsert: only ever touch rows that are already marked is_demo.
    // If a real (non-demo) user happens to occupy the deterministic username,
    // the WHERE clause makes the DO UPDATE a no-op and we skip + log the
    // conflict instead of overwriting their profile.
    const upserted = await pool.query<{ id: number; is_demo: boolean }>(
      `INSERT INTO players
         (username, display_name, avatar_url, level, xp, rank, rank_score,
          fitness_realm, total_steps, total_workouts, current_streak,
          location_visibility, is_demo, subscription_tier, subscription_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'city', true, 'free', 'expired')
       ON CONFLICT (username) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         level = EXCLUDED.level,
         xp = EXCLUDED.xp,
         rank = EXCLUDED.rank,
         rank_score = EXCLUDED.rank_score,
         fitness_realm = EXCLUDED.fitness_realm,
         total_steps = EXCLUDED.total_steps,
         total_workouts = EXCLUDED.total_workouts,
         current_streak = EXCLUDED.current_streak,
         location_visibility = 'city',
         is_demo = true
       WHERE players.is_demo = true
       RETURNING id, is_demo`,
      [
        username, displayName, avatarUrl, level, xp, rank, rankScore,
        fitnessRealm, totalSteps, totalWorkouts, currentStreak,
      ],
    );

    let playerId: number;
    if (upserted.rowCount && upserted.rows[0]) {
      playerId = upserted.rows[0].id;
      // Distinguish insert vs update: an insert means no prior row existed,
      // which we infer from the absence of a matching player_location below.
      // Cheaper: just look at whether the row's created_at is "now".
      // Simpler heuristic — compare to a fresh lookup count:
      const wasInsert = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM player_location WHERE player_id = $1`,
        [playerId],
      );
      if ((wasInsert.rows[0]?.c ?? "0") === "0") inserted++;
      else updated++;
    } else {
      // Conflict on username with a non-demo (real) user — skip safely.
      const collision = await pool.query<{ id: number; is_demo: boolean }>(
        `SELECT id, is_demo FROM players WHERE username = $1 LIMIT 1`,
        [username],
      );
      const row = collision.rows[0];
      console.warn(
        `  ! Skipping ${username}: username already taken by ` +
          (row ? `player #${row.id} (is_demo=${row.is_demo})` : "unknown row"),
      );
      skipped++;
      continue;
    }

    const existingLoc = await pool.query<{ id: number }>(
      `SELECT id FROM player_location WHERE player_id = $1 LIMIT 1`,
      [playerId],
    );

    if (existingLoc.rowCount && existingLoc.rows[0]) {
      await pool.query(
        `UPDATE player_location SET
           city = $1, state = $2, country = $3, country_code = $4,
           visibility = 'city', lat_encrypted = NULL, lng_encrypted = NULL,
           updated_at = NOW()
         WHERE player_id = $5`,
        [city.city, city.state, city.country, city.countryCode, playerId],
      );
    } else {
      await pool.query(
        `INSERT INTO player_location
           (player_id, city, state, country, country_code, visibility)
         VALUES ($1, $2, $3, $4, $5, 'city')`,
        [playerId, city.city, city.state, city.country, city.countryCode],
      );
    }
  }

  return { inserted, updated, skipped };
}

async function main() {
  console.log(`Seeding ${PER_CITY} demo players across ${CITIES.length} cities...`);
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  for (const city of CITIES) {
    const { inserted, updated, skipped } = await seedCity(city);
    totalInserted += inserted;
    totalUpdated += updated;
    totalSkipped += skipped;
    const skippedNote = skipped > 0 ? `, ${skipped} skipped (username collision)` : "";
    console.log(`  ${city.city}, ${city.state}: +${inserted} new, ${updated} refreshed${skippedNote}`);
  }
  console.log(`Done. Inserted ${totalInserted}, refreshed ${totalUpdated}, skipped ${totalSkipped}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
