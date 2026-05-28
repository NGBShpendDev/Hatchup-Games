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
router.post("/players/me/location", locationUpdateLimiter, requireAuth, attachPlayer, async (req, res) => {
  const { latitude, longitude, accuracyMeters, city, state, county, country, countryCode, visibility } = req.body as {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    city?: string;
    state?: string;
    county?: string;
    country?: string;
    countryCode?: string;
    visibility?: string;
  };

  const validVisibility = ["exact", "neighborhood", "city", "hidden"];
  if (visibility && !validVisibility.includes(visibility)) {
    res.status(400).json({ error: "Invalid visibility value" });
    return;
  }

  let derived = { city, state, county, country, countryCode };

  // If coordinates provided but no city, attempt Nominatim reverse geocoding.
  // Coordinates are used ONLY for this HTTP call; they are encrypted before any persistence.
  if (latitude != null && longitude != null && !city) {
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
      req.log?.warn?.({ err }, "Nominatim geocoding failed, using provided values");
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

  // Build the update payload using the inferred Drizzle type
  const base: Partial<typeof playerLocationTable.$inferInsert> = {
    country:     derived.country     ?? null,
    countryCode: derived.countryCode ?? null,
    state:       derived.state       ?? null,
    county:      derived.county      ?? null,
    city:        derived.city        ?? null,
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
// Returns only ACTIVE challenges (startAt <= now <= endAt) relevant to the player's location.
// Scope conditions are built without undefined values to avoid drizzle broadening matches.
// Hidden-visibility players are excluded from participant counts.
router.get("/local-challenges", requireAuth, attachPlayer, async (req, res) => {
  const now = new Date();

  const playerLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });

  // Build scope conditions without undefined — avoids drizzle treating and(..., undefined) as a broader match
  type WhereExpr = ReturnType<typeof eq>;
  const scopeConditions: WhereExpr[] = [eq(localChallengesTable.scope, "world") as WhereExpr];

  if (playerLoc?.country) {
    scopeConditions.push(and(eq(localChallengesTable.scope, "country"), eq(localChallengesTable.scopeValue, playerLoc.country)) as WhereExpr);
  }
  if (playerLoc?.state) {
    scopeConditions.push(and(eq(localChallengesTable.scope, "state"), eq(localChallengesTable.scopeValue, playerLoc.state)) as WhereExpr);
  }
  if (playerLoc?.county) {
    scopeConditions.push(and(eq(localChallengesTable.scope, "county"), eq(localChallengesTable.scopeValue, playerLoc.county)) as WhereExpr);
  }
  if (playerLoc?.city) {
    scopeConditions.push(and(eq(localChallengesTable.scope, "city"), eq(localChallengesTable.scopeValue, playerLoc.city)) as WhereExpr);
  }

  const challenges = await db.query.localChallengesTable.findMany({
    where: and(
      or(...(scopeConditions as [WhereExpr, ...WhereExpr[]])),
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

  // Hidden-visibility players cannot join location-based challenges at all.
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (challenge.scope !== "world" && player?.locationVisibility === "hidden") {
    res.status(403).json({ error: "Location visibility must not be 'hidden' to join location-based challenges" });
    return;
  }

  const playerLoc = await db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, req.playerId!) });
  if (!isChallengeEligible(challenge, playerLoc)) {
    res.status(403).json({ error: "This challenge is not available in your location" });
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

  // Authorization: requester must be in-scope to see participant data
  const viewerLoc = await db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, req.playerId!) });
  if (!isChallengeEligible(challenge, viewerLoc)) {
    res.status(403).json({ error: "Challenge not available in your location" });
    return;
  }

  const participants = await db.query.localChallengeParticipantsTable.findMany({
    where: eq(localChallengeParticipantsTable.challengeId, id),
  });

  const playerIds = participants.map(p => p.playerId);
  const players = playerIds.length > 0
    ? await db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, playerIds) })
    : [];

  // Hidden-visibility players are fully excluded from location-based challenge leaderboards
  // (no viewer exception — they shouldn't be on a location board at all).
  // For world-scope challenges they remain visible.
  const playerMap = new Map(
    players
      .filter(p => challenge.scope === "world" || p.locationVisibility !== "hidden")
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
