import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { liveEventsTable, playersTable, eventParticipantsTable } from "@workspace/db";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
import { ListEventsQueryParams, GetLiveEventParams } from "@workspace/api-zod";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { applyHatchlingXp, getActivePalId } from "../services/hatchlingXp.ts";

// Live event entry-reward XP grant. Kept small and flat so it can't replace
// real progression — it exists so a level-up that crosses an evolution
// threshold can actually be triggered by an event entry.
const EVENT_JOIN_XP = 100;

const router = Router();

// Resolve the current player id from the Clerk session without requiring auth.
// Returns undefined when the request is unauthenticated or the player row
// doesn't exist yet (e.g. mid-onboarding).
async function optionalPlayerId(req: Parameters<typeof getAuth>[0]): Promise<number | undefined> {
  const auth = getAuth(req);
  if (!auth?.userId) return undefined;
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, auth.userId),
    columns: { id: true },
  });
  return player?.id;
}

// Map a DB row to the OpenAPI LiveEvent response shape.
// DB columns  : startsAt, endsAt, participants, reward (text)
// API contract: startTime, endTime, participantCount, rewardXp
function toApiEvent(
  e: typeof liveEventsTable.$inferSelect,
  hasJoined = false,
) {
  return {
    id:               e.id,
    name:             e.name,
    description:      e.description,
    type:             e.type,
    status:           e.status,
    startTime:        e.startsAt.toISOString(),
    endTime:          e.endsAt.toISOString(),
    participantCount: e.participants,
    rewardXp:         e.reward != null ? (parseInt(e.reward, 10) || null) : null,
    rewardCoins:      null,
    imageUrl:         e.imageUrl ?? null,
    isFeatured:       e.isFeatured,
    color:            e.color ?? null,
    hasJoined,
  };
}

// Returns the full participation history for the authenticated player,
// ordered most-recent-first. Each row joins event_participants with
// live_events so the client gets name/type/status/reward in one shot.
router.get("/players/me/events", requireAuth, attachPlayer, async (req, res) => {
  const rows = await db
    .select({
      eventId:   eventParticipantsTable.eventId,
      joinedAt:  eventParticipantsTable.joinedAt,
      eventName: liveEventsTable.name,
      eventType: liveEventsTable.type,
      status:    liveEventsTable.status,
      xpEarned:  liveEventsTable.reward,
      startTime: liveEventsTable.startsAt,
      endTime:   liveEventsTable.endsAt,
      imageUrl:  liveEventsTable.imageUrl,
    })
    .from(eventParticipantsTable)
    .innerJoin(liveEventsTable, eq(eventParticipantsTable.eventId, liveEventsTable.id))
    .where(eq(eventParticipantsTable.playerId, req.playerId!))
    .orderBy(desc(eventParticipantsTable.joinedAt));

  res.json(rows.map(r => ({
    eventId:   r.eventId,
    eventName: r.eventName,
    eventType: r.eventType,
    status:    r.status,
    joinedAt:  r.joinedAt.toISOString(),
    xpEarned:  r.xpEarned != null ? (parseInt(r.xpEarned, 10) || null) : null,
    startTime: r.startTime.toISOString(),
    endTime:   r.endTime.toISOString(),
    imageUrl:  r.imageUrl ?? null,
  })));
});

router.get("/events", async (req, res) => {
  const query = ListEventsQueryParams.safeParse({ status: req.query.status as string | undefined });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  let results = await db.query.liveEventsTable.findMany();
  if (query.data.status) results = results.filter(e => e.status === query.data.status);

  const pid = await optionalPlayerId(req);

  let joinedSet = new Set<number>();
  if (pid && results.length > 0) {
    const eventIds = results.map(e => e.id);
    const rows = await db
      .select({ eventId: eventParticipantsTable.eventId })
      .from(eventParticipantsTable)
      .where(
        and(
          eq(eventParticipantsTable.playerId, pid),
          inArray(eventParticipantsTable.eventId, eventIds),
        ),
      );
    joinedSet = new Set(rows.map(r => r.eventId));
  }

  res.json(results.map(e => toApiEvent(e, joinedSet.has(e.id))));
});

router.get("/events/:id", async (req, res) => {
  const params = GetLiveEventParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const event = await db.query.liveEventsTable.findFirst({ where: eq(liveEventsTable.id, params.data.id) });
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const pid = await optionalPlayerId(req);
  let hasJoined = false;
  if (pid) {
    const row = await db.query.eventParticipantsTable.findFirst({
      where: and(
        eq(eventParticipantsTable.eventId, event.id),
        eq(eventParticipantsTable.playerId, pid),
      ),
      columns: { eventId: true },
    });
    hasJoined = !!row;
  }

  res.json(toApiEvent(event, hasJoined));
});

// Server-side event join. Idempotent — uses the unique
// (event_id, player_id) constraint on `event_participants` to guarantee
// that XP grants and the participant counter bump fire exactly once per
// player per event. Repeated calls return 200 with xpEarned=0.
//
// On first join the route grants a flat EVENT_JOIN_XP bump to the
// player's active hatchling (or first owned Pal) via applyHatchlingXp,
// and increments the event's participant counter. The
// frontend refetches hatchling state on success so the centralized
// EvolutionShareProvider watcher can surface the share prompt when this
// entry pushes a Pal across an evolution threshold.
router.post("/events/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const params = GetLiveEventParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const event = await db.query.liveEventsTable.findFirst({ where: eq(liveEventsTable.id, params.data.id) });
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  if (event.status !== "active") { res.status(409).json({ error: "Event not currently active" }); return; }

  // Idempotency gate: insert the participant row first. If a row already
  // exists for (event, player), onConflictDoNothing returns no rows and
  // we skip XP grants + the participants bump entirely.
  const inserted = await db
    .insert(eventParticipantsTable)
    .values({ eventId: event.id, playerId: req.playerId! })
    .onConflictDoNothing({
      target: [eventParticipantsTable.eventId, eventParticipantsTable.playerId],
    })
    .returning();

  if (inserted.length === 0) {
    res.json({
      eventId: event.id,
      joinedAt: new Date().toISOString(),
      xpEarned: 0,
      coinsEarned: 0,
    });
    return;
  }

  // Pick the target Pal — active hatchling first, otherwise the player's
  // first owned hatchling. If they have none, the join still succeeds
  // (no XP applied) so the UI can show the join confirmation.
  const palId = await getActivePalId(req.playerId!);
  const xpResult = palId ? await applyHatchlingXp(palId, EVENT_JOIN_XP) : null;

  // Derive the participant counter from the dedup table to keep it
  // race-safe under concurrent first-joins.
  await db
    .update(liveEventsTable)
    .set({
      participants: sql<number>`(
        select count(*)::int from ${eventParticipantsTable}
        where ${eventParticipantsTable.eventId} = ${event.id}
      )`,
    })
    .where(eq(liveEventsTable.id, event.id));

  res.json({
    eventId: event.id,
    joinedAt: inserted[0].joinedAt.toISOString(),
    xpEarned: xpResult ? xpResult.xpDelta : 0,
    coinsEarned: 0,
  });
});

export default router;
