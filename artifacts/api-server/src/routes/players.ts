import { Router } from "express";
import { createDecipheriv, createHash } from "crypto";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable, competitionsTable, liveEventsTable, eggsTable, fitnessActivitiesTable, playerBadgesTable, playerArtifactsTable, artifactsTable, playerLocationTable, groupMembersTable, groupsTable, challengeInvitesTable, playerFollowsTable } from "@workspace/db";
import { eq, desc, and, gte, or, ilike, ne, inArray, sql } from "drizzle-orm";
import { filterDiscoverableCandidates, getHiddenPlayerIds } from "./safety.ts";
import {
  loadMutualWorkoutPartnersForViewer,
  type MutualWorkoutPartner,
} from "./sharedGroups.ts";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  GetPlayerParams,
  UpdatePlayerParams,
  GetPlayerDashboardParams,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { BADGE_MAP, DAILY_REWARD_SCHEDULE, computeLevelProgress, getDailyReward, checkAndAwardBadges } from "../services/badgeService.ts";

const router = Router();

// GET /players/me — returns current player, linking or JIT-provisioning on first sign-in
router.get("/players/me", requireAuth, async (req, res) => {
  const clerkId = req.clerkUserId!;
  let player = await db.query.playersTable.findFirst({ where: eq(playersTable.clerkId, clerkId) });
  if (!player) {
    // JIT-provision a fresh player row for every new Clerk user.
    // Never claim unlinked seed/dev players — those belong to local dev only.
    const base = `player_${clerkId.slice(-8).replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    const username = base || `player_${Date.now()}`;
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rows = await db.insert(playersTable).values({
      clerkId,
      username,
      displayName: username,
      subscriptionTier: "premium",
      subscriptionSource: "trial",
      trialEndsAt: trialEnd,
    }).returning();
    player = rows[0]!;
  }
  res.json(player);
});

// POST /players/me — create profile for new user
router.post("/players/me", requireAuth, async (req, res) => {
  const clerkId = req.clerkUserId!;

  const existing = await db.query.playersTable.findFirst({ where: eq(playersTable.clerkId, clerkId) });
  if (existing) {
    res.json(existing);
    return;
  }

  const { username, displayName, avatarUrl } = req.body as { username?: string; displayName?: string; avatarUrl?: string };
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const taken = await db.query.playersTable.findFirst({ where: eq(playersTable.username, username) });
  if (taken) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const player = await db.insert(playersTable).values({
    clerkId,
    username,
    displayName: displayName ?? username,
    avatarUrl: avatarUrl ?? null,
    subscriptionTier: "premium",
    subscriptionSource: "trial",
    trialEndsAt: trialEnd,
  }).returning();

  res.status(201).json(player[0]);
});

router.post("/players", requireAuth, async (req, res) => {
  const body = CreatePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const player = await db
    .insert(playersTable)
    .values({
      username: body.data.username,
      displayName: body.data.displayName,
      avatarUrl: body.data.avatarUrl,
      clerkId: req.clerkUserId!,
      subscriptionTier: "premium",
      subscriptionSource: "trial",
      trialEndsAt: trialEnd,
    })
    .returning();
  res.status(201).json(player[0]);
});

// GET /players/search — search by username or displayName (case-insensitive)
router.get("/players/search", requireAuth, attachPlayer, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json([]);
    return;
  }
  const rawLimit = Number(req.query.limit);
  const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20));
  const needle = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const viewerId = req.playerId;
  const whereExpr = viewerId
    ? and(
        or(ilike(playersTable.username, needle), ilike(playersTable.displayName, needle)),
        ne(playersTable.id, viewerId),
      )
    : or(ilike(playersTable.username, needle), ilike(playersTable.displayName, needle));

  // Pull a larger candidate window so we still return up to `limit` results
  // after the privacy filter removes blocked/hidden/minor accounts.
  const rawRows = await db.query.playersTable.findMany({
    where: whereExpr,
    limit: limit * 4,
    orderBy: (t, { asc }) => [asc(t.username)],
  });

  // Apply the canonical people-discovery exclusion rule (blocked /
  // hidden-visibility / minor accounts). See filterDiscoverableCandidates
  // in safety.ts — the same helper is used by /players/nearby and
  // /leaderboards/scoped so the policy lives in exactly one place.
  const rows = (await filterDiscoverableCandidates(viewerId, rawRows)).slice(0, limit);

  // Compute shared groups (viewer ∩ each match) so the invite picker can
  // surface "Also in <group> with you" — same trust signal as the social
  // discover card.
  const sharedGroupsByPlayer = new Map<number, Array<{ id: number; name: string }>>();
  const mutualWorkoutPartnersByPlayer = new Map<number, MutualWorkoutPartner[]>();
  if (viewerId && rows.length > 0) {
    const matchIds = rows.map(r => r.id);
    const viewerMemberships = await db.query.groupMembersTable.findMany({
      where: eq(groupMembersTable.playerId, viewerId),
    });
    const viewerGroupIds = viewerMemberships.map(m => m.groupId);
    if (viewerGroupIds.length > 0) {
      const matchMemberships = await db.query.groupMembersTable.findMany({
        where: and(
          inArray(groupMembersTable.playerId, matchIds),
          inArray(groupMembersTable.groupId, viewerGroupIds),
        ),
      });
      if (matchMemberships.length > 0) {
        const referencedGroupIds = Array.from(new Set(matchMemberships.map(m => m.groupId)));
        const groupRows = await db.query.groupsTable.findMany({
          where: inArray(groupsTable.id, referencedGroupIds),
        });
        const groupNameMap = new Map(groupRows.map(g => [g.id, g.name]));
        for (const m of matchMemberships) {
          const name = groupNameMap.get(m.groupId);
          if (!name) continue;
          const list = sharedGroupsByPlayer.get(m.playerId) ?? [];
          list.push({ id: m.groupId, name });
          sharedGroupsByPlayer.set(m.playerId, list);
        }
      }

      // Mutual workout partners (viewer ∩ each match). Delegates to the
      // shared helper next to the SharedGroups loader so the same safety
      // filtering (block/hidden/minor) is enforced on every surface
      // exposing this trust signal.
      const hiddenIds = await getHiddenPlayerIds(viewerId);
      const grouped = await loadMutualWorkoutPartnersForViewer(viewerId, matchIds, hiddenIds);
      for (const [k, v] of grouped) mutualWorkoutPartnersByPlayer.set(k, v);
    }
  }

  res.json(rows.map(p => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    creatorBadge: p.creatorBadge ?? null,
    sharedGroups: sharedGroupsByPlayer.get(p.id) ?? [],
    mutualWorkoutPartners: mutualWorkoutPartnersByPlayer.get(p.id) ?? [],
  })));
});

// GET /players/invite-suggestions — default list for the Invite Friends sheet
// before the creator types anything. Combines recent invitees, followed
// players, and shared-group cohort, then enriches with sharedGroups and
// mutualWorkoutPartners so each row carries the same trust signals as the
// search results.
router.get("/players/invite-suggestions", requireAuth, attachPlayer, async (req, res) => {
  const viewerId = req.playerId!;
  const rawLimit = Number(req.query.limit);
  const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20));

  // Pull all three source pools in parallel. Each is capped so we still get a
  // reasonable candidate window after the privacy filter and ranking pass.
  const [recentInvites, follows, viewerMemberships] = await Promise.all([
    db.query.challengeInvitesTable.findMany({
      where: eq(challengeInvitesTable.inviterId, viewerId),
      orderBy: [desc(challengeInvitesTable.sentAt)],
      limit: 100,
    }),
    db.query.playerFollowsTable.findMany({
      where: eq(playerFollowsTable.followerId, viewerId),
      orderBy: [desc(playerFollowsTable.createdAt)],
      limit: 100,
    }),
    db.query.groupMembersTable.findMany({
      where: eq(groupMembersTable.playerId, viewerId),
    }),
  ]);

  type Candidate = { id: number; weight: number; order: number };
  const candidates = new Map<number, Candidate>();
  let orderCounter = 0;
  const consider = (id: number, weight: number) => {
    if (id === viewerId) return;
    const existing = candidates.get(id);
    if (!existing || existing.weight < weight) {
      candidates.set(id, { id, weight, order: existing?.order ?? orderCounter++ });
    }
  };

  // 1. Recent invitees — strongest signal, the creator has actively chosen
  //    these players before.
  for (const inv of recentInvites) consider(inv.inviteeId, 100);

  // 2. People the viewer follows.
  for (const f of follows) consider(f.followeeId, 70);

  // 3. Shared-group cohort.
  const viewerGroupIds = viewerMemberships.map(m => m.groupId);
  if (viewerGroupIds.length > 0) {
    const sharedMembers = await db.query.groupMembersTable.findMany({
      where: and(
        inArray(groupMembersTable.groupId, viewerGroupIds),
        ne(groupMembersTable.playerId, viewerId),
      ),
      limit: 200,
    });
    for (const m of sharedMembers) consider(m.playerId, 40);
  }

  if (candidates.size === 0) {
    res.json([]);
    return;
  }

  const candidateIds = Array.from(candidates.keys());
  const candidatePlayers = await db.query.playersTable.findMany({
    where: inArray(playersTable.id, candidateIds),
  });

  // Canonical people-discovery exclusion (blocked / hidden / minor accounts).
  const allowed = await filterDiscoverableCandidates(viewerId, candidatePlayers);

  // Rank by source priority, then by recency-of-add order within the same
  // weight tier (recent invites stay newest-first).
  const ranked = allowed
    .map(p => ({ player: p, c: candidates.get(p.id)! }))
    .sort((a, b) => b.c.weight - a.c.weight || a.c.order - b.c.order)
    .slice(0, limit)
    .map(r => r.player);

  if (ranked.length === 0) {
    res.json([]);
    return;
  }

  // Enrich with shared groups + mutual workout partners — same trust signals
  // used by /players/search so the picker rows look identical.
  const rankedIds = ranked.map(p => p.id);
  const sharedGroupsByPlayer = new Map<number, Array<{ id: number; name: string }>>();
  const mutualWorkoutPartnersByPlayer = new Map<number, MutualWorkoutPartner[]>();

  if (viewerGroupIds.length > 0) {
    const matchMemberships = await db.query.groupMembersTable.findMany({
      where: and(
        inArray(groupMembersTable.playerId, rankedIds),
        inArray(groupMembersTable.groupId, viewerGroupIds),
      ),
    });
    if (matchMemberships.length > 0) {
      const referencedGroupIds = Array.from(new Set(matchMemberships.map(m => m.groupId)));
      const groupRows = await db.query.groupsTable.findMany({
        where: inArray(groupsTable.id, referencedGroupIds),
      });
      const groupNameMap = new Map(groupRows.map(g => [g.id, g.name]));
      for (const m of matchMemberships) {
        const name = groupNameMap.get(m.groupId);
        if (!name) continue;
        const list = sharedGroupsByPlayer.get(m.playerId) ?? [];
        list.push({ id: m.groupId, name });
        sharedGroupsByPlayer.set(m.playerId, list);
      }
    }
  }

  const hiddenIds = await getHiddenPlayerIds(viewerId);
  const grouped = await loadMutualWorkoutPartnersForViewer(viewerId, rankedIds, hiddenIds);
  for (const [k, v] of grouped) mutualWorkoutPartnersByPlayer.set(k, v);

  res.json(ranked.map(p => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    creatorBadge: p.creatorBadge ?? null,
    sharedGroups: sharedGroupsByPlayer.get(p.id) ?? [],
    mutualWorkoutPartners: mutualWorkoutPartnersByPlayer.get(p.id) ?? [],
  })));
});

// GET /players/nearby — players in the viewer's city, respecting privacy/blocking/minor rules.
// Returns only a coarse distance bucket; raw coords are never decrypted into the response.
function deriveLocationKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHash("sha256").update(secret).digest();
}

function decryptCoord(blob: string | null | undefined, key: Buffer): number | null {
  if (!blob) return null;
  try {
    const [ivB64, tagB64, ctB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    const out = Buffer.concat([d.update(ct), d.final()]).toString("utf8");
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function bucketFromKm(km: number): "under_1km" | "under_5km" | "under_25km" | "same_city" {
  if (km < 1) return "under_1km";
  if (km < 5) return "under_5km";
  if (km < 25) return "under_25km";
  return "same_city";
}

router.get("/players/nearby", requireAuth, attachPlayer, async (req, res) => {
  const viewerId = req.playerId!;
  const viewerLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, viewerId),
  });

  // SECURITY: /players/nearby is disabled because it creates a privacy-sensitive
  // enumeration of users in a claimed city derived solely from client-supplied
  // GPS coordinates. Since the server cannot cryptographically verify that a
  // device is actually at the submitted coordinates, this endpoint would expose
  // other users' city-level presence to any attacker who submits spoofed GPS.
  // The feature is suppressed until a trusted location attestation mechanism
  // (e.g., device/provider-signed proof) is available.
  res.json({ entries: [], city: viewerLoc?.city ?? null, locationRequired: false, locationUnavailable: true });
});

function isSameDayUTC(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function isYesterdayUTC(yesterday: Date, today: Date): boolean {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

const STREAK_SHIELD_COST = 200;

// GET /players/me/daily-streak — streak state + 30-day schedule
router.get("/players/me/daily-streak", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const now = new Date();
  const lastClaimed = player.lastRewardClaimedAt ? new Date(player.lastRewardClaimedAt) : null;
  const alreadyClaimed = lastClaimed ? isSameDayUTC(lastClaimed, now) : false;

  let currentDay = player.dailyRewardStreak ?? 0;
  let streakBroken = false;

  if (!alreadyClaimed && lastClaimed) {
    // If last claim was NOT yesterday and NOT today, streak is broken
    const wasYesterday = isYesterdayUTC(lastClaimed, now);
    if (!wasYesterday) {
      currentDay = 0;
      streakBroken = true;
    }
  }

  // Current unclaimed day index
  const nextDay = currentDay + 1;
  const todayReward = getDailyReward(nextDay);

  // Shield active if a shield was consumed within the last 48 hours
  const lastShieldUsedAt = player.lastShieldUsedAt ? new Date(player.lastShieldUsedAt) : null;
  const shieldActive = lastShieldUsedAt
    ? now.getTime() - lastShieldUsedAt.getTime() < 48 * 60 * 60 * 1000
    : false;

  res.json({
    currentDay,
    streakBroken,
    alreadyClaimed,
    lastClaimedAt: lastClaimed ? lastClaimed.toISOString() : null,
    streakShields: player.streakShields ?? 0,
    shieldActive,
    autoReplenishShields: player.autoReplenishShields ?? false,
    shieldAutoReplenishThreshold: player.shieldAutoReplenishThreshold ?? 1,
    todayReward,
    schedule: DAILY_REWARD_SCHEDULE,
  });
});

// POST /players/me/daily-claim — claim today's daily reward
router.post("/players/me/daily-claim", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const now = new Date();
  const lastClaimed = player.lastRewardClaimedAt ? new Date(player.lastRewardClaimedAt) : null;
  const alreadyClaimed = lastClaimed ? isSameDayUTC(lastClaimed, now) : false;

  if (alreadyClaimed) {
    res.status(400).json({ error: "already_claimed_today" });
    return;
  }

  // Compute new streak day
  let newStreakDay: number;
  let streakBroken = false;
  let shieldConsumed = false;
  if (!lastClaimed) {
    // First ever claim
    newStreakDay = 1;
  } else {
    const wasYesterday = isYesterdayUTC(lastClaimed, now);
    if (wasYesterday) {
      newStreakDay = (player.dailyRewardStreak ?? 0) + 1;
    } else {
      // Missed one or more days — check for a Streak Shield
      const shields = player.streakShields ?? 0;
      if (shields > 0) {
        // Auto-consume one shield and preserve the streak
        shieldConsumed = true;
        newStreakDay = (player.dailyRewardStreak ?? 0) + 1;
      } else {
        // No shields available — reset
        newStreakDay = 1;
        streakBroken = true;
      }
    }
  }

  const reward = getDailyReward(newStreakDay);

  // Grant coins + XP
  const coinsGranted = reward.coins;
  const xpGranted = reward.xp;

  // Apply base reward grants (coins + XP), and consume a shield if needed
  await db.update(playersTable)
    .set({
      coins: sql`${playersTable.coins} + ${coinsGranted}`,
      xp: sql`${playersTable.xp} + ${xpGranted}`,
      dailyRewardStreak: newStreakDay,
      lastRewardClaimedAt: now,
      ...(shieldConsumed ? {
        streakShields: sql`${playersTable.streakShields} - 1`,
        lastShieldUsedAt: now,
      } : {}),
    })
    .where(eq(playersTable.id, playerId));

  // Helper: add an egg to incubator if there's space (max 6 active)
  async function tryAddEgg(rarity: "Rare" | "Epic" | "Legendary"): Promise<boolean> {
    const activeEggs = await db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, playerId), eq(eggsTable.isHatched, false)),
    });
    if (activeEggs.length >= 6) return false;
    const stepsMap: Record<string, number> = { Rare: 5000, Epic: 8000, Legendary: 12000 };
    await db.insert(eggsTable).values({
      playerId,
      rarity,
      eggType: "balanced",
      stepsRequired: stepsMap[rarity] ?? 5000,
      name: `${rarity} Mystery Egg`,
      description: "Hatched from your daily login reward!",
      realm: "balance",
    });
    return true;
  }

  // Helper: mint a random fitness_streak artifact the player doesn't own yet.
  // Falls back to granting extra coins if no eligible artifact exists.
  async function tryMintArtifact(rarity?: string): Promise<{ artifactId: number; artifactName: string } | null> {
    const owned = await db.query.playerArtifactsTable.findMany({
      where: eq(playerArtifactsTable.playerId, playerId),
      columns: { artifactId: true },
    });
    const ownedIds = owned.map(o => o.artifactId);

    const eligibleArtifacts = await db.query.artifactsTable.findMany({
      where: and(
        eq(artifactsTable.isHidden, false),
        eq(artifactsTable.type, "fitness_streak"),
        ...(ownedIds.length > 0 ? [sql`${artifactsTable.id} NOT IN (${sql.join(ownedIds.map(id => sql`${id}`), sql`, `)})`] : []),
        ...(rarity ? [eq(artifactsTable.rarity, rarity)] : []),
      ),
    });

    if (eligibleArtifacts.length === 0) {
      // Fallback: grant bonus coins
      await db.update(playersTable)
        .set({ coins: sql`${playersTable.coins} + 200` })
        .where(eq(playersTable.id, playerId));
      return null;
    }

    const chosen = eligibleArtifacts[Math.floor(Math.random() * eligibleArtifacts.length)]!;
    await db.insert(playerArtifactsTable).values({ playerId, artifactId: chosen.id }).onConflictDoNothing();
    return { artifactId: chosen.id, artifactName: chosen.name };
  }

  let eggAdded = false;
  let artifactGranted: { artifactId: number; artifactName: string } | null = null;
  let streakFreezeGranted = false;
  let streakShieldGranted = false;

  // Handle bonus rewards
  if (reward.bonus === "rare_egg") {
    eggAdded = await tryAddEgg("Rare");
  } else if (reward.bonus === "epic_egg") {
    eggAdded = await tryAddEgg("Epic");
  } else if (reward.bonus === "artifact") {
    artifactGranted = await tryMintArtifact();
  } else if (reward.bonus === "streak_freeze") {
    await db.update(playersTable)
      .set({ streakFreezes: sql`${playersTable.streakFreezes} + 1` })
      .where(eq(playersTable.id, playerId));
    streakFreezeGranted = true;
  } else if (reward.bonus === "streak_shield") {
    await db.update(playersTable)
      .set({ streakShields: sql`${playersTable.streakShields} + 1` })
      .where(eq(playersTable.id, playerId));
    streakShieldGranted = true;
  } else if (reward.bonus === "rare_chest") {
    // Rare Chest: add Rare egg
    eggAdded = await tryAddEgg("Rare");
  } else if (reward.bonus === "epic_chest") {
    // Epic Chest: add Epic egg
    eggAdded = await tryAddEgg("Epic");
  } else if (reward.bonus === "legendary_chest") {
    // Legendary Chest: add Legendary egg + mint a legendary/mythic artifact
    eggAdded = await tryAddEgg("Legendary");
    artifactGranted = await tryMintArtifact("Legendary");
    if (!artifactGranted) {
      // Try any rarity if no Legendary artifact available
      artifactGranted = await tryMintArtifact();
    }
  }

  // Check and award badges (daily devotee at 7-day streak)
  const newBadges = await checkAndAwardBadges(playerId, {
    dailyRewardStreak: newStreakDay,
  });

  // Auto-replenish shields if enabled and count dropped below threshold
  let autoReplenishTriggered = false;
  let shieldsAutoReplenished = 0;
  if (shieldConsumed) {
    const refreshed = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
    if (
      refreshed &&
      refreshed.autoReplenishShields &&
      (refreshed.streakShields ?? 0) < (refreshed.shieldAutoReplenishThreshold ?? 1)
    ) {
      const deficit = (refreshed.shieldAutoReplenishThreshold ?? 1) - (refreshed.streakShields ?? 0);
      const affordable = Math.floor((refreshed.coins ?? 0) / STREAK_SHIELD_COST);
      const toBuy = Math.min(deficit, affordable);
      if (toBuy > 0) {
        const totalCost = toBuy * STREAK_SHIELD_COST;
        await db.update(playersTable)
          .set({
            coins: sql`${playersTable.coins} - ${totalCost}`,
            streakShields: sql`${playersTable.streakShields} + ${toBuy}`,
          })
          .where(eq(playersTable.id, playerId));
        autoReplenishTriggered = true;
        shieldsAutoReplenished = toBuy;
      }
    }
  }

  res.json({
    ok: true,
    day: reward.day,
    coinsGranted,
    xpGranted,
    streakDay: newStreakDay,
    newStreakDay,
    eggAdded,
    artifactGranted,
    streakFreezeGranted,
    streakShieldGranted,
    bonus: reward.bonus ?? null,
    streakBroken,
    shieldConsumed,
    autoReplenishTriggered,
    shieldsAutoReplenished,
    newBadges: newBadges.map(b => ({ key: b.key, name: b.name, icon: b.icon, tier: b.tier })),
  });
});

// POST /players/me/streak-shield/buy — purchase one Streak Shield for coins
router.post("/players/me/streak-shield/buy", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const coins = player.coins ?? 0;
  if (coins < STREAK_SHIELD_COST) {
    res.status(400).json({ error: "not_enough_coins" });
    return;
  }

  const updated = await db.update(playersTable)
    .set({
      coins: sql`${playersTable.coins} - ${STREAK_SHIELD_COST}`,
      streakShields: sql`${playersTable.streakShields} + 1`,
    })
    .where(and(eq(playersTable.id, playerId), gte(playersTable.coins, STREAK_SHIELD_COST)))
    .returning({ coins: playersTable.coins, streakShields: playersTable.streakShields });

  if (updated.length === 0) {
    res.status(400).json({ error: "not_enough_coins" });
    return;
  }

  const row = updated[0]!;
  res.json({
    ok: true,
    streakShields: row.streakShields,
    coinsSpent: STREAK_SHIELD_COST,
    coinsRemaining: row.coins,
  });
});

// PATCH /players/me/shield-auto-replenish — update auto-replenish preference
router.patch("/players/me/shield-auto-replenish", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const { autoReplenishShields, shieldAutoReplenishThreshold } = req.body as {
    autoReplenishShields?: boolean;
    shieldAutoReplenishThreshold?: number;
  };

  const updates: Partial<{ autoReplenishShields: boolean; shieldAutoReplenishThreshold: number }> = {};
  if (typeof autoReplenishShields === "boolean") {
    updates.autoReplenishShields = autoReplenishShields;
  }
  if (typeof shieldAutoReplenishThreshold === "number") {
    if (shieldAutoReplenishThreshold < 1 || shieldAutoReplenishThreshold > 10) {
      res.status(400).json({ error: "threshold_out_of_range" });
      return;
    }
    updates.shieldAutoReplenishThreshold = shieldAutoReplenishThreshold;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "no_fields_to_update" });
    return;
  }

  const updated = await db.update(playersTable)
    .set(updates)
    .where(eq(playersTable.id, playerId))
    .returning({
      autoReplenishShields: playersTable.autoReplenishShields,
      shieldAutoReplenishThreshold: playersTable.shieldAutoReplenishThreshold,
    });

  if (!updated.length) { res.status(404).json({ error: "Player not found" }); return; }
  const row = updated[0]!;
  res.json({ ok: true, autoReplenishShields: row.autoReplenishShields, shieldAutoReplenishThreshold: row.shieldAutoReplenishThreshold });
});

router.get("/players/me", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(player);
});

router.get("/players/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetPlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(player);
});

// GET /players/:id/profile — public profile with artifact showcase (top 3 featured/equipped)
router.get("/players/:id/profile", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.params.id);
  if (isNaN(playerId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const viewerId = req.playerId;
  const [player, ownedArtifacts] = await Promise.all([
    db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
    db.query.playerArtifactsTable.findMany({
      where: eq(playerArtifactsTable.playerId, playerId),
      orderBy: (t, { desc: d, sql: s }) => [d(t.isFeatured), s`${t.featuredOrder} asc nulls last`, d(t.isEquipped), d(t.earnedAt)],
    }),
  ]);

  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  // Enforce block/hidden/minor privacy: if the target is blocked by or has
  // blocked the viewer, is location-hidden, or is a minor, treat as not found.
  if (viewerId && viewerId !== playerId) {
    const hiddenIds = await getHiddenPlayerIds(viewerId);
    if (
      hiddenIds.includes(playerId) ||
      player.locationVisibility === "hidden" ||
      player.isMinor === true
    ) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
  }

  // Mutual workout partners: third players who have logged a co-workout with
  // BOTH the viewer and this profile. Mirrors the same trust signal exposed
  // by /social/players/:id/profile and the invite/search rows. The shared
  // helper already filters out blocked/hidden/minor partners and caps the
  // preview list. Skipped when viewing your own profile.
  let mutualWorkoutPartners: MutualWorkoutPartner[] = [];
  if (viewerId && viewerId !== playerId) {
    const hiddenIds = await getHiddenPlayerIds(viewerId);
    const grouped = await loadMutualWorkoutPartnersForViewer(viewerId, [playerId], hiddenIds);
    mutualWorkoutPartners = grouped.get(playerId) ?? [];
  }

  // Fetch top 3 featured/equipped artifacts for the public showcase strip
  const showcaseOwned = ownedArtifacts.slice(0, 3);
  let showcaseArtifacts: Array<{ id: number; name: string; rarity: string; imageSlug: string; isFeatured: boolean; isEquipped: boolean }> = [];

  if (showcaseOwned.length > 0) {
    const artifactIds = showcaseOwned.map(o => o.artifactId);
    const artifacts = await db.query.artifactsTable.findMany({
      where: (t, { inArray }) => inArray(t.id, artifactIds),
    });
    const artifactMap = new Map(artifacts.map(a => [a.id, a]));
    showcaseArtifacts = showcaseOwned.map(o => {
      const a = artifactMap.get(o.artifactId);
      if (!a) return null;
      return { id: a.id, name: a.name, rarity: a.rarity, imageSlug: a.imageSlug, isFeatured: o.isFeatured, isEquipped: o.isEquipped };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }

  res.json({
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    rank: player.rank,
    level: player.level,
    currentStreak: player.currentStreak,
    totalWorkouts: player.totalWorkouts,
    isVerified: player.isVerified,
    isSuspended: player.isSuspended,
    artifactShowcase: showcaseArtifacts,
    artifactCount: ownedArtifacts.length,
    mutualWorkoutPartners,
  });
});

router.patch("/players/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = UpdatePlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = UpdatePlayerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const updated = await db.update(playersTable).set(body.data).where(eq(playersTable.id, params.data.id)).returning();
  if (!updated.length) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(updated[0]);
});

router.get("/players/:id/dashboard", requireAuth, attachPlayer, async (req, res) => {
  const params = GetPlayerDashboardParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  if (params.data.id !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  let player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  // ── No-shame streak recovery logic ───────────────────────────────────────
  if (player.lastActiveDate) {
    const lastActive = new Date(player.lastActiveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1 && !player.streakAtRisk) {
      // One day missed → mark streak at risk (soft pause, not reset)
      const [updated] = await db.update(playersTable)
        .set({ streakAtRisk: true })
        .where(eq(playersTable.id, params.data.id))
        .returning();
      player = updated;
    } else if (diffDays >= 2 && player.currentStreak > 0) {
      // Two+ days missed → reset streak but preserve all XP, add encouraging recovery message
      const [updated] = await db.update(playersTable)
        .set({
          currentStreak: 0,
          streakAtRisk: false,
          recoveryMessage: "Welcome back! Your XP and progress are safe — let's get moving again. Every step forward counts. 💪",
        })
        .where(eq(playersTable.id, params.data.id))
        .returning();
      player = updated;
    }
  }

  const [hatchlings, recentComps, activeEvents, activeEggs, recentActivities, earnedBadges] = await Promise.all([
    db.query.hatchlingsTable.findMany({ where: eq(hatchlingsTable.playerId, params.data.id) }),
    db.query.competitionsTable.findMany({
      where: eq(competitionsTable.playerId, params.data.id),
      orderBy: [desc(competitionsTable.createdAt)],
      limit: 5,
    }),
    db.query.liveEventsTable.findMany({
      where: eq(liveEventsTable.status, "active"),
      limit: 3,
    }),
    db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, params.data.id), eq(eggsTable.isHatched, false)),
    }),
    db.query.fitnessActivitiesTable.findMany({
      where: eq(fitnessActivitiesTable.playerId, params.data.id),
      orderBy: [desc(fitnessActivitiesTable.createdAt)],
      limit: 5,
    }),
    db.query.playerBadgesTable.findMany({
      where: eq(playerBadgesTable.playerId, params.data.id),
      orderBy: (t, { desc: d }) => [d(t.earnedAt)],
    }),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayActivities = recentActivities.filter(a => a.createdAt >= todayStart);
  const todaySteps = todayActivities.filter(a => a.type === "steps").reduce((s, a) => s + a.value, 0);
  const todayXp = todayActivities.reduce((s, a) => s + a.fitnessXpEarned, 0);
  const dailyStepGoal = player.dailyStepGoal ?? 8000;

  const topHatchling = hatchlings.sort((a, b) => b.level - a.level)[0] ?? null;
  const wins = recentComps.filter(c => c.rank === 1).length;
  const winRate = recentComps.length > 0 ? wins / recentComps.length : 0;

  const readyEggs = activeEggs.filter(e => e.stepsProgress >= e.stepsRequired);
  const eggsFormatted = activeEggs.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    hatchedAt: e.hatchedAt?.toISOString() ?? null,
    progressPct: Math.min(100, Math.round((e.stepsProgress / e.stepsRequired) * 100)),
    isReady: e.stepsProgress >= e.stepsRequired,
  }));

  // XP level progress
  const levelProgress = computeLevelProgress(player.xp);

  // Badge showcase
  const showcaseBadges = earnedBadges
    .filter(b => b.isShowcase)
    .map(b => ({ ...b, ...BADGE_MAP[b.badgeKey], earnedAt: b.earnedAt.toISOString() }));

  const recentBadges = earnedBadges.slice(0, 3).map(b => ({
    ...BADGE_MAP[b.badgeKey],
    earnedAt: b.earnedAt.toISOString(),
  }));

  // Daily reward status
  const now = new Date();
  const lastClaimed = player.lastRewardClaimedAt;
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dailyAlreadyClaimed = lastClaimed ? isSameDay(new Date(lastClaimed), now) : false;
  const nextRewardStreak = dailyAlreadyClaimed ? player.dailyRewardStreak : player.dailyRewardStreak + 1;
  const todayReward = getDailyReward(nextRewardStreak);

  res.json({
    player,
    hatchlingCount: hatchlings.length,
    totalWins: player.totalWins,
    winRate,
    topHatchling,
    recentCompetitions: recentComps.map(c => ({
      ...c,
      playerName: player.username,
      hatchlingName: hatchlings.find(h => h.id === c.hatchlingId)?.name ?? "Unknown",
    })),
    activeEvents: activeEvents.map(e => ({
      ...e,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
    })),
    // Fitness summary
    fitness: {
      currentStreak: player.currentStreak,
      fitnessXp: player.fitnessXp,
      totalSteps: player.totalSteps,
      todaySteps,
      todayXp,
      dailyStepGoal,
      stepGoalPct: Math.min(100, Math.round((todaySteps / dailyStepGoal) * 100)),
      fitnessRealm: player.fitnessRealm,
      waterCups: player.waterCups,
    },
    // Egg summary
    eggs: {
      active: eggsFormatted,
      readyCount: readyEggs.length,
      totalActive: activeEggs.length,
    },
    // Progression
    levelProgress,
    prestige: player.prestige ?? 0,
    title: player.title ?? null,
    streakFreezes: player.streakFreezes ?? 0,
    badgeCount: earnedBadges.length,
    showcaseBadges,
    recentBadges,
    dailyReward: {
      alreadyClaimed: dailyAlreadyClaimed,
      reward: todayReward,
      streak: player.dailyRewardStreak,
    },
  });
});

export default router;
