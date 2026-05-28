import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  playerLocationTable,
  localChallengesTable,
  localChallengeParticipantsTable,
} from "@workspace/db";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";

const router = Router();

// ── POST /players/me/location ─────────────────────────────────────────────────
// Accepts lat/lng (calls Nominatim for reverse geocoding) OR direct city/state/country fields.
// Raw GPS coordinates are used ONLY for the geocoding call and are NEVER persisted to the database.
// Privacy source of truth is players.locationVisibility — synced into player_location.visibility here.
router.post("/players/me/location", requireAuth, attachPlayer, async (req, res) => {
  const { latitude, longitude, city, state, county, country, countryCode, visibility } = req.body as {
    latitude?: number;
    longitude?: number;
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

  let derived: { city?: string | null; state?: string | null; county?: string | null; country?: string | null; countryCode?: string | null } = {
    city, state, county, country, countryCode,
  };

  // If coordinates provided but no city, attempt Nominatim reverse geocoding.
  // Coordinates are used only for this HTTP call and never written to the DB.
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
          city:        addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
          state:       addr.state ?? null,
          county:      addr.county ?? null,
          country:     addr.country ?? null,
          countryCode: addr.country_code?.toUpperCase() ?? null,
        };
      }
    } catch (err) {
      req.log?.warn?.({ err }, "Nominatim geocoding failed, using provided values");
    }
  }

  // Fetch the player record to sync locationVisibility as the canonical privacy value
  const playerRow = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, req.playerId!),
  });

  // visibility hierarchy: explicit request param > players.locationVisibility > existing record > default "city"
  const existing = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });
  const resolvedVisibility = visibility ?? playerRow?.locationVisibility ?? existing?.visibility ?? "city";

  const upsertData = {
    country:     derived.country   ?? null,
    countryCode: derived.countryCode ?? null,
    state:       derived.state     ?? null,
    county:      derived.county    ?? null,
    city:        derived.city      ?? null,
    visibility:  resolvedVisibility,
    updatedAt:   new Date(),
  };

  let record;
  if (existing) {
    const [updated] = await db
      .update(playerLocationTable)
      .set(upsertData)
      .where(eq(playerLocationTable.playerId, req.playerId!))
      .returning();
    record = updated;
  } else {
    const [created] = await db
      .insert(playerLocationTable)
      .values({ playerId: req.playerId!, ...upsertData })
      .returning();
    record = created;
  }

  // Sync visibility back to players table if an explicit value was provided
  if (visibility && playerRow?.locationVisibility !== visibility) {
    await db
      .update(playersTable)
      .set({ locationVisibility: visibility })
      .where(eq(playersTable.id, req.playerId!));
  }

  res.json(record);
});

// ── GET /players/me/location ──────────────────────────────────────────────────
router.get("/players/me/location", requireAuth, attachPlayer, async (req, res) => {
  const loc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });
  res.json(loc ?? null);
});

// ── GET /local-challenges ─────────────────────────────────────────────────────
// Returns only challenges relevant to the player's actual location scope.
// World challenges are always included. Scoped challenges require a matching location.
router.get("/local-challenges", requireAuth, attachPlayer, async (req, res) => {
  const now = new Date();

  const playerLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });

  // Build a filter that matches world challenges + any challenge matching the player's location fields
  // If player has no location, only world challenges are shown
  const relevantFilter = playerLoc
    ? or(
        eq(localChallengesTable.scope, "world"),
        and(eq(localChallengesTable.scope, "country"), playerLoc.country ? eq(localChallengesTable.scopeValue, playerLoc.country) : undefined),
        and(eq(localChallengesTable.scope, "state"),   playerLoc.state   ? eq(localChallengesTable.scopeValue, playerLoc.state)   : undefined),
        and(eq(localChallengesTable.scope, "county"),  playerLoc.county  ? eq(localChallengesTable.scopeValue, playerLoc.county)  : undefined),
        and(eq(localChallengesTable.scope, "city"),    playerLoc.city    ? eq(localChallengesTable.scopeValue, playerLoc.city)    : undefined),
      )
    : eq(localChallengesTable.scope, "world");

  // Only return currently active challenges (startAt <= now AND endAt >= now)
  const challenges = await db.query.localChallengesTable.findMany({
    where: and(
      relevantFilter,
      lte(localChallengesTable.startAt, now),
      gte(localChallengesTable.endAt, now),
    ),
  });

  // Get participation data
  const myParticipations = await db.query.localChallengeParticipantsTable.findMany({
    where: eq(localChallengeParticipantsTable.playerId, req.playerId!),
  });
  const joinedIds = new Set(myParticipations.map(p => p.challengeId));

  const allParticipants = await db.query.localChallengeParticipantsTable.findMany();
  const countMap: Record<number, number> = {};
  for (const p of allParticipants) {
    countMap[p.challengeId] = (countMap[p.challengeId] ?? 0) + 1;
  }

  const result = challenges.map(c => ({
    ...c,
    startAt:          c.startAt.toISOString(),
    endAt:            c.endAt.toISOString(),
    createdAt:        c.createdAt.toISOString(),
    participantCount: countMap[c.id] ?? 0,
    isJoined:         joinedIds.has(c.id),
    isRelevant:       true, // All returned challenges are pre-filtered to be relevant
  }));

  res.json(result);
});

// ── POST /local-challenges/:id/join ───────────────────────────────────────────
router.post("/local-challenges/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.localChallengesTable.findFirst({
    where: eq(localChallengesTable.id, id),
  });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  const now = new Date();
  if (now > challenge.endAt) {
    res.status(400).json({ error: "Challenge has ended" });
    return;
  }

  // Verify the challenge is relevant to this player
  const playerLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });

  const isEligible =
    challenge.scope === "world" ||
    (challenge.scope === "country" && playerLoc?.country === challenge.scopeValue) ||
    (challenge.scope === "state"   && playerLoc?.state   === challenge.scopeValue) ||
    (challenge.scope === "county"  && playerLoc?.county  === challenge.scopeValue) ||
    (challenge.scope === "city"    && playerLoc?.city    === challenge.scopeValue);

  if (!isEligible) {
    res.status(403).json({ error: "This challenge is not available in your location" });
    return;
  }

  const existing = await db.query.localChallengeParticipantsTable.findFirst({
    where: and(
      eq(localChallengeParticipantsTable.challengeId, id),
      eq(localChallengeParticipantsTable.playerId, req.playerId!)
    ),
  });
  if (existing) {
    res.json({ joined: true, alreadyJoined: true });
    return;
  }

  await db.insert(localChallengeParticipantsTable).values({
    challengeId: id,
    playerId:    req.playerId!,
    currentValue: 0,
  });

  res.json({ joined: true, alreadyJoined: false });
});

// ── GET /local-challenges/:id/leaderboard ─────────────────────────────────────
router.get("/local-challenges/:id/leaderboard", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.localChallengesTable.findFirst({
    where: eq(localChallengesTable.id, id),
  });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  // Authorization: requester must be eligible for this challenge's scope before participant data is exposed.
  // This prevents cross-region enumeration of local participant identities.
  const viewerLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });
  const viewerEligible =
    challenge.scope === "world" ||
    (challenge.scope === "country" && viewerLoc?.country === challenge.scopeValue) ||
    (challenge.scope === "state"   && viewerLoc?.state   === challenge.scopeValue) ||
    (challenge.scope === "county"  && viewerLoc?.county  === challenge.scopeValue) ||
    (challenge.scope === "city"    && viewerLoc?.city    === challenge.scopeValue);
  if (!viewerEligible) {
    res.status(403).json({ error: "Challenge not available in your location" });
    return;
  }

  const participants = await db.query.localChallengeParticipantsTable.findMany({
    where: eq(localChallengeParticipantsTable.challengeId, id),
  });

  const playerIds = participants.map(p => p.playerId);
  const players = playerIds.length > 0
    ? await db.query.playersTable.findMany({
        where: (t, { inArray }) => inArray(t.id, playerIds),
      })
    : [];
  const playerMap = new Map(players.map(p => [p.id, p]));

  const sorted = [...participants].sort((a, b) => b.currentValue - a.currentValue);

  const entries = sorted.map((p, i) => {
    const player = playerMap.get(p.playerId);
    return {
      rank:         i + 1,
      playerId:     p.playerId,
      username:     player?.username ?? "Unknown",
      displayName:  player?.displayName ?? null,
      avatarUrl:    player?.avatarUrl ?? null,
      level:        player?.level ?? 1,
      currentValue: p.currentValue,
      completedAt:  p.completedAt?.toISOString() ?? null,
      isMe:         p.playerId === req.playerId,
    };
  });

  // Build full challenge object with computed fields (matching LocalChallenge schema)
  const joinedIds = new Set(participants.map(p => p.playerId));
  const challengeWithMeta = {
    ...challenge,
    startAt:          challenge.startAt.toISOString(),
    endAt:            challenge.endAt.toISOString(),
    createdAt:        challenge.createdAt.toISOString(),
    participantCount: participants.length,
    isJoined:         joinedIds.has(req.playerId!),
    isRelevant:       true,
  };

  res.json({
    challenge: challengeWithMeta,
    entries,
    myEntry: entries.find(e => e.isMe) ?? null,
    winners: entries.slice(0, 3),
  });
});

export default router;
