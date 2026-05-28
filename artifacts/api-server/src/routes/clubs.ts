import { Router } from "express";
import { db } from "@workspace/db";
import { clubsTable, clubInvitesTable, notificationsTable, playersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  ListClubsQueryParams,
  CreateClubBody,
  GetClubParams,
  JoinClubParams,
  JoinClubBody,
  UpdateClubMemberRoleParams,
  UpdateClubMemberRoleBody,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { sendPushToPlayer } from "../services/pushNotifications.ts";
import type { RequestHandler } from "express";

const router = Router();

router.get("/clubs", async (req, res) => {
  const query = ListClubsQueryParams.safeParse({ limit: req.query.limit ? Number(req.query.limit) : 20 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const results = await db.query.clubsTable.findMany({ limit: query.data.limit ?? 20 });
  res.json(results.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/clubs", requireAuth as RequestHandler, async (req, res) => {
  const body = CreateClubBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const club = await db.insert(clubsTable).values({ ...body.data, description: body.data.description ?? "" }).returning();
  res.status(201).json({ ...club[0], createdAt: club[0].createdAt.toISOString() });
});

router.get("/clubs/:id", async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }
  res.json({ ...club, createdAt: club.createdAt.toISOString() });
});

router.get("/clubs/:id/members", async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }
  const members = await db.query.playersTable.findMany({
    where: eq(playersTable.clubId, params.data.id),
    columns: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      level: true,
      rank: true,
      totalWins: true,
      clubRole: true,
    },
  });
  res.json(members);
});

router.post("/clubs/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = JoinClubBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (body.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }

  await db.update(clubsTable).set({ memberCount: club.memberCount + 1 }).where(eq(clubsTable.id, params.data.id));
  await db.update(playersTable).set({ clubId: params.data.id }).where(eq(playersTable.id, req.playerId!));

  const updated = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  res.json({ ...updated!, createdAt: updated!.createdAt.toISOString() });
});

router.post("/clubs/:id/leave", requireAuth, attachPlayer, async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player || player.clubId !== params.data.id) {
    res.status(403).json({ error: "You are not a member of this club" });
    return;
  }

  if ((player.clubRole ?? "").toLowerCase() === "owner") {
    res.status(403).json({ error: "Transfer ownership before leaving the club" });
    return;
  }

  await db.update(playersTable)
    .set({ clubId: null, clubRole: null })
    .where(eq(playersTable.id, req.playerId!));
  await db.update(clubsTable)
    .set({ memberCount: Math.max(0, club.memberCount - 1) })
    .where(eq(clubsTable.id, params.data.id));

  res.json({ success: true });
});

// ── Invite a player to a club (admin/leader only) ─────────────────────────
router.post("/clubs/:id/invite", requireAuth, attachPlayer, async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const { inviteeId } = req.body as { inviteeId?: number };
  if (!inviteeId || typeof inviteeId !== "number") {
    res.status(400).json({ error: "inviteeId required" });
    return;
  }
  if (inviteeId === req.playerId) {
    res.status(400).json({ error: "Cannot invite yourself" });
    return;
  }

  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }

  const inviter = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!inviter || inviter.clubId !== params.data.id) {
    res.status(403).json({ error: "Only members can invite to a club" });
    return;
  }
  const role = (inviter.clubRole ?? "").toLowerCase();
  if (role !== "leader" && role !== "admin" && role !== "officer") {
    res.status(403).json({ error: "Only club admins can send invites" });
    return;
  }

  const invitee = await db.query.playersTable.findFirst({ where: eq(playersTable.id, inviteeId) });
  if (!invitee) { res.status(404).json({ error: "Invitee not found" }); return; }
  if (invitee.clubId === params.data.id) {
    res.status(409).json({ error: "Player is already in this club" });
    return;
  }

  const [invite] = await db.insert(clubInvitesTable).values({
    clubId: params.data.id,
    inviteeId,
    inviterId: req.playerId!,
  }).onConflictDoNothing().returning();

  if (invite) {
    const inviterName = inviter.displayName ?? inviter.username ?? "A player";
    await db.insert(notificationsTable).values({
      playerId: inviteeId,
      type: "club_invite",
      title: "New club invite",
      body: `${inviterName} invited you to join ${club.name}.`,
      link: `/club/${club.id}`,
      sourceId: invite.id,
    });

    void sendPushToPlayer(inviteeId, {
      title: "New club invite",
      body: `${inviterName} invited you to join ${club.name}.`,
      link: `/club/${club.id}`,
      category: "invites",
      tag: `club-invite-${invite.id}`,
    });
  }

  res.status(201).json({ ...(invite ?? {}), sentAt: invite?.sentAt?.toISOString() });
});

// ── Respond to a club invite ───────────────────────────────────────────────
router.post("/club-invites/:id/respond", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status?: "accepted" | "declined" };
  if (!id || (status !== "accepted" && status !== "declined")) {
    res.status(400).json({ error: "status required" });
    return;
  }

  const invite = await db.query.clubInvitesTable.findFirst({
    where: and(eq(clubInvitesTable.id, id), eq(clubInvitesTable.inviteeId, req.playerId!)),
  });
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
  if (invite.status !== "pending") {
    res.status(409).json({ error: "Invite already responded to" });
    return;
  }

  await db.update(clubInvitesTable).set({ status }).where(eq(clubInvitesTable.id, id));

  // Mark the related club_invite notification as read.
  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(
      eq(notificationsTable.playerId, req.playerId!),
      eq(notificationsTable.type, "club_invite"),
      eq(notificationsTable.sourceId, id),
    ));

  const invitee = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, invite.clubId) });
  if (!club) { res.status(404).json({ error: "Club no longer exists" }); return; }

  if (status === "accepted") {
    // Only bump memberCount + assign clubId if the player wasn't already a member.
    if (invitee && invitee.clubId !== invite.clubId) {
      await db.update(playersTable)
        .set({ clubId: invite.clubId, clubRole: invitee.clubRole ?? "member" })
        .where(eq(playersTable.id, req.playerId!));
      await db.update(clubsTable)
        .set({ memberCount: club.memberCount + 1 })
        .where(eq(clubsTable.id, invite.clubId));
    }
  }

  // Close the loop for the inviter: notify them of the invitee's response.
  const inviteeName = invitee?.displayName ?? invitee?.username ?? "A player";
  if (status === "accepted") {
    await db.insert(notificationsTable).values({
      playerId: invite.inviterId,
      type: "club_invite_accepted",
      title: "Invite accepted",
      body: `${inviteeName} joined ${club.name}.`,
      link: `/club/${club.id}`,
      sourceId: invite.id,
    });
    void sendPushToPlayer(invite.inviterId, {
      title: "Invite accepted",
      body: `${inviteeName} joined ${club.name}.`,
      link: `/club/${club.id}`,
      category: "invites",
      tag: `club-invite-accepted-${invite.id}`,
    });
  } else {
    // Quieter decline: in-app notification only, no push.
    await db.insert(notificationsTable).values({
      playerId: invite.inviterId,
      type: "club_invite_declined",
      title: "Invite declined",
      body: `${inviteeName} passed on your invite to ${club.name}.`,
      link: `/club/${club.id}`,
      sourceId: invite.id,
    });
  }

  res.json({ success: true, status });
});

// ── List pending invites for a club (admins/leaders only) ─────────────────
router.get("/clubs/:id/pending-invites", requireAuth, attachPlayer, async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const viewer = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!viewer || viewer.clubId !== params.data.id) {
    res.status(403).json({ error: "Only club admins can view pending invites" });
    return;
  }
  const role = (viewer.clubRole ?? "").toLowerCase();
  if (role !== "leader" && role !== "admin" && role !== "officer") {
    res.status(403).json({ error: "Only club admins can view pending invites" });
    return;
  }

  const invites = await db.query.clubInvitesTable.findMany({
    where: and(
      eq(clubInvitesTable.clubId, params.data.id),
      eq(clubInvitesTable.status, "pending"),
    ),
  });

  const enriched = await Promise.all(invites.map(async (inv) => {
    const [invitee, inviter] = await Promise.all([
      db.query.playersTable.findFirst({ where: eq(playersTable.id, inv.inviteeId) }),
      db.query.playersTable.findFirst({ where: eq(playersTable.id, inv.inviterId) }),
    ]);
    return {
      id: inv.id,
      clubId: inv.clubId,
      inviteeId: inv.inviteeId,
      inviterId: inv.inviterId,
      status: inv.status,
      sentAt: inv.sentAt.toISOString(),
      inviteeName: invitee?.displayName ?? invitee?.username ?? `Player ${inv.inviteeId}`,
      inviteeAvatar: invitee?.avatarUrl ?? null,
      inviterName: inviter?.displayName ?? inviter?.username ?? null,
    };
  }));

  res.json(enriched);
});

// ── Cancel a pending club invite (admins/leaders only) ────────────────────
router.delete("/club-invites/:id", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const invite = await db.query.clubInvitesTable.findFirst({
    where: eq(clubInvitesTable.id, id),
  });
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
  if (invite.status !== "pending") {
    res.status(409).json({ error: "Invite already responded to" });
    return;
  }

  const viewer = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  const isOriginalInviter = !!viewer && invite.inviterId === viewer.id;
  const role = (viewer?.clubRole ?? "").toLowerCase();
  const isClubAdmin =
    !!viewer &&
    viewer.clubId === invite.clubId &&
    (role === "leader" || role === "admin" || role === "officer");
  if (!isOriginalInviter && !isClubAdmin) {
    res.status(403).json({ error: "Only the original inviter or a club admin can cancel invites" });
    return;
  }

  await db.delete(clubInvitesTable).where(eq(clubInvitesTable.id, id));

  // Dismiss the invitee's club_invite notification for this invite.
  await db.delete(notificationsTable).where(and(
    eq(notificationsTable.playerId, invite.inviteeId),
    eq(notificationsTable.type, "club_invite"),
    eq(notificationsTable.sourceId, id),
  ));

  res.json({ success: true });
});

// ── List my pending club invites ───────────────────────────────────────────
router.get("/club-invites", requireAuth, attachPlayer, async (req, res) => {
  const invites = await db.query.clubInvitesTable.findMany({
    where: and(
      eq(clubInvitesTable.inviteeId, req.playerId!),
      eq(clubInvitesTable.status, "pending"),
    ),
  });

  const enriched = await Promise.all(invites.map(async (inv) => {
    const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, inv.clubId) });
    const inviter = await db.query.playersTable.findFirst({ where: eq(playersTable.id, inv.inviterId) });
    return {
      ...inv,
      sentAt: inv.sentAt.toISOString(),
      club: club ? { ...club, createdAt: club.createdAt.toISOString() } : null,
      inviter: inviter ? { id: inviter.id, displayName: inviter.displayName, avatarUrl: inviter.avatarUrl } : null,
    };
  }));

  res.json(enriched);
});

// ── Promote / demote / transfer ownership of a club member (owner only) ───
router.patch("/clubs/:id/members/:playerId", requireAuth, attachPlayer, async (req, res) => {
  const params = UpdateClubMemberRoleParams.safeParse({
    id: Number(req.params.id),
    playerId: Number(req.params.playerId),
  });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateClubMemberRoleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }

  const viewer = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!viewer || viewer.clubId !== params.data.id) {
    res.status(403).json({ error: "Only the club owner can change roles" });
    return;
  }
  const viewerRole = (viewer.clubRole ?? "").toLowerCase();
  if (viewerRole !== "owner") {
    res.status(403).json({ error: "Only the club owner can change roles" });
    return;
  }

  const target = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, params.data.playerId),
  });
  if (!target || target.clubId !== params.data.id) {
    res.status(404).json({ error: "Member not found in this club" });
    return;
  }

  const targetRole = (target.clubRole ?? "member").toLowerCase();
  const nextRole = body.data.clubRole;

  // Owner role can only be transferred, not removed. If the viewer is trying
  // to change their own role to anything other than owner, reject.
  if (target.id === viewer.id && nextRole !== "owner") {
    res.status(403).json({
      error: "Owner role can only be transferred to another member, not removed",
    });
    return;
  }

  // No-op: nothing to update.
  if (targetRole === nextRole) {
    res.json({
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      avatarUrl: target.avatarUrl,
      level: target.level,
      rank: target.rank,
      totalWins: target.totalWins,
      clubRole: target.clubRole,
    });
    return;
  }

  if (nextRole === "owner") {
    // Transfer ownership: target becomes owner, current owner becomes officer.
    await db.transaction(async (tx) => {
      await tx.update(playersTable)
        .set({ clubRole: "officer" })
        .where(eq(playersTable.id, viewer.id));
      await tx.update(playersTable)
        .set({ clubRole: "owner" })
        .where(eq(playersTable.id, target.id));
    });
  } else {
    await db.update(playersTable)
      .set({ clubRole: nextRole })
      .where(eq(playersTable.id, target.id));
  }

  const updated = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, target.id),
    columns: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      level: true,
      rank: true,
      totalWins: true,
      clubRole: true,
    },
  });
  res.json(updated);
});

export default router;
