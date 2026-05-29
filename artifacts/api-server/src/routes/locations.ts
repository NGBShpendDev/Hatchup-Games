import { Router } from "express";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { validateGpsUpdate } from "../services/antiCheat.ts";
import { locationUpdateLimiter } from "../middlewares/rateLimiters.ts";
import { db } from "@workspace/db";
import {
  playersTable,
  playerLocationTable,
  localChallengesTable,
  localChallengeParticipantsTable,
  playerArtifactsTable,
} from "@workspace/db";
import { eq, and, gte, lte, or, sql } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { getHiddenPlayerIds } from "./safety.ts";

const router = Router();

// ── Encryption helpers ────────────────────────────────────────────────────────
// Coordinates are encrypted with AES-256-GCM using the SESSION_SECRET.
// Encrypted values are stored in lat_encrypted/lng_encrypted — NEVER returned in API responses.
// Only city/state/county/country (from Nominatim reverse geocoding) are returned to clients.

function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is required for location coordinate encryption (min 16 chars). Refusing to encrypt with a weak or missing key.");
  }
  return createHash("sha256").update(secret).digest(); // 32-byte key → AES-256
}

// ── Visibility policy (shared between scoped leaderboard + local challenges) ──
// `hidden`        → world scope only (never appears on any location board/challenge)
// `city`/`neighborhood` → only city/nearby scope (does NOT appear in country/state/county boards)
// `exact`         → appears at every scope
export function canAppearInScope(visibility: string | null | undefined, scope: string): boolean {
  if (scope === "world") return true;
  const v = visibility ?? "city";
  if (v === "hidden") return false;
  if (v === "exact") return true;
  // city or neighborhood: only city-grain boards
  return scope === "city" || scope === "nearby";
}

function decryptCoordinate(blob: string | null | undefined): number | null {
  if (!blob) return null;
  try {
    const [ivB64, tagB64, ctB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const key = deriveKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function encryptCoordinate(value: number): string {
  const key = deriveKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.from(value.toString(), "utf8");
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv):base64(authTag):base64(ciphertext)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

// ── Location trust boundary helper ───────────────────────────────────────────
// Client-supplied GPS coordinates cannot be cryptographically verified. To
// mitigate location spoofing attacks (e.g. setting fake coordinates for a
// small city to unlock regional features or Top-10 Premium), we require that
// a location record has been stable for a minimum period before it can be used
// to authorize access to location-gated endpoints.
//
// This does not guarantee the player is physically present — it raises the cost
// of a sustained spoofing attack and is defense-in-depth alongside rate
// limiting and anti-cheat velocity checks.
export const LOCATION_MIN_AGE_FOR_ACCESS_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns true when the location record is old enough to be used for
 * location-gated access control decisions. A fresh record (e.g. just set via
 * GPS spoof) returns false, blocking immediate access to regional features.
 */
export function isLocationEstablished(
  loc: { updatedAt?: Date | string | null } | null | undefined,
  minAgeMs: number = LOCATION_MIN_AGE_FOR_ACCESS_MS,
): boolean {
  if (!loc?.updatedAt) return false;
  return Date.now() - new Date(loc.updatedAt).getTime() >= minAgeMs;
}

// ── Scope eligibility helper ──────────────────────────────────────────────────
function isChallengeEligible(
  challenge: { scope: string; scopeValue: string },
  playerLoc: { country: string | null; state: string | null; county: string | null; city: string | null } | null | undefined,
): boolean {
  if (challenge.scope === "world") return true;
  if (!playerLoc) return false;
  if (challenge.scope === "country") return playerLoc.country === challenge.scopeValue;
  if (challenge.scope === "state")   return playerLoc.state   === challenge.scopeValue;
  if (challenge.scope === "county")  return playerLoc.county  === challenge.scopeValue;
  if (challenge.scope === "city")    return playerLoc.city    === challenge.scopeValue;
  return false;
}

// ── Safe record serializer (strips encrypted fields) ─────────────────────────
function safeLocationRecord(loc: typeof playerLocationTable.$inferSelect) {
  const { latEncrypted: _lat, lngEncrypted: _lng, ...safe } = loc;
  return safe;
}

// ── POST /players/me/location ─────────────────────────────────────────────────
// Accepts lat/lng → calls Nominatim → encrypts coords with AES-256-GCM → stores.
// Raw GPS values are used ONLY for the geocoding call; only ciphertext is persisted.
// Encrypted fields are NEVER returned in API responses.
//
// SECURITY: Geographic labels (city/state/county/country) are derived ONLY from
// Nominatim reverse geocoding of verified coordinates. Client-supplied label
// values are ignored entirely — accepting them would allow any user to declare
// an arbitrary region and bypass location-scoped access controls.
router.post("/players/me/location", requireAuth, attachPlayer, locationUpdateLimiter, async (req, res) => {
  const { latitude, longitude, accuracyMeters, visibility } = req.body as {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    visibility?: string;
  };

  const validVisibility = ["exact", "neighborhood", "city", "hidden"];
  if (visibility && !validVisibility.includes(visibility)) {
    res.status(400).json({ error: "Invalid visibility value" });
    return;
  }

  // Geographic labels start empty — they are ONLY populated via Nominatim below.
  // Client-supplied city/state/county/country are ignored to prevent region spoofing.
  let derived: { city?: string; state?: string; county?: string; country?: string; countryCode?: string } = {};

  // If coordinates are provided, always derive geographic labels from Nominatim.
  // Coordinates are used ONLY for this HTTP call; they are encrypted before any persistence.
  if (latitude != null && longitude != null) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { "User-Agent": "HatchUp-FitnessPals/1.0 (contact@hatchup.app)" } }
      );
      if (geoRes.ok) {
        const geo = await geoRes.json() as { address?: Record<string, string> };
        const addr = geo.address ?? {};
        derived = {
          city:        addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? undefined,
          state:       addr.state ?? undefined,
          county:      addr.county ?? undefined,
          country:     addr.country ?? undefined,
          countryCode: addr.country_code?.toUpperCase() ?? undefined,
        };
      }
    } catch (err) {
      req.log?.warn?.({ err }, "Nominatim geocoding failed, keeping existing geographic labels");
    }
  }

  // Fetch player for privacy sync
  const playerRow = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, req.playerId!),
  });
  const existing = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });

  // ── Anti-cheat: validate the new GPS update against the previous fix ──────
  // Decrypt the previous coordinates in-memory only; never expose them.
  if (latitude != null && longitude != null) {
    const prevLat = decryptCoordinate(existing?.latEncrypted);
    const prevLng = decryptCoordinate(existing?.lngEncrypted);
    const verdict = validateGpsUpdate({
      prevLat, prevLng,
      prevTimestamp: existing?.updatedAt ?? null,
      newLat: latitude,
      newLng: longitude,
      newTimestamp: new Date(),
      accuracyMeters: accuracyMeters ?? null,
    });
    if (verdict.verdict === "reject") {
      req.log?.warn?.({ playerId: req.playerId, reason: verdict.reason, details: verdict.details }, "GPS update rejected by anti-cheat");
      res.status(400).json({ error: "gps_anti_cheat_reject", reason: verdict.reason });
      return;
    }
    if (verdict.verdict === "suspicious") {
      req.log?.info?.({ playerId: req.playerId, reason: verdict.reason, details: verdict.details }, "GPS update flagged suspicious");
    }
  }

  // ── Minor-account safety enforcement ──────────────────────────────────────
  // Minor accounts cannot set precise location visibility via this endpoint.
  // Any "exact" or "neighborhood" request is silently downgraded to "city".
  let requestedVisibility = visibility;
  if (playerRow?.isMinor && requestedVisibility && (requestedVisibility === "exact" || requestedVisibility === "neighborhood")) {
    req.log?.info?.({ playerId: req.playerId, requested: requestedVisibility }, "Minor account location visibility downgraded to city");
    requestedVisibility = "city";
  }
  const resolvedVisibility = requestedVisibility ?? playerRow?.locationVisibility ?? existing?.visibility ?? "city";

  // Build the update payload using the inferred Drizzle type.
  // Geographic fields (city/state/county/country) fall back to the existing
  // record so that a failed Nominatim call or a coordinates-only update never
  // silently wipes the city the player already set — which would cause
  // GET /players/nearby to return locationRequired:true on subsequent requests.
  const base: Partial<typeof playerLocationTable.$inferInsert> = {
    country:     derived.country     ?? existing?.country     ?? null,
    countryCode: derived.countryCode ?? existing?.countryCode ?? null,
    state:       derived.state       ?? existing?.state       ?? null,
    county:      derived.county      ?? existing?.county      ?? null,
    city:        derived.city        ?? existing?.city        ?? null,
    visibility:  resolvedVisibility,
    updatedAt:   new Date(),
  };
  // Encrypt coordinates if provided — store as AES-256-GCM ciphertext, never expose
  if (latitude != null)  base.latEncrypted = encryptCoordinate(latitude);
  if (longitude != null) base.lngEncrypted = encryptCoordinate(longitude);

  let record: typeof playerLocationTable.$inferSelect;
  if (existing) {
    [record] = await db
      .update(playerLocationTable)
      .set(base)
      .where(eq(playerLocationTable.playerId, req.playerId!))
      .returning();
  } else {
    [record] = await db
      .insert(playerLocationTable)
      .values({ playerId: req.playerId!, ...base })
      .returning();
  }

  // Sync visibility to players table if explicitly provided (after minor downgrade).
  if (requestedVisibility && playerRow?.locationVisibility !== requestedVisibility) {
    await db.update(playersTable).set({ locationVisibility: requestedVisibility }).where(eq(playersTable.id, req.playerId!));
  }

  res.json(safeLocationRecord(record));
});

// ── GET /players/me/location ──────────────────────────────────────────────────
router.get("/players/me/location", requireAuth, attachPlayer, async (req, res) => {
  const loc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });
  res.json(loc ? safeLocationRecord(loc) : null);
});

// ── GET /local-challenges ─────────────────────────────────────────────────────
// Returns only ACTIVE world-scoped challenges (startAt <= now <= endAt).
// Hidden-visibility players are excluded from participant counts.
//
// SECURITY: Region-scoped challenges (city/county/state/country) are no longer
// listed here. Filtering by city/county/state/country labels derived from
// client-supplied GPS coordinates creates an unresolvable trust-boundary failure
// — any player can set their GPS to any city and see challenges intended for
// that region. Until a trusted location attestation mechanism exists, only
// world-scoped challenges are surfaced. See task #916.
router.get("/local-challenges", requireAuth, attachPlayer, async (req, res) => {
  const now = new Date();

  const challenges = await db.query.localChallengesTable.findMany({
    where: and(
      eq(localChallengesTable.scope, "world"),
      lte(localChallengesTable.startAt, now),
      gte(localChallengesTable.endAt, now),
    ),
  });

  // Participation data
  const myParticipations = await db.query.localChallengeParticipantsTable.findMany({
    where: eq(localChallengeParticipantsTable.playerId, req.playerId!),
  });
  const joinedIds = new Set(myParticipations.map(p => p.challengeId));

  const allParticipants = await db.query.localChallengeParticipantsTable.findMany();

  // Exclude hidden-visibility players from participant counts
  const hiddenPlayers = await db.query.playersTable.findMany({
    where: eq(playersTable.locationVisibility, "hidden"),
  });
  const hiddenPlayerIds = new Set(hiddenPlayers.map(p => p.id));

  const countMap: Record<number, number> = {};
  for (const p of allParticipants) {
    if (!hiddenPlayerIds.has(p.playerId)) {
      countMap[p.challengeId] = (countMap[p.challengeId] ?? 0) + 1;
    }
  }

  res.json(challenges.map(c => ({
    ...c,
    startAt:          c.startAt.toISOString(),
    endAt:            c.endAt.toISOString(),
    createdAt:        c.createdAt.toISOString(),
    participantCount: countMap[c.id] ?? 0,
    isJoined:         joinedIds.has(c.id),
    isRelevant:       true,
  })));
});

// ── POST /local-challenges/:id/join ───────────────────────────────────────────
router.post("/local-challenges/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.localChallengesTable.findFirst({ where: eq(localChallengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  const now = new Date();
  if (now > challenge.endAt)   { res.status(400).json({ error: "Challenge has ended" }); return; }
  if (now < challenge.startAt) { res.status(400).json({ error: "Challenge has not started yet" }); return; }

  // SECURITY: region-scoped challenges (non-world) cannot be joined because
  // eligibility is derived from client-supplied GPS coordinates the server
  // cannot cryptographically verify. Any player could spoof their city and join
  // a challenge intended for a different region. Only world-scoped challenges
  // are joinable until a trusted location attestation mechanism is available.
  if (challenge.scope !== "world") {
    res.status(503).json({
      error: "location_untrusted",
      message: "Region-restricted challenges are temporarily unavailable pending trusted location verification.",
    });
    return;
  }

  const existing = await db.query.localChallengeParticipantsTable.findFirst({
    where: and(eq(localChallengeParticipantsTable.challengeId, id), eq(localChallengeParticipantsTable.playerId, req.playerId!)),
  });
  if (existing) { res.json({ joined: true, alreadyJoined: true }); return; }

  await db.insert(localChallengeParticipantsTable).values({ challengeId: id, playerId: req.playerId!, currentValue: 0 });
  res.json({ joined: true, alreadyJoined: false });
});

// ── GET /local-challenges/:id/leaderboard ─────────────────────────────────────
// Scope authorization required — prevents cross-region participant enumeration.
// For ended challenges: automatically awards XP/coins to top 3 (idempotent via rewardsAwarded flag).
// Hidden-visibility players are excluded from displayed leaderboard.
router.get("/local-challenges/:id/leaderboard", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.localChallengesTable.findFirst({ where: eq(localChallengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  // SECURITY: region-scoped challenge leaderboards are disabled for the same
  // reason as join — eligibility is derived from client-supplied GPS coordinates
  // that cannot be verified server-side, so access control based on city labels
  // creates a broken trust boundary. Only world-scoped challenge leaderboards
  // are accessible until trusted location attestation is available.
  if (challenge.scope !== "world") {
    res.status(503).json({
      error: "location_untrusted",
      message: "Region-restricted challenge leaderboards are temporarily unavailable pending trusted location verification.",
    });
    return;
  }

  const participants = await db.query.localChallengeParticipantsTable.findMany({
    where: eq(localChallengeParticipantsTable.challengeId, id),
  });

  const playerIds = participants.map(p => p.playerId);
  const players = playerIds.length > 0
    ? await db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, playerIds) })
    : [];

  // Apply the canonical people-discovery policy (safety.ts:1100-1127):
  //   1. Exclude players blocked in either direction with the viewer.
  //   2. Exclude players with locationVisibility === "hidden" (for non-world scopes).
  //   3. Exclude minor accounts (isMinor === true).
  // The viewer's own row is never in the blocked set (getHiddenPlayerIds removes viewerId).
  const hiddenIds = new Set(await getHiddenPlayerIds(req.playerId!));
  const playerMap = new Map(
    players
      .filter(p =>
        !hiddenIds.has(p.id) &&
        !p.isMinor &&
        (challenge.scope === "world" || p.locationVisibility !== "hidden"),
      )
      .map(p => [p.id, p])
  );

  const visibleParticipants = participants.filter(p => playerMap.has(p.playerId));
  const sorted = [...visibleParticipants].sort((a, b) => b.currentValue - a.currentValue);

  const now = new Date();
  const isEnded = now > challenge.endAt;

  // ── Reward top 3 for ended challenges (race-safe + idempotent) ───────────
  // CRITICAL: under concurrent requests, multiple readers could see rewardsAwarded=false
  // and double-pay. We prevent this by using a conditional UPDATE that flips the flag
  // ONLY where it is still false, then awarding XP/coins/artifact ONLY if the update
  // actually mutated a row (returning() lists affected rows). This makes each
  // participant rewarded exactly once even under heavy concurrency.
  const rewardTiers = [1.0, 0.6, 0.3];
  if (isEnded) {
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      const participant = sorted[i];
      if (participant.rewardsAwarded) continue; // fast path: already paid

      // Atomic flip — only one concurrent request can win
      const claimed = await db.update(localChallengeParticipantsTable)
        .set({ rank: i + 1, rewardsAwarded: true })
        .where(and(
          eq(localChallengeParticipantsTable.id, participant.id),
          eq(localChallengeParticipantsTable.rewardsAwarded, false),
        ))
        .returning({ id: localChallengeParticipantsTable.id });

      if (claimed.length === 0) {
        // Someone else just paid this row — re-read to reflect their state
        const fresh = await db.query.localChallengeParticipantsTable.findFirst({
          where: eq(localChallengeParticipantsTable.id, participant.id),
        });
        if (fresh) {
          participant.rank = fresh.rank;
          participant.rewardsAwarded = fresh.rewardsAwarded;
        }
        continue;
      }

      // We won the race — pay rewards exactly once
      const xpAward   = Math.round(challenge.rewardXp   * rewardTiers[i]);
      const coinAward = Math.round(challenge.rewardCoins * rewardTiers[i]);
      await db.update(playersTable)
        .set({ xp: sql`xp + ${xpAward}`, coins: sql`coins + ${coinAward}` })
        .where(eq(playersTable.id, participant.playerId));

      // Grant artifact if the challenge defines one (top 3 all get a copy)
      if (challenge.rewardArtifactId != null) {
        await db.insert(playerArtifactsTable)
          .values({ playerId: participant.playerId, artifactId: challenge.rewardArtifactId })
          .onConflictDoNothing(); // unique(playerId, artifactId) — idempotent
      }

      // Reflect in-memory so response shows awarded state
      participant.rank = i + 1;
      participant.rewardsAwarded = true;
    }
  }

  const entries = sorted.map((p, i) => {
    const player = playerMap.get(p.playerId);
    const rewardEarned = p.rewardsAwarded && i < 3
      ? {
          xp:         Math.round(challenge.rewardXp   * rewardTiers[i]),
          coins:      Math.round(challenge.rewardCoins * rewardTiers[i]),
          artifactId: challenge.rewardArtifactId ?? null,
        }
      : null;
    return {
      rank:           i + 1,
      playerId:       p.playerId,
      username:       player?.username ?? "Unknown",
      displayName:    player?.displayName ?? null,
      avatarUrl:      player?.avatarUrl ?? null,
      level:          player?.level ?? 1,
      currentValue:   p.currentValue,
      completedAt:    p.completedAt?.toISOString() ?? null,
      rewardsAwarded: p.rewardsAwarded,
      rewardEarned,
      isMe:           p.playerId === req.playerId,
    };
  });

  const joinedIds = new Set(participants.map(p => p.playerId));
  const challengeWithMeta = {
    ...challenge,
    startAt:          challenge.startAt.toISOString(),
    endAt:            challenge.endAt.toISOString(),
    createdAt:        challenge.createdAt.toISOString(),
    participantCount: visibleParticipants.length,
    isJoined:         joinedIds.has(req.playerId!),
    isRelevant:       true,
    isEnded,
  };

  res.json({
    challenge: challengeWithMeta,
    entries,
    myEntry:  entries.find(e => e.isMe) ?? null,
    winners:  entries.slice(0, 3),
  });
});

export default router;
