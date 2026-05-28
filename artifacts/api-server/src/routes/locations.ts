import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  playerLocationTable,
  localChallengesTable,
  localChallengeParticipantsTable,
} from "@workspace/db";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";

const router = Router();

// ── POST /players/me/location ─────────────────────────────────────────────────
// Accepts lat/lng (calls Nominatim) OR direct city/state/country fields.
// Raw coordinates are stored server-side but never returned in responses.
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

  let derived = { city, state, county, country, countryCode };

  // If coordinates provided but no city, attempt Nominatim reverse geocoding
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

  const existing = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });

  const upsertData = {
    ...derived,
    latRaw:     latitude ?? null,
    lngRaw:     longitude ?? null,
    visibility: visibility ?? existing?.visibility ?? "city",
    updatedAt:  new Date(),
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

  // Never expose raw coordinates
  const { latRaw: _lat, lngRaw: _lng, ...safe } = record;
  res.json(safe);
});

// ── GET /players/me/location ──────────────────────────────────────────────────
router.get("/players/me/location", requireAuth, attachPlayer, async (req, res) => {
  const loc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });
  if (!loc) { res.json(null); return; }
  const { latRaw: _lat, lngRaw: _lng, ...safe } = loc;
  res.json(safe);
});

// ── GET /local-challenges ─────────────────────────────────────────────────────
router.get("/local-challenges", requireAuth, attachPlayer, async (req, res) => {
  const now = new Date();

  // Get the player's location for local filtering
  const playerLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, req.playerId!),
  });

  // All active challenges
  const all = await db.query.localChallengesTable.findMany({
    where: and(
      lte(localChallengesTable.startAt, now),
      gte(localChallengesTable.endAt, now)
    ),
  });

  // For each challenge, check if player already joined
  const myParticipations = await db.query.localChallengeParticipantsTable.findMany({
    where: eq(localChallengeParticipantsTable.playerId, req.playerId!),
  });
  const joinedIds = new Set(myParticipations.map(p => p.challengeId));

  // Get participant counts
  const allParticipants = await db.query.localChallengeParticipantsTable.findMany();
  const countMap: Record<number, number> = {};
  for (const p of allParticipants) {
    countMap[p.challengeId] = (countMap[p.challengeId] ?? 0) + 1;
  }

  const result = all.map(c => ({
    ...c,
    startAt:           c.startAt.toISOString(),
    endAt:             c.endAt.toISOString(),
    createdAt:         c.createdAt.toISOString(),
    participantCount:  countMap[c.id] ?? 0,
    isJoined:          joinedIds.has(c.id),
    isRelevant:        c.scope === "world" || (
      playerLoc && (
        (c.scope === "country" && playerLoc.country === c.scopeValue) ||
        (c.scope === "state"   && playerLoc.state   === c.scopeValue) ||
        (c.scope === "county"  && playerLoc.county  === c.scopeValue) ||
        (c.scope === "city"    && playerLoc.city    === c.scopeValue)
      )
    ),
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

  // Rank by currentValue descending
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

  res.json({
    challenge: {
      ...challenge,
      startAt:   challenge.startAt.toISOString(),
      endAt:     challenge.endAt.toISOString(),
      createdAt: challenge.createdAt.toISOString(),
    },
    entries,
    myEntry: entries.find(e => e.isMe) ?? null,
  });
});

export default router;
