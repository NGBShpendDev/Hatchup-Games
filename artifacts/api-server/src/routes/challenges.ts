import { Router } from "express";
import { db } from "@workspace/db";
import {
  challengesTable,
  challengeParticipantsTable,
  challengeInvitesTable,
  playersTable,
  userReportsTable,
  notificationsTable,
  playerLocationTable,
} from "@workspace/db";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { sendPushToPlayer } from "../services/pushNotifications.ts";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { isLocationEstablished } from "./locations.ts";
import {
  finalizeChallenge,
  sendEndingSoonPushes,
} from "../services/challengeFinalize.ts";
import { rankChallengeParticipants } from "../services/eliminationBracket.ts";

export { finalizeChallenge, sendEndingSoonPushes };

const router = Router();

// ── Profanity / keyword filter ─────────────────────────────────────────────
const BAD_WORDS = ["hate", "stupid", "idiot", "loser", "dumb", "kill", "die", "nude", "nsfw"];
function containsFlaggedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w));
}

// ── Access-control helpers ─────────────────────────────────────────────────

interface AccessContext {
  playerId: number;
  playerClubId: number | null | undefined;
  playerCity: string | null | undefined;
  /** updatedAt of the player's location record — used to enforce the minimum
   *  location-age requirement before granting city-scoped challenge access. */
  playerLocationUpdatedAt: Date | string | null | undefined;
  /** challenge IDs the player has already joined */
  participatingIds: Set<number>;
  /** challenge IDs the player has a pending or accepted invite for */
  invitedIds: Set<number>;
}

/**
 * Returns true if the player is allowed to browse / view / join this challenge.
 * For browse we pass a pre-built context to avoid N+1 queries.
 */
async function canAccess(
  challenge: { id: number; type: string; creatorId: number },
  ctx: AccessContext,
  creatorClubId?: number | null,
  creatorCity?: string | null,
): Promise<boolean> {
  if (challenge.type === "public") return true;
  if (challenge.creatorId === ctx.playerId) return true;
  if (ctx.participatingIds.has(challenge.id)) return true;

  if (challenge.type === "private") {
    return ctx.invitedIds.has(challenge.id);
  }

  if (challenge.type === "guild") {
    if (!ctx.playerClubId) return false;
    // creatorClubId may be passed in (pre-loaded) or we need to fetch it
    const ccId = creatorClubId !== undefined
      ? creatorClubId
      : (await db.query.playersTable.findFirst({ where: eq(playersTable.id, challenge.creatorId) }))?.clubId;
    return !!ccId && ccId === ctx.playerClubId;
  }

  if (challenge.type === "city") {
    // Default-deny: both parties must have a known city and they must match.
    // Additionally, the player's location record must be established (not freshly
    // set) to prevent a spoofing attack where an attacker posts fake coordinates
    // for a target city and immediately gains access to its city-scoped challenges.
    if (!ctx.playerCity) return false;
    if (!isLocationEstablished({ updatedAt: ctx.playerLocationUpdatedAt })) return false;
    const cCity = creatorCity !== undefined
      ? creatorCity
      : (await db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, challenge.creatorId) }))?.city;
    if (!cCity) return false; // creator city unknown → deny
    return cCity === ctx.playerCity;
  }

  return false;
}

/**
 * Build an AccessContext for the current player with a single batch load.
 * challengeIds: the universe of challenge IDs being considered (for invite check).
 */
async function buildAccessContext(playerId: number, challengeIds: number[]): Promise<AccessContext> {
  const [player, playerLocation, participations, invites] = await Promise.all([
    db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
    db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, playerId) }),
    db.query.challengeParticipantsTable.findMany({ where: eq(challengeParticipantsTable.playerId, playerId) }),
    challengeIds.length
      ? db.query.challengeInvitesTable.findMany({
          where: and(
            eq(challengeInvitesTable.inviteeId, playerId),
            inArray(challengeInvitesTable.challengeId, challengeIds),
            // Declined invites do NOT grant access — only pending or accepted do
            or(
              eq(challengeInvitesTable.status, "pending"),
              eq(challengeInvitesTable.status, "accepted"),
            ),
          ),
        })
      : Promise.resolve([]),
  ]);

  return {
    playerId,
    playerClubId: player?.clubId,
    playerCity: playerLocation?.city,
    playerLocationUpdatedAt: playerLocation?.updatedAt,
    participatingIds: new Set(participations.map(p => p.challengeId)),
    invitedIds: new Set(invites.map(i => i.challengeId)),
  };
}

// ── Browse challenges ──────────────────────────────────────────────────────
router.get("/challenges", requireAuth, attachPlayer, async (req, res) => {
  const tab = (req.query.tab as string) ?? "trending";
  const metric = req.query.metric as string | undefined;
  const type = req.query.type as string | undefined;
  const playerId = req.playerId!;

  let rows = await db.query.challengesTable.findMany({
    orderBy: [desc(challengesTable.createdAt)],
    limit: 50,
  });

  // Auto-finalize expired challenges
  const now = new Date();
  for (const c of rows) {
    if (c.status === "active" && new Date(c.endAt) < now) {
      await finalizeChallenge(c.id);
    }
  }

  // Re-fetch after finalization
  rows = await db.query.challengesTable.findMany({
    orderBy: [desc(challengesTable.createdAt)],
    limit: 50,
  });

  if (metric) rows = rows.filter(c => c.metric === metric);
  if (type) rows = rows.filter(c => c.type === type);

  if (tab === "my") {
    // Challenges I created or joined — no extra access-control needed
    const myParticipations = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.playerId, playerId),
    });
    const myIds = new Set([
      ...rows.filter(c => c.creatorId === playerId).map(c => c.id),
      ...myParticipations.map(p => p.challengeId),
    ]);
    rows = rows.filter(c => myIds.has(c.id));
  } else if (tab === "trending") {
    // Only public active challenges appear in trending
    rows = rows.filter(c => c.status === "active" && c.type === "public").slice(0, 20);
  } else if (tab === "nearby") {
    // City-scoped + public. City challenges are further filtered by access control below.
    rows = rows.filter(c => c.type === "city" || c.type === "public").slice(0, 20);
  } else if (tab === "friends") {
    // Friends tab only surfaces public challenges
    rows = rows.filter(c => c.type === "public").slice(0, 20);
  }

  // ── Access control: strip out non-public challenges the caller cannot see ──
  const challengeIds = rows.map(c => c.id);
  const ctx = await buildAccessContext(playerId, challengeIds);

  // Batch-load creator records (needed for guild / city checks)
  const creatorIds = [...new Set(rows.map(c => c.creatorId))];
  const creators = creatorIds.length
    ? await db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, creatorIds) })
    : [];
  const creatorMap = Object.fromEntries(creators.map(p => [p.id, p]));

  // Batch-load creator locations for city challenges
  const cityCreatorIds = [...new Set(rows.filter(c => c.type === "city").map(c => c.creatorId))];
  const creatorLocations = cityCreatorIds.length
    ? await db.query.playerLocationTable.findMany({ where: (t, { inArray }) => inArray(t.playerId, cityCreatorIds) })
    : [];
  const creatorLocationMap = Object.fromEntries(creatorLocations.map(l => [l.playerId, l]));

  const accessChecks = await Promise.all(rows.map(c =>
    canAccess(
      c,
      ctx,
      creatorMap[c.creatorId]?.clubId,
      creatorLocationMap[c.creatorId]?.city,
    )
  ));
  rows = rows.filter((_, i) => accessChecks[i]);

  // Enrich with participant count
  const enriched = await Promise.all(rows.map(async (c) => {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.challengeId, c.id));
    const myEntry = ctx.participatingIds.has(c.id);
    const creator = creatorMap[c.creatorId];
    return {
      ...c,
      startAt: c.startAt.toISOString(),
      endAt: c.endAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      participantCount: count ?? 0,
      isJoined: myEntry,
      creator: creator
        ? { id: creator.id, username: creator.username, displayName: creator.displayName, avatarUrl: creator.avatarUrl }
        : null,
    };
  }));

  res.json(enriched);
});

// ── Get challenge detail ───────────────────────────────────────────────────
router.get("/challenges/:id", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.challengesTable.findFirst({ where: eq(challengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  // Auto-finalize if expired
  if (challenge.status === "active" && new Date(challenge.endAt) < new Date()) {
    await finalizeChallenge(id);
  }

  // ── Access control ──────────────────────────────────────────────────────
  const playerId = req.playerId!;
  const ctx = await buildAccessContext(playerId, [id]);

  if (challenge.type !== "public") {
    let creatorClubId: number | null | undefined;
    let creatorCity: string | null | undefined;

    if (challenge.type === "guild") {
      const creator = await db.query.playersTable.findFirst({ where: eq(playersTable.id, challenge.creatorId) });
      creatorClubId = creator?.clubId;
    } else if (challenge.type === "city") {
      const creatorLocation = await db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, challenge.creatorId) });
      creatorCity = creatorLocation?.city;
    }

    const allowed = await canAccess(challenge, ctx, creatorClubId, creatorCity);
    if (!allowed) {
      res.status(403).json({ error: "You do not have access to this challenge" });
      return;
    }
  }

  const rawParticipants = await db.query.challengeParticipantsTable.findMany({
    where: eq(challengeParticipantsTable.challengeId, id),
    orderBy: [desc(challengeParticipantsTable.currentValue)],
  });

  // For elimination tournaments, eliminated players keep stale historical
  // values while survivors get reset each round — so a raw currentValue
  // sort would put losers above the champion. Order active players first
  // (by currentValue desc), then eliminated players grouped by latest
  // round eliminated (later eliminations rank higher), then by their last
  // recorded currentValue. For non-elimination challenges, the raw sort
  // is already correct.
  const participants = challenge.isElimination
    ? rankChallengeParticipants(rawParticipants)
    : rawParticipants;

  const playerIds = participants.map(p => p.playerId);
  const players = playerIds.length
    ? await db.query.playersTable.findMany({ where: inArray(playersTable.id, playerIds) })
    : [];
  const playerMap = new Map(players.map(p => [p.id, p]));

  const leaderboard = participants.map((p, i) => ({
    ...p,
    joinedAt: p.joinedAt.toISOString(),
    rank: p.rank ?? i + 1,
    player: playerMap.get(p.playerId)
      ? { id: playerMap.get(p.playerId)!.id, username: playerMap.get(p.playerId)!.username, displayName: playerMap.get(p.playerId)!.displayName, avatarUrl: playerMap.get(p.playerId)!.avatarUrl, level: playerMap.get(p.playerId)!.level }
      : null,
  }));

  const creator = await db.query.playersTable.findFirst({ where: eq(playersTable.id, challenge.creatorId) });

  res.json({
    ...challenge,
    startAt: challenge.startAt.toISOString(),
    endAt: challenge.endAt.toISOString(),
    createdAt: challenge.createdAt.toISOString(),
    leaderboard,
    participantCount: participants.length,
    creator: creator ? { id: creator.id, username: creator.username, displayName: creator.displayName, avatarUrl: creator.avatarUrl } : null,
    isJoined: ctx.participatingIds.has(id),
  });
});

// ── Create challenge ───────────────────────────────────────────────────────
router.post("/challenges", requireAuth, attachPlayer, async (req, res) => {
  const { title, description = "", metric, targetValue, durationDays, type = "public", rewardXp = 100, rewardCoins = 50, requiresPublicMeetup = false, maxParticipants = 100, isElimination = false } = req.body as {
    title: string; description?: string; metric: string; targetValue: number; durationDays: number;
    type?: string; rewardXp?: number; rewardCoins?: number; requiresPublicMeetup?: boolean;
    maxParticipants?: number; isElimination?: boolean;
  };

  if (!title || !metric || !targetValue || !durationDays) {
    res.status(400).json({ error: "title, metric, targetValue, durationDays are required" }); return;
  }

  // Content moderation
  if (containsFlaggedContent(title) || containsFlaggedContent(description)) {
    res.status(400).json({ error: "Challenge contains flagged content. Please revise your title or description." }); return;
  }

  // Safety: meetup challenges gate minors
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (requiresPublicMeetup && player?.isMinor) {
    res.status(403).json({ error: "Players under 18 cannot create challenges requiring physical meetups. Parental consent required." }); return;
  }

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const [challenge] = await db.insert(challengesTable).values({
    creatorId: req.playerId!,
    title: title.trim(),
    description: description.trim(),
    metric,
    targetValue,
    durationDays,
    type,
    status: "active",
    rewardXp,
    rewardCoins,
    requiresPublicMeetup,
    startAt,
    endAt,
    maxParticipants,
    isElimination,
  }).returning();

  // Auto-join creator
  await db.insert(challengeParticipantsTable).values({
    challengeId: challenge.id,
    playerId: req.playerId!,
    currentValue: 0,
  }).onConflictDoNothing();

  res.status(201).json({ ...challenge, startAt: challenge.startAt.toISOString(), endAt: challenge.endAt.toISOString(), createdAt: challenge.createdAt.toISOString() });
});

// ── Join challenge ─────────────────────────────────────────────────────────
router.post("/challenges/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.challengesTable.findFirst({ where: eq(challengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }
  if (challenge.status !== "active") { res.status(400).json({ error: "Challenge is not active" }); return; }
  if (new Date() > new Date(challenge.endAt)) { res.status(400).json({ error: "Challenge has ended" }); return; }

  const playerId = req.playerId!;

  const existing = await db.query.challengeParticipantsTable.findFirst({
    where: and(eq(challengeParticipantsTable.challengeId, id), eq(challengeParticipantsTable.playerId, playerId)),
  });
  if (existing) { res.status(400).json({ error: "Already joined" }); return; }

  // ── Type-specific authorization ─────────────────────────────────────────
  if (challenge.type === "private") {
    // Only players with a pending invite may join directly
    const invite = await db.query.challengeInvitesTable.findFirst({
      where: and(
        eq(challengeInvitesTable.challengeId, id),
        eq(challengeInvitesTable.inviteeId, playerId),
        eq(challengeInvitesTable.status, "pending"),
      ),
    });
    if (!invite) {
      res.status(403).json({ error: "This challenge is invite-only. You need an invitation to join." });
      return;
    }
  } else if (challenge.type === "guild") {
    // Only members of the creator's club may join
    const [player, creator] = await Promise.all([
      db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
      db.query.playersTable.findFirst({ where: eq(playersTable.id, challenge.creatorId) }),
    ]);
    if (!player?.clubId || !creator?.clubId || player.clubId !== creator.clubId) {
      res.status(403).json({ error: "This challenge is for club members only. You must be in the same club as the creator to join." });
      return;
    }
  } else if (challenge.type === "city") {
    // Only players in the same city as the creator may join.
    // The player's location record must also be established (not freshly set)
    // to prevent coordinate spoofing from granting immediate city access.
    const [playerLocation, creatorLocation] = await Promise.all([
      db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, playerId) }),
      db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, challenge.creatorId) }),
    ]);
    // Default-deny: both parties must have a known city and they must match,
    // and the player's location must have been stable for the minimum required period.
    if (!playerLocation?.city || !creatorLocation?.city || playerLocation.city !== creatorLocation.city) {
      res.status(403).json({ error: "This challenge is restricted to players in the same city." });
      return;
    }
    if (!isLocationEstablished(playerLocation)) {
      res.status(403).json({
        error: "location_not_established",
        message: "Your location must be stable for at least 1 hour before you can join city-scoped challenges.",
      });
      return;
    }
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(challengeParticipantsTable)
    .where(eq(challengeParticipantsTable.challengeId, id));
  if ((count ?? 0) >= challenge.maxParticipants) {
    res.status(400).json({ error: "Challenge is full" }); return;
  }

  const [participant] = await db.insert(challengeParticipantsTable).values({
    challengeId: id,
    playerId,
    currentValue: 0,
  }).returning();

  res.status(201).json({ ...participant, joinedAt: participant.joinedAt.toISOString() });
});

// ── Submit progress ────────────────────────────────────────────────────────
router.post("/challenges/:id/progress", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const { value } = req.body as { value: number };
  if (!id || value === undefined) { res.status(400).json({ error: "id and value required" }); return; }

  const challenge = await db.query.challengesTable.findFirst({ where: eq(challengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }
  if (challenge.status !== "active") { res.status(400).json({ error: "Challenge is not active" }); return; }

  const participant = await db.query.challengeParticipantsTable.findFirst({
    where: and(eq(challengeParticipantsTable.challengeId, id), eq(challengeParticipantsTable.playerId, req.playerId!)),
  });
  if (!participant) { res.status(404).json({ error: "Not a participant" }); return; }
  if (participant.eliminated) {
    res.status(403).json({ error: "You have been eliminated from this tournament" }); return;
  }

  const newValue = Math.max(0, (participant.currentValue ?? 0) + value);
  const [updated] = await db.update(challengeParticipantsTable)
    .set({ currentValue: newValue })
    .where(eq(challengeParticipantsTable.id, participant.id))
    .returning();

  res.json({ ...updated, joinedAt: updated.joinedAt.toISOString() });
});

// ── Report challenge ───────────────────────────────────────────────────────
router.post("/challenges/:id/report", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const { reason = "Inappropriate content" } = req.body as { reason?: string };
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const challenge = await db.query.challengesTable.findFirst({ where: eq(challengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

  await db.insert(userReportsTable).values({
    reporterId: req.playerId!,
    reportedUserId: challenge.creatorId,
    reason,
    contentType: "challenge",
    contentId: id,
    status: "open",
  });

  res.json({ success: true });
});

// ── Invite player to challenge ─────────────────────────────────────────────
router.post("/challenges/:id/invite", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const { inviteeId } = req.body as { inviteeId: number };
  if (!id || !inviteeId) { res.status(400).json({ error: "inviteeId required" }); return; }

  const challenge = await db.query.challengesTable.findFirst({ where: eq(challengesTable.id, id) });
  if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }
  if (challenge.creatorId !== req.playerId) { res.status(403).json({ error: "Only the creator can invite" }); return; }

  const invitee = await db.query.playersTable.findFirst({ where: eq(playersTable.id, inviteeId) });
  if (!invitee) { res.status(404).json({ error: "Invitee not found" }); return; }

  const [invite] = await db.insert(challengeInvitesTable).values({
    challengeId: id,
    inviteeId,
    inviterId: req.playerId!,
  }).onConflictDoNothing().returning();

  // Create an in-app notification for the invitee when a fresh invite was created.
  if (invite) {
    const inviter = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
    const inviterName = inviter?.displayName ?? inviter?.username ?? "A player";
    await db.insert(notificationsTable).values({
      playerId: inviteeId,
      type: "challenge_invite",
      title: "New challenge invite",
      body: `${inviterName} invited you to "${challenge.title}".`,
      link: "/challenges",
      sourceId: invite.id,
    });

    // Fire-and-forget push so the invitee hears about it even when offline.
    void sendPushToPlayer(inviteeId, {
      title: "New challenge invite",
      body: `${inviterName} invited you to "${challenge.title}".`,
      link: "/challenges",
      category: "invites",
      tag: `challenge-invite-${invite.id}`,
    });
  }

  res.status(201).json({ ...(invite ?? {}), sentAt: invite?.sentAt?.toISOString() });
});

// ── Respond to invite ──────────────────────────────────────────────────────
router.post("/challenge-invites/:id/respond", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: "accepted" | "declined" };
  if (!id || !status) { res.status(400).json({ error: "status required" }); return; }

  const invite = await db.query.challengeInvitesTable.findFirst({
    where: and(eq(challengeInvitesTable.id, id), eq(challengeInvitesTable.inviteeId, req.playerId!)),
  });
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
  if (invite.status !== "pending") {
    res.status(409).json({ error: "Invite already responded to" }); return;
  }

  if (status === "accepted") {
    // Re-validate all join conditions at acceptance time so a stale invite
    // cannot bypass current challenge state, capacity, or eligibility rules.
    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, invite.challengeId),
    });
    if (!challenge) { res.status(404).json({ error: "Challenge no longer exists" }); return; }
    if (challenge.status !== "active") { res.status(409).json({ error: "Challenge is not active" }); return; }
    if (new Date() > new Date(challenge.endAt)) { res.status(409).json({ error: "Challenge has ended" }); return; }

    const playerId = req.playerId!;

    if (challenge.type === "guild") {
      const [player, creator] = await Promise.all([
        db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
        db.query.playersTable.findFirst({ where: eq(playersTable.id, challenge.creatorId) }),
      ]);
      if (!player?.clubId || !creator?.clubId || player.clubId !== creator.clubId) {
        res.status(403).json({ error: "You must be in the same club as the challenge creator to join this guild challenge." });
        return;
      }
    } else if (challenge.type === "city") {
      const [playerLocation, creatorLocation] = await Promise.all([
        db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, playerId) }),
        db.query.playerLocationTable.findFirst({ where: eq(playerLocationTable.playerId, challenge.creatorId) }),
      ]);
      if (!playerLocation?.city || !creatorLocation?.city || playerLocation.city !== creatorLocation.city) {
        res.status(403).json({ error: "This challenge is restricted to players in the same city." });
        return;
      }
      if (!isLocationEstablished(playerLocation)) {
        res.status(403).json({
          error: "location_not_established",
          message: "Your location must be stable for at least 1 hour before you can join city-scoped challenges.",
        });
        return;
      }
    }

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.challengeId, invite.challengeId));
    if ((count ?? 0) >= challenge.maxParticipants) {
      res.status(409).json({ error: "Challenge is full" }); return;
    }
  }

  await db.update(challengeInvitesTable).set({ status }).where(eq(challengeInvitesTable.id, id));

  // Mark any related challenge_invite notification as read so the bell clears.
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(
      eq(notificationsTable.playerId, req.playerId!),
      eq(notificationsTable.type, "challenge_invite"),
      eq(notificationsTable.sourceId, id),
    ));

  if (status === "accepted") {
    await db.insert(challengeParticipantsTable).values({
      challengeId: invite.challengeId,
      playerId: req.playerId!,
      currentValue: 0,
    }).onConflictDoNothing();
  }

  res.json({ success: true, status });
});

// ── Get my invites ─────────────────────────────────────────────────────────
router.get("/challenge-invites", requireAuth, attachPlayer, async (req, res) => {
  const invites = await db.query.challengeInvitesTable.findMany({
    where: and(
      eq(challengeInvitesTable.inviteeId, req.playerId!),
      eq(challengeInvitesTable.status, "pending"),
    ),
    orderBy: [desc(challengeInvitesTable.sentAt)],
  });

  const enriched = await Promise.all(invites.map(async (inv) => {
    const challenge = await db.query.challengesTable.findFirst({ where: eq(challengesTable.id, inv.challengeId) });
    const inviter = await db.query.playersTable.findFirst({ where: eq(playersTable.id, inv.inviterId) });
    return {
      ...inv,
      sentAt: inv.sentAt.toISOString(),
      challenge: challenge ? { ...challenge, startAt: challenge.startAt.toISOString(), endAt: challenge.endAt.toISOString(), createdAt: challenge.createdAt.toISOString() } : null,
      inviter: inviter ? { id: inviter.id, displayName: inviter.displayName, avatarUrl: inviter.avatarUrl } : null,
    };
  }));

  res.json(enriched);
});

export default router;
