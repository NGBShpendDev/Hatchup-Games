import { Router } from "express";
import { db } from "@workspace/db";
import {
  challengesTable,
  challengeParticipantsTable,
  challengeInvitesTable,
  playersTable,
  userReportsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { sendPushToPlayer } from "../services/pushNotifications.ts";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
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

// ── Finalize / advance / push wiring lives in `services/challengeFinalize.ts`.
// The route layer just calls `finalizeChallenge(id)` on expired challenges.

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
    // Challenges I created or joined
    const myParticipations = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.playerId, playerId),
    });
    const myIds = new Set([
      ...rows.filter(c => c.creatorId === playerId).map(c => c.id),
      ...myParticipations.map(p => p.challengeId),
    ]);
    rows = rows.filter(c => myIds.has(c.id));
  } else if (tab === "trending") {
    rows = rows.filter(c => c.status === "active").slice(0, 20);
  } else if (tab === "nearby") {
    rows = rows.filter(c => c.type === "city" || c.type === "public").slice(0, 20);
  } else if (tab === "friends") {
    rows = rows.filter(c => c.type === "public" || c.type === "private").slice(0, 20);
  }

  // Batch-load creators
  const creatorIds = [...new Set(rows.map(c => c.creatorId))];
  const creators = creatorIds.length
    ? await db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, creatorIds) })
    : [];
  const creatorMap = Object.fromEntries(creators.map(p => [p.id, p]));

  // Enrich with participant count
  const enriched = await Promise.all(rows.map(async (c) => {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.challengeId, c.id));
    const myEntry = await db.query.challengeParticipantsTable.findFirst({
      where: and(eq(challengeParticipantsTable.challengeId, c.id), eq(challengeParticipantsTable.playerId, playerId)),
    });
    const creator = creatorMap[c.creatorId];
    return {
      ...c,
      startAt: c.startAt.toISOString(),
      endAt: c.endAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      participantCount: count ?? 0,
      isJoined: !!myEntry,
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
    isJoined: participants.some(p => p.playerId === req.playerId),
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

  const existing = await db.query.challengeParticipantsTable.findFirst({
    where: and(eq(challengeParticipantsTable.challengeId, id), eq(challengeParticipantsTable.playerId, req.playerId!)),
  });
  if (existing) { res.status(400).json({ error: "Already joined" }); return; }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(challengeParticipantsTable)
    .where(eq(challengeParticipantsTable.challengeId, id));
  if ((count ?? 0) >= challenge.maxParticipants) {
    res.status(400).json({ error: "Challenge is full" }); return;
  }

  const [participant] = await db.insert(challengeParticipantsTable).values({
    challengeId: id,
    playerId: req.playerId!,
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
