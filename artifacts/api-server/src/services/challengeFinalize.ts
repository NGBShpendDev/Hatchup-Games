// Finalize-flow orchestration for challenges. Extracted out of
// `routes/challenges.ts` so it can be exercised by integration tests
// without dragging in route-layer middleware (clerk auth, rate limiters,
// express helpers).
//
// The pieces wired here are:
//   - elimination round advance (delegates to `eliminationBracket` core)
//   - reward distribution      (delegates to `challengeRewards` core)
//   - completion push fan-out
//   - endingSoonPushSentAt reset on advance
//
// Pure rule logic lives in the two `*Core` services and is unit-tested with
// in-memory stores. This module owns the DB-backed adapters and the IO
// side effects (push notifications, in-app notifications).

import { db } from "@workspace/db";
import {
  challengesTable,
  challengeParticipantsTable,
  playersTable,
  notificationsTable,
  artifactsTable,
  playerArtifactsTable,
} from "@workspace/db";
import { eq, desc, and, gt, lt, sql, inArray } from "drizzle-orm";
import { awardBadge } from "./badgeService.ts";
import {
  distributeChallengeRewards,
  type RewardStore,
} from "./challengeRewards.ts";
import {
  advanceEliminationRound as advanceEliminationRoundCore,
  type AdvanceOutcome,
  type EliminationStore,
} from "./eliminationBracket.ts";
import { sendPushToPlayer } from "./pushNotifications.ts";
import { isEmailConfigured, sendTransactionalEmail } from "./emailService.ts";
import { logger } from "../lib/logger.ts";

// ── Elimination round advancement ──────────────────────────────────────────
const dbEliminationStore: EliminationStore = {
  async getChallenge(id) {
    const c = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!c) return null;
    return {
      id: c.id,
      isElimination: c.isElimination,
      currentRound: c.currentRound,
      durationDays: c.durationDays,
      status: c.status,
    };
  },
  async getActiveParticipants(challengeId) {
    const rows = await db.query.challengeParticipantsTable.findMany({
      where: and(
        eq(challengeParticipantsTable.challengeId, challengeId),
        eq(challengeParticipantsTable.eliminated, false),
      ),
      orderBy: [desc(challengeParticipantsTable.currentValue)],
    });
    return rows.map(p => ({ id: p.id, currentValue: p.currentValue }));
  },
  async markEliminated(ids, eliminatedRound) {
    await db.update(challengeParticipantsTable)
      .set({ eliminated: true, eliminatedRound })
      .where(inArray(challengeParticipantsTable.id, ids));
  },
  async resetSurvivorProgress(ids) {
    await db.update(challengeParticipantsTable)
      .set({ currentValue: 0 })
      .where(inArray(challengeParticipantsTable.id, ids));
  },
  async updateChallengeRound(id, nextRound, nextEndAt) {
    await db.update(challengesTable)
      .set({ currentRound: nextRound, endAt: nextEndAt })
      .where(eq(challengesTable.id, id));
  },
};

async function playerIdsForParticipantIds(participantIds: number[]): Promise<number[]> {
  if (participantIds.length === 0) return [];
  const rows = await db.query.challengeParticipantsTable.findMany({
    where: inArray(challengeParticipantsTable.id, participantIds),
    columns: { playerId: true },
  });
  return rows.map(r => r.playerId);
}

async function advanceEliminationRound(challengeId: number): Promise<AdvanceOutcome> {
  const outcome = await advanceEliminationRoundCore(dbEliminationStore, challengeId);
  if (outcome.kind === "noop") return outcome;

  const challenge = await db.query.challengesTable.findFirst({
    where: eq(challengesTable.id, challengeId),
  });
  if (!challenge) return outcome;
  const link = `/challenges/${challengeId}`;
  const title = challenge.title;

  // Notify eliminated participants (fires for both "champion" and "advance").
  if (outcome.eliminatedParticipantIds.length > 0) {
    const eliminatedPlayerIds = await playerIdsForParticipantIds(outcome.eliminatedParticipantIds);
    const eliminatedRound = outcome.eliminatedRound;
    const rows = eliminatedPlayerIds.map(playerId => ({
      playerId,
      type: "tournament_eliminated",
      title: `Eliminated in round ${eliminatedRound}`,
      body: `You were eliminated from "${title}" in round ${eliminatedRound}. Better luck next time!`,
      link,
      sourceId: challengeId,
    }));
    if (rows.length > 0) await db.insert(notificationsTable).values(rows);
  }

  // Notify survivors that they advanced to the next round.
  if (outcome.kind === "advance" && outcome.survivorParticipantIds.length > 0) {
    const survivorPlayerIds = await playerIdsForParticipantIds(outcome.survivorParticipantIds);
    const nextRound = outcome.nextRound;
    const rows = survivorPlayerIds.map(playerId => ({
      playerId,
      type: "tournament_advanced",
      title: `Advanced to round ${nextRound}`,
      body: `You advanced to round ${nextRound} of "${title}". Keep going!`,
      link,
      sourceId: challengeId,
    }));
    if (rows.length > 0) await db.insert(notificationsTable).values(rows);
  }

  return outcome;
}

// ── Ending-soon push fan-out ───────────────────────────────────────────────
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

// ── Champion cosmetic artifact ─────────────────────────────────────────────
const CHAMPION_ARTIFACT_SLUG = "crown_of_the_bracket";
const CHAMPION_ARTIFACT_NAME = "Crown of the Bracket";

async function awardChampionArtifact(playerId: number): Promise<void> {
  let artifact = await db.query.artifactsTable.findFirst({
    where: eq(artifactsTable.imageSlug, CHAMPION_ARTIFACT_SLUG),
  });

  if (!artifact) {
    const [inserted] = await db.insert(artifactsTable).values({
      name: CHAMPION_ARTIFACT_NAME,
      lore: "Forged from the shattered hopes of every contender you outlasted. Worn only by tournament champions.",
      rarity: "Legendary",
      type: "special",
      imageSlug: CHAMPION_ARTIFACT_SLUG,
      isHidden: true,
      abilities: [
        { name: "Champion's Aura", description: "+25% XP from competitive activities", value: 25 },
        { name: "Bracket Tactician", description: "+10% coins from challenge rewards", value: 10 },
      ],
      triggerKey: null,
      triggerValue: null,
    }).onConflictDoNothing({ target: artifactsTable.name }).returning();

    artifact = inserted ?? await db.query.artifactsTable.findFirst({
      where: eq(artifactsTable.imageSlug, CHAMPION_ARTIFACT_SLUG),
    });
  }

  if (!artifact) return;

  await db.insert(playerArtifactsTable).values({
    playerId,
    artifactId: artifact.id,
  }).onConflictDoNothing();
}

// ── Reward distribution helper ─────────────────────────────────────────────
const dbRewardStore: RewardStore = {
  async getChallenge(id) {
    const c = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, id),
    });
    if (!c) return null;
    return {
      id: c.id,
      status: c.status,
      endAt: new Date(c.endAt),
      isElimination: c.isElimination,
      rewardXp: c.rewardXp,
      rewardCoins: c.rewardCoins,
    };
  },
  async getParticipants(challengeId) {
    const rows = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.challengeId, challengeId),
    });
    return rows.map(r => ({
      id: r.id,
      playerId: r.playerId,
      currentValue: r.currentValue,
      eliminated: r.eliminated,
      eliminatedRound: r.eliminatedRound,
    }));
  },
  async setParticipantRank(participantId, rank) {
    await db.update(challengeParticipantsTable)
      .set({ rank })
      .where(eq(challengeParticipantsTable.id, participantId));
  },
  async grantPlayerReward(playerId, xp, coins) {
    await db.update(playersTable)
      .set({
        xp: sql`${playersTable.xp} + ${xp}`,
        coins: sql`${playersTable.coins} + ${coins}`,
      })
      .where(eq(playersTable.id, playerId));
  },
  async awardChampion(playerId) {
    await awardBadge(playerId, "TOURNAMENT_CHAMPION");
    await awardChampionArtifact(playerId);
  },
  async markCompleted(challengeId) {
    await db.update(challengesTable)
      .set({ status: "completed", completedPushSentAt: new Date() })
      .where(eq(challengesTable.id, challengeId));
  },
};

export async function finalizeChallenge(challengeId: number) {
  const challenge = await db.query.challengesTable.findFirst({
    where: eq(challengesTable.id, challengeId),
  });
  if (!challenge || challenge.status !== "active") return;
  if (new Date() < new Date(challenge.endAt)) return;

  // For elimination tournaments, try to advance to the next round instead of
  // finalizing. If a new round started, leave the challenge active.
  if (challenge.isElimination) {
    const advanceOutcome = await advanceEliminationRound(challengeId);
    if (advanceOutcome.kind === "advance") {
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

  const outcome = await distributeChallengeRewards(dbRewardStore, challengeId);
  if (outcome.kind !== "completed") return;

  // Fan out a "challenge complete" push to every participant (active or
  // eliminated) so they can see their final rank. The tournament champion
  // (if any) gets a dedicated champion notification instead, so we skip
  // them here to avoid sending two pushes for the same event.
  if (!challenge.completedPushSentAt) {
    const championPlayerId = outcome.rankings.find(r => r.grant.isChampion)?.playerId ?? null;

    const allParticipants = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.challengeId, challengeId),
      columns: { playerId: true },
    });
    for (const p of allParticipants) {
      if (p.playerId === championPlayerId) continue;
      void sendPushToPlayer(p.playerId, {
        title: "Challenge complete!",
        body: `"${challenge.title}" wrapped up — tap to see your final rank.`,
        link: `/challenges/${challengeId}`,
        category: "completed",
        tag: `challenge-complete-${challengeId}`,
      });
    }

    if (championPlayerId !== null) {
      void notifyTournamentChampion(championPlayerId, challengeId, challenge.title);
    }
  }
}

// ── Tournament champion notification ───────────────────────────────────────
// When an elimination tournament finalizes, the rank-1 survivor gets a
// dedicated celebratory notification on top of the in-app reward feedback.
// Fires exactly once per challenge because it lives inside the
// `!completedPushSentAt` gate in `finalizeChallenge` (markCompleted flips
// that flag as part of reward distribution). Honors existing opt-in prefs:
// push respects `notifyCompletedPush`, email respects `notifyChampionEmail`
// and only fires when the player has an email on file and an email
// provider is configured.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function notifyTournamentChampion(
  playerId: number,
  challengeId: number,
  challengeTitle: string,
): Promise<void> {
  const link = `/challenges/${challengeId}`;
  const title = `You won ${challengeTitle}!`;
  const body = `Champion of "${challengeTitle}" — claim your XP, coins, badge, and the Crown of the Bracket.`;

  try {
    await db.insert(notificationsTable).values({
      playerId,
      type: "tournament_champion",
      title,
      body,
      link,
      sourceId: challengeId,
    });
  } catch (err) {
    logger.warn({ err, playerId, challengeId }, "tournament_champion notification insert failed");
  }

  void sendPushToPlayer(playerId, {
    title: `🏆 ${title}`,
    body,
    link,
    category: "completed",
    tag: `tournament-champion-${challengeId}`,
  });

  if (!isEmailConfigured()) return;

  try {
    const player = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, playerId),
      columns: {
        email: true,
        notifyChampionEmail: true,
        displayName: true,
        username: true,
      },
    });
    if (!player || !player.email || !player.notifyChampionEmail) return;

    const name = player.displayName ?? player.username;
    const safeTitle = escapeHtml(challengeTitle);
    const safeName = escapeHtml(name);
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
        <h1 style="font-size:24px;margin:0 0 16px;">🏆 You won ${safeTitle}!</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Congrats, ${safeName} — you outlasted every contender and claimed the bracket.</p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Your rewards are waiting: bonus XP &amp; coins, the Tournament Champion badge, and the legendary <strong>Crown of the Bracket</strong> artifact.</p>
        <p style="margin:24px 0;"><a href="${link}" style="background:#ec4899;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View your win</a></p>
        <p style="font-size:12px;color:#666;">You're receiving this because you have HATCHUP email notifications enabled.</p>
      </div>
    `;
    const subject = `🏆 You won ${challengeTitle}!`;
    await sendTransactionalEmail({
      to: player.email,
      subject,
      html,
      text: `You won ${challengeTitle}! Claim your XP, coins, Tournament Champion badge, and the Crown of the Bracket: ${link}`,
    });
  } catch (err) {
    logger.warn({ err, playerId, challengeId }, "tournament_champion email step failed");
  }
}
