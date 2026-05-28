import { Router } from "express";
import { db } from "@workspace/db";
import {
  groupsTable,
  groupMembersTable,
  groupChallengesTable,
  groupRaidsTable,
  groupMessagesTable,
  groupNotificationMutesTable,
  notificationsTable,
  playersTable,
} from "@workspace/db";
import { eq, and, desc, sql, notInArray, inArray } from "drizzle-orm";
import { filterDiscoverableCandidates, getHiddenPlayerIds } from "./safety.ts";
import {
  CreateGroupBody,
  JoinGroupBody,
  LogGroupWorkoutBody,
  SendGroupMessageBody,
  GetGroupParams,
  ListMyGroupsQueryParams,
} from "@workspace/api-zod";
import { logFitnessActivity } from "../services/fitnessLog.ts";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { blockMinorSocialWrite } from "../middlewares/minorGuard.ts";
import { blockSuspendedSocialWrite } from "../middlewares/suspendedGuard.ts";
import { resolveMentionedPlayers } from "../services/mentions.ts";
import { socialChannelsForPlayers } from "../services/socialNotifyPrefs.ts";
import { sendPushToPlayer } from "../services/pushNotifications.ts";
import { sendSocialEmail } from "../services/socialEmail.ts";

const router = Router();

const RAID_ENERGY_THRESHOLD = 500;
const BOSS_NAMES = [
  "The Sloth King",
  "Baron Couch Potato",
  "The Procrastination Dragon",
  "General Lazybones",
  "The Snack Specter",
];

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function getXpBonus(memberCount: number): number {
  if (memberCount >= 6) return 0.5;
  if (memberCount >= 4) return 0.25;
  if (memberCount >= 2) return 0.1;
  return 0;
}

function basicProfanityFilter(text: string): { content: string; isFiltered: boolean } {
  const badWords = ["hate", "stupid", "idiot", "loser", "dumb"];
  let filtered = text;
  let isFiltered = false;
  for (const word of badWords) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    if (re.test(filtered)) {
      filtered = filtered.replace(re, "***");
      isFiltered = true;
    }
  }
  return { content: filtered, isFiltered };
}

async function checkMembership(groupId: number, playerId: number): Promise<boolean> {
  const member = await db.query.groupMembersTable.findFirst({
    where: and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.playerId, playerId)),
  });
  return !!member;
}

function formatChallenge(c: { id: number; groupId: number; title: string; description: string | null; targetValue: number; currentValue: number; rewardType: string | null; rewardAmount: number | null; isCompleted: boolean; createdAt: Date; expiresAt: Date }) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    progressPct: Math.min(100, Math.round((c.currentValue / c.targetValue) * 100)),
  };
}

async function advanceChallenges(groupId: number, progressValue: number) {
  const activeChallenges = await db.query.groupChallengesTable.findMany({
    where: and(eq(groupChallengesTable.groupId, groupId), eq(groupChallengesTable.isCompleted, false)),
  });
  let challengesAdvanced = 0;
  const updated: ReturnType<typeof formatChallenge>[] = [];
  for (const challenge of activeChallenges) {
    const newValue = challenge.currentValue + progressValue;
    const completed = newValue >= challenge.targetValue;
    const [upd] = await db.update(groupChallengesTable)
      .set({ currentValue: Math.min(newValue, challenge.targetValue), isCompleted: completed })
      .where(eq(groupChallengesTable.id, challenge.id))
      .returning();
    if (completed) challengesAdvanced++;
    updated.push(formatChallenge(upd));
  }
  return { challengesAdvanced, challenges: updated };
}

async function dealRaidDamage(groupId: number, damage: number) {
  const activeRaid = await db.query.groupRaidsTable.findFirst({
    where: and(eq(groupRaidsTable.groupId, groupId), eq(groupRaidsTable.status, "active")),
  });
  if (!activeRaid) return { raidDamage: 0, raid: null };

  const newDamage = activeRaid.currentDamage + damage;
  const defeated = newDamage >= activeRaid.bossHp;
  const [updatedRaid] = await db.update(groupRaidsTable)
    .set({ currentDamage: Math.min(newDamage, activeRaid.bossHp), status: defeated ? "defeated" : "active" })
    .where(eq(groupRaidsTable.id, activeRaid.id))
    .returning();
  return {
    raidDamage: damage,
    raid: {
      ...updatedRaid,
      createdAt: updatedRaid.createdAt.toISOString(),
      unlockedAt: updatedRaid.unlockedAt.toISOString(),
      hpPct: Math.max(0, Math.round(((updatedRaid.bossHp - updatedRaid.currentDamage) / updatedRaid.bossHp) * 100)),
    },
  };
}

// GET /groups/mine
router.get("/groups/mine", requireAuth, attachPlayer, async (req, res) => {
  if (req.query.playerId && Number(req.query.playerId) !== req.playerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Canonical people-discovery filter (see safety.ts): drop groups whose
  // creator is block-listed (either direction), visibility=hidden, or a minor.
  const viewerId = req.playerId!;

  const memberships = await db.query.groupMembersTable.findMany({
    where: eq(groupMembersTable.playerId, viewerId),
  });
  const groupIds = memberships.map(m => m.groupId);
  if (groupIds.length === 0) { res.json([]); return; }

  const allGroups = await db.query.groupsTable.findMany({
    where: sql`${groupsTable.id} = ANY(${sql.raw(`ARRAY[${groupIds.join(",")}]`)})`,
  });
  const creatorIds = Array.from(new Set(allGroups.map(g => g.creatorPlayerId)));
  const creatorRows = creatorIds.length
    ? await db.query.playersTable.findMany({
        where: inArray(playersTable.id, creatorIds),
      })
    : [];
  const allowedCreators = new Set(
    (await filterDiscoverableCandidates(viewerId, creatorRows)).map(p => p.id),
  );
  const groups = allGroups.filter(g => allowedCreators.has(g.creatorPlayerId));

  const result = await Promise.all(groups.map(async (g) => {
    const members = await db.query.groupMembersTable.findMany({ where: eq(groupMembersTable.groupId, g.id) });
    const challenges = await db.query.groupChallengesTable.findMany({ where: and(eq(groupChallengesTable.groupId, g.id), eq(groupChallengesTable.isCompleted, false)) });
    const raid = await db.query.groupRaidsTable.findFirst({ where: and(eq(groupRaidsTable.groupId, g.id), eq(groupRaidsTable.status, "active")) });
    return {
      ...g, createdAt: g.createdAt.toISOString(), memberCount: members.length,
      activeChallenges: challenges.length, hasActiveRaid: !!raid,
    };
  }));

  res.json(result);
});

// POST /groups
router.post("/groups", requireAuth, attachPlayer, async (req, res) => {
  const body = CreateGroupBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (body.data.creatorPlayerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const inviteCode = generateInviteCode();
  const [group] = await db.insert(groupsTable).values({
    name: body.data.name,
    type: body.data.type ?? "fitness_party",
    inviteCode,
    creatorPlayerId: req.playerId!,
    maxMembers: body.data.maxMembers ?? 10,
  }).returning();

  await db.insert(groupMembersTable).values({ groupId: group.id, playerId: req.playerId! });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(groupChallengesTable).values({
    groupId: group.id,
    title: "First Steps Together",
    description: "Log 10,000 group steps this week",
    targetValue: 10000,
    rewardType: "bonus_eggs",
    rewardAmount: 2,
    expiresAt,
  });

  res.status(201).json({
    ...group, createdAt: group.createdAt.toISOString(),
    memberCount: 1, activeChallenges: 1, hasActiveRaid: false,
  });
});

// POST /groups/join-by-code — join without knowing the group ID
router.post("/groups/join-by-code", requireAuth, attachPlayer, async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) { res.status(400).json({ error: "inviteCode required" }); return; }

  const group = await db.query.groupsTable.findFirst({ where: eq(groupsTable.inviteCode, String(inviteCode).toUpperCase()) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const existing = await db.query.groupMembersTable.findFirst({
    where: and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.playerId, req.playerId!)),
  });
  if (existing) { res.status(409).json({ error: "Already a member" }); return; }

  const members = await db.query.groupMembersTable.findMany({ where: eq(groupMembersTable.groupId, group.id) });
  if (members.length >= group.maxMembers) { res.status(400).json({ error: "Group is full" }); return; }

  // Enforce workout approval: if the group creator requires manual approval, block auto-join
  const creator = await db.query.playersTable.findFirst({ where: eq(playersTable.id, group.creatorPlayerId) });
  if (creator?.requireWorkoutApproval) {
    res.status(403).json({ error: "This group requires the creator's approval before joining. Please contact the group leader directly." });
    return;
  }

  await db.insert(groupMembersTable).values({ groupId: group.id, playerId: req.playerId! });

  const challenges = await db.query.groupChallengesTable.findMany({ where: and(eq(groupChallengesTable.groupId, group.id), eq(groupChallengesTable.isCompleted, false)) });
  const raid = await db.query.groupRaidsTable.findFirst({ where: and(eq(groupRaidsTable.groupId, group.id), eq(groupRaidsTable.status, "active")) });

  res.json({
    ...group, createdAt: group.createdAt.toISOString(),
    memberCount: members.length + 1, activeChallenges: challenges.length, hasActiveRaid: !!raid,
  });
});

// GET /groups/:id — membership required via playerId query param
router.get("/groups/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const group = await db.query.groupsTable.findFirst({ where: eq(groupsTable.id, params.data.id) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const isMember = await checkMembership(params.data.id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  // Canonical people-discovery filter (see safety.ts): drop members who are
  // block-listed (either direction), visibility=hidden, or minor accounts.
  const rawMembers = await db.query.groupMembersTable.findMany({ where: eq(groupMembersTable.groupId, group.id) });
  const memberIds = Array.from(new Set(rawMembers.map(m => m.playerId)));
  const memberPlayerRows = memberIds.length
    ? await db.query.playersTable.findMany({
        where: inArray(playersTable.id, memberIds),
      })
    : [];
  const allowedMemberIds = new Set(
    (await filterDiscoverableCandidates(req.playerId!, memberPlayerRows)).map(p => p.id),
  );
  // Always keep the viewer themselves in their own group view.
  allowedMemberIds.add(req.playerId!);
  const members = rawMembers.filter(m => allowedMemberIds.has(m.playerId));
  const challenges = await db.query.groupChallengesTable.findMany({ where: eq(groupChallengesTable.groupId, group.id) });
  const raid = await db.query.groupRaidsTable.findFirst({ where: eq(groupRaidsTable.groupId, group.id) });

  const memberDetails = await Promise.all(members.map(async (m) => {
    const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, m.playerId) });
    return {
      ...m,
      joinedAt: m.joinedAt.toISOString(),
      lastWorkoutTogether: m.lastWorkoutTogether?.toISOString() ?? null,
      username: player?.username ?? "Trainer",
      displayName: player?.displayName ?? null,
    };
  }));

  res.json({
    ...group,
    createdAt: group.createdAt.toISOString(),
    memberCount: members.length,
    members: memberDetails,
    challenges: challenges.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      progressPct: Math.min(100, Math.round((c.currentValue / c.targetValue) * 100)),
    })),
    raid: raid ? {
      ...raid,
      createdAt: raid.createdAt.toISOString(),
      unlockedAt: raid.unlockedAt.toISOString(),
      hpPct: Math.max(0, Math.round(((raid.bossHp - raid.currentDamage) / raid.bossHp) * 100)),
    } : null,
  });
});

// POST /groups/:id/join
router.post("/groups/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = JoinGroupBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (body.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const group = await db.query.groupsTable.findFirst({ where: eq(groupsTable.id, params.data.id) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  if (body.data.inviteCode && body.data.inviteCode !== group.inviteCode) {
    res.status(403).json({ error: "Invalid invite code" }); return;
  }

  const existing = await db.query.groupMembersTable.findFirst({
    where: and(eq(groupMembersTable.groupId, params.data.id), eq(groupMembersTable.playerId, req.playerId!)),
  });
  if (existing) { res.status(409).json({ error: "Already a member" }); return; }

  const members = await db.query.groupMembersTable.findMany({ where: eq(groupMembersTable.groupId, params.data.id) });
  if (members.length >= group.maxMembers) { res.status(400).json({ error: "Group is full" }); return; }

  // Enforce workout approval: check if creator requires manual approval
  const creator = await db.query.playersTable.findFirst({ where: eq(playersTable.id, group.creatorPlayerId) });
  if (creator?.requireWorkoutApproval) {
    res.status(403).json({ error: "This group requires the creator's approval before joining. Please contact the group leader directly." });
    return;
  }

  await db.insert(groupMembersTable).values({ groupId: params.data.id, playerId: req.playerId! });
  res.json({ success: true, memberCount: members.length + 1 });
});

// POST /groups/:id/leave
router.post("/groups/:id/leave", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, params.data.id), eq(groupMembersTable.playerId, req.playerId!))
  );
  res.json({ success: true });
});

// POST /groups/:id/workout — log a group workout; persists fitness activity + XP; membership required
router.post("/groups/:id/workout", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = LogGroupWorkoutBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (body.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const group = await db.query.groupsTable.findFirst({ where: eq(groupsTable.id, params.data.id) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const isMember = await checkMembership(params.data.id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  const members = await db.query.groupMembersTable.findMany({ where: eq(groupMembersTable.groupId, params.data.id) });
  const memberCount = members.length;
  const xpBonus = getXpBonus(memberCount);
  const xpBonusPct = Math.round(xpBonus * 100);

  const workoutType = body.data.workoutType ?? "active_minutes";
  const activityValue = body.data.steps ?? body.data.baseXp ?? 30;
  const fitnessResult = await logFitnessActivity({
    playerId: body.data.playerId,
    type: workoutType,
    value: activityValue,
    note: `Group workout – ${group.name}`,
    isPassiveSync: false,
  });

  const baseXp = fitnessResult.fitnessXpEarned;
  const bonusXp = Math.round(baseXp * xpBonus);

  if (bonusXp > 0) {
    await db.update(playersTable)
      .set({ fitnessXp: sql`${playersTable.fitnessXp} + ${bonusXp}` })
      .where(eq(playersTable.id, body.data.playerId));
  }

  const energyGained = Math.round(activityValue * 0.1) + 10;
  const newEnergy = group.teamEnergy + energyGained;
  const newTotalEnergy = group.totalTeamEnergy + energyGained;
  await db.update(groupsTable)
    .set({ teamEnergy: newEnergy, totalTeamEnergy: newTotalEnergy })
    .where(eq(groupsTable.id, params.data.id));

  if (newTotalEnergy >= RAID_ENERGY_THRESHOLD) {
    const existingRaid = await db.query.groupRaidsTable.findFirst({
      where: and(eq(groupRaidsTable.groupId, params.data.id), eq(groupRaidsTable.status, "active")),
    });
    if (!existingRaid) {
      const bossName = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
      await db.insert(groupRaidsTable).values({
        groupId: params.data.id,
        bossName,
        bossHp: 500 + memberCount * 100,
      });
    }
  }

  const { challengesAdvanced } = await advanceChallenges(params.data.id, body.data.steps ?? 0);
  const { raidDamage, raid: defeatedRaid } = await dealRaidDamage(params.data.id, Math.round(activityValue * 0.5));

  // ── Notification fan-out ─────────────────────────────────────────────────
  // All member IDs for the group (already fetched above).
  const allMemberIds = members.map(m => m.playerId);
  const actorId = req.playerId!;
  const groupLink = `/groups/${params.data.id}`;

  // Batch-resolve which members have muted this group so we can skip them.
  const mutedRowsW = allMemberIds.length > 0
    ? await db.select({ playerId: groupNotificationMutesTable.playerId })
        .from(groupNotificationMutesTable)
        .where(and(
          eq(groupNotificationMutesTable.groupId, params.data.id),
          inArray(groupNotificationMutesTable.playerId, allMemberIds),
        ))
    : [];
  const mutedSetW = new Set(mutedRowsW.map(r => r.playerId));

  // Resolve actor display name once for all notification copy.
  const actorRow = await db.query.playersTable.findFirst({ where: eq(playersTable.id, actorId) });
  const actorName = actorRow?.displayName ?? actorRow?.username ?? "A teammate";

  // 1. Workout notification — all members EXCEPT the actor who logged it.
  const workoutRecipients = allMemberIds.filter(id => id !== actorId && !mutedSetW.has(id));
  if (workoutRecipients.length > 0) {
    const workoutChannelMap = await socialChannelsForPlayers(workoutRecipients, "group_workout");
    const wTitle = "Group workout logged";
    const wBody = `${actorName} just logged a workout in ${group.name}!`;
    for (const memberId of workoutRecipients) {
      const ch = workoutChannelMap.get(memberId) ?? { inbox: true, push: true, email: false };
      if (!ch.inbox && !ch.push && !ch.email) continue;
      if (ch.inbox) void db.insert(notificationsTable).values({ playerId: memberId, type: "group_workout", title: wTitle, body: wBody, link: groupLink, sourceId: actorId });
      if (ch.push) void sendPushToPlayer(memberId, { title: wTitle, body: wBody, link: groupLink, category: "social", tag: `group-workout-${params.data.id}-${memberId}` });
      if (ch.email) void sendSocialEmail(memberId, { title: wTitle, body: wBody, link: groupLink });
    }
  }

  // 2. Challenge completion — ALL members (including actor) when any challenge finishes.
  if (challengesAdvanced > 0) {
    const challengeRecipients = allMemberIds.filter(id => !mutedSetW.has(id));
    if (challengeRecipients.length > 0) {
      const challengeChannelMap = await socialChannelsForPlayers(challengeRecipients, "group_challenge_completed");
      const cTitle = "Group challenge completed!";
      const cBody = `Your group "${group.name}" just completed a challenge!`;
      for (const memberId of challengeRecipients) {
        const ch = challengeChannelMap.get(memberId) ?? { inbox: true, push: true, email: false };
        if (!ch.inbox && !ch.push && !ch.email) continue;
        if (ch.inbox) void db.insert(notificationsTable).values({ playerId: memberId, type: "group_challenge_completed", title: cTitle, body: cBody, link: groupLink, sourceId: actorId });
        if (ch.push) void sendPushToPlayer(memberId, { title: cTitle, body: cBody, link: groupLink, category: "completed", tag: `group-challenge-${params.data.id}-${memberId}` });
        if (ch.email) void sendSocialEmail(memberId, { title: cTitle, body: cBody, link: groupLink });
      }
    }
  }

  // 3. Raid defeat — ALL members (including actor) when the boss HP reaches zero.
  if (defeatedRaid && defeatedRaid.status === "defeated") {
    const raidRecipients = allMemberIds.filter(id => !mutedSetW.has(id));
    if (raidRecipients.length > 0) {
      const raidChannelMap = await socialChannelsForPlayers(raidRecipients, "group_raid_defeated");
      const rTitle = "Raid boss defeated!";
      const rBody = `Your group "${group.name}" defeated ${defeatedRaid.bossName}!`;
      for (const memberId of raidRecipients) {
        const ch = raidChannelMap.get(memberId) ?? { inbox: true, push: true, email: false };
        if (!ch.inbox && !ch.push && !ch.email) continue;
        if (ch.inbox) void db.insert(notificationsTable).values({ playerId: memberId, type: "group_raid_defeated", title: rTitle, body: rBody, link: groupLink, sourceId: actorId });
        if (ch.push) void sendPushToPlayer(memberId, { title: rTitle, body: rBody, link: groupLink, category: "completed", tag: `group-raid-${params.data.id}-${memberId}` });
        if (ch.email) void sendSocialEmail(memberId, { title: rTitle, body: rBody, link: groupLink });
      }
    }
  }

  // Partner-based friendship: increment coWorkoutCount for ALL members when any member logs
  // This represents the whole squad working out together in this group session
  const now = new Date();
  await Promise.all(members.map(async (m) => {
    const newCount = m.coWorkoutCount + 1;
    const newFriendshipLevel = Math.floor(newCount / 5) + 1;
    await db.update(groupMembersTable)
      .set({ coWorkoutCount: newCount, friendshipLevel: newFriendshipLevel, lastWorkoutTogether: now })
      .where(and(eq(groupMembersTable.groupId, params.data.id), eq(groupMembersTable.playerId, m.playerId)));
  }));

  const activityFormatted = fitnessResult.activity
    ? { ...fitnessResult.activity, createdAt: fitnessResult.activity.createdAt.toISOString() }
    : null;

  res.json({
    energyGained,
    teamEnergy: newEnergy,
    bonusXp,
    xpBonusPct,
    memberCount,
    challengesAdvanced,
    raidDamage,
    raidUnlocked: newTotalEnergy >= RAID_ENERGY_THRESHOLD,
    fitnessXpEarned: baseXp + bonusXp,
    activity: activityFormatted,
    player: fitnessResult.updatedPlayer,
  });
});

// POST /groups/:id/challenge-progress — directly contribute to challenges; membership required
router.post("/groups/:id/challenge-progress", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { progressValue } = req.body;
  if (progressValue === undefined) { res.status(400).json({ error: "progressValue required" }); return; }

  const group = await db.query.groupsTable.findFirst({ where: eq(groupsTable.id, params.data.id) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const isMember = await checkMembership(params.data.id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  const { challengesAdvanced, challenges } = await advanceChallenges(params.data.id, Number(progressValue));
  res.json({ challengesAdvanced, challenges });
});

// POST /groups/:id/raid/attack — deal raid damage directly; membership required
router.post("/groups/:id/raid/attack", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { damage } = req.body;
  if (damage === undefined) { res.status(400).json({ error: "damage required" }); return; }

  const isMember = await checkMembership(params.data.id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  const { raid } = await dealRaidDamage(params.data.id, Number(damage));
  if (!raid) { res.status(404).json({ error: "No active raid" }); return; }

  res.json(raid);
});

// GET /groups/:id/messages — membership required
router.get("/groups/:id/messages", requireAuth, attachPlayer, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const isMember = await checkMembership(params.data.id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  const messages = await db.query.groupMessagesTable.findMany({
    where: eq(groupMessagesTable.groupId, params.data.id),
    orderBy: [desc(groupMessagesTable.createdAt)],
    limit: 50,
  });

  res.json(messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })).reverse());
});

// POST /groups/:id/messages — membership required
router.post("/groups/:id/messages", requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
  const params = GetGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = SendGroupMessageBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (body.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const isMember = await checkMembership(params.data.id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  const { content, isFiltered } = basicProfanityFilter(body.data.content.trim().slice(0, 280));

  const [msg] = await db.insert(groupMessagesTable).values({
    groupId: params.data.id,
    playerId: req.playerId!,
    playerName: player?.displayName ?? player?.username ?? "Trainer",
    content,
    isFiltered,
  }).returning();

  // Fan-out club_mention notifications using a single batch query for all
  // recipients instead of one query per recipient (N-query pattern avoided).
  const mentioned = await resolveMentionedPlayers(content, req.playerId!);
  if (mentioned.length > 0) {
    const mentionedIds = mentioned.map(m => m.id);

    // Fetch players who have muted this group so we can skip them.
    const mutedRows = mentionedIds.length > 0
      ? await db.select({ playerId: groupNotificationMutesTable.playerId })
          .from(groupNotificationMutesTable)
          .where(
            and(
              eq(groupNotificationMutesTable.groupId, params.data.id),
              inArray(groupNotificationMutesTable.playerId, mentionedIds),
            ),
          )
      : [];
    const mutedSet = new Set(mutedRows.map(r => r.playerId));

    const senderName = player?.displayName ?? player?.username ?? "Someone";
    const snippet = content.slice(0, 80);
    const link = `/groups/${params.data.id}`;
    const title = "You were mentioned";
    const body = `${senderName} mentioned you in a group: "${snippet}"`;

    const channelMap = await socialChannelsForPlayers(
      mentionedIds,
      "club_mention",
    );

    for (const m of mentioned) {
      if (mutedSet.has(m.id)) continue;
      const ch = channelMap.get(m.id) ?? null;
      if (!ch || (!ch.inbox && !ch.push && !ch.email)) continue;
      if (ch.inbox) {
        void db.insert(notificationsTable).values({
          playerId: m.id,
          type: "club_mention",
          title,
          body,
          link,
          sourceId: req.playerId!,
        });
      }
      if (ch.push) {
        void sendPushToPlayer(m.id, {
          title,
          body,
          link,
          category: "social",
          tag: `club-mention-${msg.id}-${m.id}`,
        });
      }
      if (ch.email) void sendSocialEmail(m.id, { title, body, link });
    }
  }

  res.status(201).json({ ...msg, createdAt: msg.createdAt.toISOString() });
});

// GET /groups/:id/mute — check mute status for the current player
router.get("/groups/:id/mute", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const isMember = await checkMembership(id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  const row = await db.query.groupNotificationMutesTable.findFirst({
    where: and(
      eq(groupNotificationMutesTable.groupId, id),
      eq(groupNotificationMutesTable.playerId, req.playerId!),
    ),
  });

  res.json({ muted: !!row });
});

// POST /groups/:id/mute — mute mention notifications for this group
router.post("/groups/:id/mute", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const isMember = await checkMembership(id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  await db.insert(groupNotificationMutesTable)
    .values({ groupId: id, playerId: req.playerId! })
    .onConflictDoNothing();

  res.json({ success: true });
});

// DELETE /groups/:id/mute — unmute mention notifications for this group
router.delete("/groups/:id/mute", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const isMember = await checkMembership(id, req.playerId!);
  if (!isMember) { res.status(403).json({ error: "Not a group member" }); return; }

  await db.delete(groupNotificationMutesTable)
    .where(
      and(
        eq(groupNotificationMutesTable.groupId, id),
        eq(groupNotificationMutesTable.playerId, req.playerId!),
      ),
    );

  res.json({ success: true });
});

export default router;
