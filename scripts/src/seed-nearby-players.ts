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

// Hatchling catalog used for demo creatures.
const DEMO_HATCHLINGS: { species: string; realm: string; category: string; ability: { name: string; desc: string } }[] = [
  { species: "Cragborn Pup", realm: "strength", category: "beasts", ability: { name: "Stone Fist", desc: "Slams the ground causing shockwaves that stagger opponents." } },
  { species: "Emberstrike Cub", realm: "strength", category: "beasts", ability: { name: "Iron Fortress", desc: "Hardens shell to block 60% of incoming damage." } },
  { species: "Zephyr Fawn", realm: "cardio", category: "beasts", ability: { name: "Quick Dash", desc: "Surges forward at lightning speed leaving a trail of sparks." } },
  { species: "Stormwing Chick", realm: "cardio", category: "dragons", ability: { name: "Tailwind Surge", desc: "Generates a powerful gust that accelerates ally speed by 40%." } },
  { species: "Lumin Seedling", realm: "balance", category: "spirits", ability: { name: "Aura Flare", desc: "Emits a calming aura that reduces opponent aggression by 30%." } },
  { species: "Starbloom Fae", realm: "balance", category: "spirits", ability: { name: "Celestial Mend", desc: "Radiates starlight energy restoring 25% HP to all allies." } },
  { species: "Shadowpaw Runt", realm: "beast", category: "beasts", ability: { name: "Feral Lunge", desc: "Leaps from shadows with primal ferocity doubling strike speed." } },
  { species: "Prism Wisp", realm: "mythic", category: "spirits", ability: { name: "Prismatic Burst", desc: "Explodes in a rainbow of energy hitting opponents of every type." } },
];

const HATCHLING_NAMES = [
  "Sparky", "Pebble", "Mochi", "Ziggy", "Coco", "Nimbus", "Pixel", "Biscuit",
  "Juno", "Tango", "Echo", "Wisp", "Clover", "Bramble", "Solstice", "Marble",
];

const ACTIVITY_TEMPLATES: { type: string; unit: string; min: number; max: number; xp: number; realm: string; note: string; distanceMiles?: [number, number] }[] = [
  { type: "steps", unit: "steps", min: 3200, max: 12500, xp: 40, realm: "cardio", note: "Hit my step goal!" },
  { type: "running", unit: "miles", min: 2, max: 6, xp: 80, realm: "cardio", note: "Morning run done.", distanceMiles: [2, 6] },
  { type: "walking", unit: "miles", min: 1, max: 4, xp: 30, realm: "cardio", note: "Lunch walk.", distanceMiles: [1, 4] },
  { type: "strength", unit: "minutes", min: 25, max: 60, xp: 90, realm: "strength", note: "Lifted heavy today." },
  { type: "yoga", unit: "minutes", min: 20, max: 45, xp: 50, realm: "balance", note: "Stretched it out." },
  { type: "cycling", unit: "miles", min: 5, max: 18, xp: 70, realm: "cardio", note: "Quick spin on the bike.", distanceMiles: [5, 18] },
  { type: "hike", unit: "miles", min: 2, max: 8, xp: 100, realm: "balance", note: "Trail day!", distanceMiles: [2, 8] },
];

const INTRO_POSTS = [
  "New to HatchUp — excited to find some workout buddies!",
  "Day one streak. Let's see how long I can keep this going.",
  "Just hatched my first creature 🐣 — anyone got tips?",
  "Looking for a running group near me. Hit me up!",
  "Calmer mornings, stronger evenings. Loving the routine.",
  "Quick lift this morning. Small steps, every day.",
  "Stretched, hydrated, ready. Have a great one out there!",
  "Hatchlings keep me honest — gotta walk to feed 'em.",
];

const INTRO_RATIO = 0.4; // ~40% of demo accounts get an intro post.

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

// Derive a deterministic seed from a string. Used to give each artifact type
// (hatchling, each activity slot, intro decision) its own independent PRNG
// stream so idempotency holds even when some inserts are skipped on rerun.
function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
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

    await seedHatchling(playerId, username);
    await seedActivities(playerId, username);
    await maybeSeedIntroPost(playerId, username);
  }

  return { inserted, updated, skipped };
}

async function seedHatchling(playerId: number, username: string): Promise<void> {
  // Each artifact type gets its own PRNG stream derived deterministically
  // from the username, so the values used here are stable regardless of
  // whether prior inserts ran or were skipped on a previous pass.
  const rand = seededRandom(seedFromString(`${username}::hatchling`));
  const tpl = pick(DEMO_HATCHLINGS, rand);
  const hatchlingName = `${pick(HATCHLING_NAMES, rand)} (${username.slice(-4)})`;

  // Idempotent: skip if the demo player already has any hatchling.
  const anyExisting = await pool.query<{ id: number }>(
    `SELECT id FROM hatchlings WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  if (anyExisting.rowCount && anyExisting.rows[0]) return;

  const level = 1 + Math.floor(rand() * 12);
  const xp = level * 80 + Math.floor(rand() * 80);
  const friendship = Math.floor(rand() * 60);
  const imageUrl = `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(`${username}-${tpl.species}`)}`;

  await pool.query(
    `INSERT INTO hatchlings
       (player_id, name, species, category, rarity, personality, mood,
        level, xp, happiness, hunger, energy,
        ability_name, ability_desc, image_url, realm, friendship_level, mood_state)
     VALUES ($1, $2, $3, $4, 'Common', 'Calm', 'happy',
             $5, $6, 80, 60, 90,
             $7, $8, $9, $10, $11, 'happy')`,
    [
      playerId, hatchlingName, tpl.species, tpl.category,
      level, xp,
      tpl.ability.name, tpl.ability.desc, imageUrl, tpl.realm, friendship,
    ],
  );
}

async function seedActivities(playerId: number, username: string): Promise<void> {
  // Derive a deterministic activity count (1..3) up front so reruns always
  // target the same set of slots, even if some were inserted previously.
  const countRand = seededRandom(seedFromString(`${username}::activity-count`));
  const count = 1 + Math.floor(countRand() * 3);

  for (let i = 0; i < count; i++) {
    const externalId = `demo_seed:${username}:${i}`;
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM fitness_activities WHERE external_id = $1 LIMIT 1`,
      [externalId],
    );
    if (existing.rowCount && existing.rows[0]) continue;

    // Each slot gets its own independent PRNG stream.
    const rand = seededRandom(seedFromString(`${username}::activity::${i}`));
    const tpl = pick(ACTIVITY_TEMPLATES, rand);
    const value = tpl.min + Math.floor(rand() * (tpl.max - tpl.min + 1));
    const distance = tpl.distanceMiles
      ? tpl.distanceMiles[0] + rand() * (tpl.distanceMiles[1] - tpl.distanceMiles[0])
      : null;
    const hoursAgo = Math.floor(rand() * 24 * 7) + i * 2;

    await pool.query(
      `INSERT INTO fitness_activities
         (player_id, type, value, unit, fitness_xp_earned, realm, note,
          external_id, distance_miles, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - ($10 || ' hours')::interval)`,
      [
        playerId, tpl.type, value, tpl.unit, tpl.xp, tpl.realm, tpl.note,
        externalId, distance, String(hoursAgo),
      ],
    );
  }
}

async function maybeSeedIntroPost(playerId: number, username: string): Promise<void> {
  // Deterministic decision: stable across reruns regardless of other inserts.
  const rand = seededRandom(seedFromString(`${username}::intro`));
  if (rand() > INTRO_RATIO) return;

  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM posts
       WHERE player_id = $1
         AND metadata IS NOT NULL
         AND metadata->>'demoSeed' = 'intro'
       LIMIT 1`,
    [playerId],
  );
  if (existing.rowCount && existing.rows[0]) return;

  const contentIdx = Math.floor(rand() * INTRO_POSTS.length);
  const content = INTRO_POSTS[contentIdx]!;
  const hoursAgo = 6 + Math.floor(rand() * 72); // 6h - 3d ago

  await pool.query(
    `INSERT INTO posts
       (player_id, content, post_type, metadata, created_at)
     VALUES ($1, $2, 'general', $3::jsonb,
             NOW() - ($4 || ' hours')::interval)`,
    [playerId, content, JSON.stringify({ demoSeed: "intro" }), String(hoursAgo)],
  );
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
