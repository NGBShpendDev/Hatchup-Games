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
import { eq, desc, and, gt, lt, sql, inArray } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { awardBadge } from "../services/badgeService";
import { computeChallengeReward } from "../services/challengeRewards";
import { planEliminationRound } from "../services/eliminationBracket";
import { sendPushToPlayer } from "../services/pushNotifications";

const router = Router();

// ── Profanity / keyword filter ─────────────────────────────────────────────
const BAD_WORDS = ["hate", "stupid", "idiot", "loser", "dumb", "kill", "die", "nude", "nsfw"];
function containsFlaggedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w));
}

// ── Elimination round advancement ──────────────────────────────────────────
// For elimination tournaments: when the current round window expires, sort
// active participants by progress, eliminate the bottom half, reset progress
// for the survivors, increment currentRound, and extend endAt by another
// durationDays window. Returns true if a new round was started (challenge
// should stay active), false if the bracket has resolved to ≤1 survivor and
// the caller should finalize normally.
async function advanceEliminationRound(challengeId: number): Promise<boolean> {
  const challenge = await db.query.challengesTable.findFirst({
    where: eq(challengesTable.id, challengeId),
  });
  if (!challenge || !challenge.isElimination) return false;

  const active = await db.query.challengeParticipantsTable.findMany({
    where: and(
      eq(challengeParticipantsTable.challengeId, challengeId),
      eq(challengeParticipantsTable.eliminated, false),
    ),
    orderBy: [desc(challengeParticipantsTable.currentValue)],
  });

  const plan = planEliminationRound(
    { currentRound: challenge.currentRound, durationDays: challenge.durationDays },
    active.map(p => ({ id: p.id, currentValue: p.currentValue })),
  );

  if (plan.kind === "noop") return false;

  const participantPlayer = new Map(active.map(p => [p.id, p.playerId]));
  const link = `/challenges/${challengeId}`;
  const title = challenge.title;

  if (plan.eliminatedIds.length > 0) {
    await db.update(challengeParticipantsTable)
      .set({ eliminated: true, eliminatedRound: plan.eliminatedRound })
      .where(inArray(challengeParticipantsTable.id, plan.eliminatedIds));

    const eliminatedRound = plan.eliminatedRound;
    const rows = plan.eliminatedIds
      .map(pid => participantPlayer.get(pid))
      .filter((id): id is number => typeof id === "number")
      .map(playerId => ({
        playerId,
        type: "tournament_eliminated",
        title: `Eliminated in round ${eliminatedRound}`,
        body: `You were eliminated from "${title}" in round ${eliminatedRound}. Better luck next time!`,
        link,
        sourceId: challengeId,
      }));
    if (rows.length > 0) await db.insert(notificationsTable).values(rows);
  }

  // If only one survivor remains, the bracket is resolved — let the caller
  // run normal finalization (ranking + reward payout) for the champion.
  // Do NOT reset their progress or extend the timer.
  if (plan.kind === "champion") return false;

  // Reset survivor progress so the next round is a fresh race.
  await db.update(challengeParticipantsTable)
    .set({ currentValue: 0 })
    .where(inArray(challengeParticipantsTable.id, plan.survivorIds));

  // Extend the challenge window by another durationDays for the next round.
  await db.update(challengesTable)
    .set({ currentRound: plan.nextRound, endAt: plan.nextEndAt })
    .where(eq(challengesTable.id, challengeId));

  // Notify survivors that they advanced to the next round.
  const advancedRows = plan.survivorIds
    .map(pid => participantPlayer.get(pid))
    .filter((id): id is number => typeof id === "number")
    .map(playerId => ({
      playerId,
      type: "tournament_advanced",
      title: `Advanced to round ${plan.nextRound}`,
      body: `You advanced to round ${plan.nextRound} of "${title}". Keep going!`,
      link,
      sourceId: challengeId,
    }));
  if (advancedRows.length > 0) await db.insert(notificationsTable).values(advancedRows);

  return true;
}

// ── Ending-soon push fan-out ───────────────────────────────────────────────
// Scans active challenges whose end is within the next 24h and sends a push to
// each joined, active participant who hasn't received one yet for this round.
// Per-participant `endingSoonPushSentAt` makes it idempotent across cron ticks
// and resets naturally each elimination round when participants advance.
export async function sendEndingSoonPushes(): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const active = await db.query.challengesTable.findMany({
    where: and(
      eq(challengesTable.status, "active"),
      gt(challengesTable.endAt, now),
      lt(challengesTable.endAt, horizon),
    ),
  });

  for (const challenge of active) {
    const participants = await db.query.challengeParticipantsTable.findMany({
      where: and(
        eq(challengeParticipantsTable.challengeId, challenge.id),
        eq(challengeParticipantsTable.eliminated, false),
      ),
    });

    const msLeft = new Date(challenge.endAt).getTime() - now.getTime();
    const hoursLeft = Math.max(1, Math.round(msLeft / 3_600_000));

    for (const p of participants) {
      if (p.endingSoonPushSentAt) continue;
      await db.update(challengeParticipantsTable)
        .set({ endingSoonPushSentAt: now })
        .where(eq(challengeParticipantsTable.id, p.id));

      void sendPushToPlayer(p.playerId, {
        title: "Challenge ending soon",
        body: `"${challenge.title}" ends in ~${hoursLeft}h. Push for the podium!`,
        link: `/challenges/${challenge.id}`,
        category: "endingSoon",
        tag: `challenge-ending-${challenge.id}`,
      });
    }
  }
}

// ── Reward distribution helper ─────────────────────────────────────────────
async function finalizeChallenge(challengeId: number) {
  const challenge = await db.query.challengesTable.findFirst({
    where: eq(challengesTable.id, challengeId),
  });
  if (!challenge || challenge.status !== "active") return;
  if (new Date() < new Date(challenge.endAt)) return;

  // For elimination tournaments, try to advance to the next round instead of
  // finalizing. If a new round started, leave the challenge active.
  if (challenge.isElimination) {
    const advanced = await advanceEliminationRound(challengeId);
    if (advanced) {
      // Survivors begin a fresh round — reset their ending-soon flag so they
      // can receive a new push when the next deadline approaches.
      await db.update(challengeParticipantsTable)
        .set({ endingSoonPushSentAt: null })
        .where(and(
          eq(challengeParticipantsTable.challengeId, challengeId),
          eq(challengeParticipantsTable.eliminated, false),
        ));
      return;
    }
  }

  // Rank participants by currentValue desc
  const participants = await db.query.challengeParticipantsTable.findMany({
    where: and(
      eq(challengeParticipantsTable.challengeId, challengeId),
      eq(challengeParticipantsTable.eliminated, false),
    ),
    orderBy: [desc(challengeParticipantsTable.currentValue)],
  });

  for (let i = 0; i < participants.length; i++) {
    const rank = i + 1;
    await db.update(challengeParticipantsTable)
      .set({ rank })
      .where(eq(challengeParticipantsTable.id, participants[i].id));

    // Grant rewards to top 3. Elimination tournament champions (sole
    // survivor at rank 1) get a 2× boost on top of normal first-place pay
    // and a Tournament Champion badge that surfaces on their profile.
    if (rank <= 3) {
      const grant = computeChallengeReward(rank, challenge.rewardXp, challenge.rewardCoins, challenge.isElimination);
      if (grant.xp > 0 || grant.coins > 0) {
        await db.update(playersTable)
          .set({
            xp: sql`${playersTable.xp} + ${grant.xp}`,
            coins: sql`${playersTable.coins} + ${grant.coins}`,
          })
          .where(eq(playersTable.id, participants[i].playerId));
      }
      if (grant.isChampion) {
        await awardBadge(participants[i].playerId, "TOURNAMENT_CHAMPION");
      }
    }
  }

  await db.update(challengesTable)
    .set({ status: "completed", completedPushSentAt: new Date() })
    .where(eq(challengesTable.id, challengeId));

  // Fan out a "challenge complete" push to every participant (active or
  // eliminated) so they can see their final rank.
  if (!challenge.completedPushSentAt) {
    const allParticipants = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.challengeId, challengeId),
      columns: { playerId: true },
    });
    for (const p of allParticipants) {
      void sendPushToPlayer(p.playerId, {
        title: "Challenge complete!",
        body: `"${challenge.title}" wrapped up — tap to see your final rank.`,
        link: `/challenges/${challengeId}`,
        category: "completed",
        tag: `challenge-complete-${challengeId}`,
      });
    }
  }
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

  // Enrich with participant count
  const enriched = await Promise.all(rows.map(async (c) => {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(challengeParticipantsTable)
      .where(eq(challengeParticipantsTable.challengeId, c.id));
    const myEntry = await db.query.challengeParticipantsTable.findFirst({
      where: and(eq(challengeParticipantsTable.challengeId, c.id), eq(challengeParticipantsTable.playerId, playerId)),
    });
    return {
      ...c,
      startAt: c.startAt.toISOString(),
      endAt: c.endAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      participantCount: count ?? 0,
      isJoined: !!myEntry,
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
    ? [...rawParticipants].sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        if (a.eliminated && b.eliminated) {
          const ar = a.eliminatedRound ?? 0;
          const br = b.eliminatedRound ?? 0;
          if (ar !== br) return br - ar;
        }
        if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
        return (b.currentValue ?? 0) - (a.currentValue ?? 0);
      })
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
    return {
      ...inv,
      sentAt: inv.sentAt.toISOString(),
      challenge: challenge ? { ...challenge, startAt: challenge.startAt.toISOString(), endAt: challenge.endAt.toISOString(), createdAt: challenge.createdAt.toISOString() } : null,
    };
  }));

  res.json(enriched);
});

export default router;
