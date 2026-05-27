import { Router } from "express";
import { db } from "@workspace/db";
import { liveEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListEventsQueryParams, GetLiveEventParams } from "@workspace/api-zod";

const router = Router();

router.get("/events", async (req, res) => {
  const query = ListEventsQueryParams.safeParse({ status: req.query.status as string | undefined });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  let results = await db.query.liveEventsTable.findMany();
  if (query.data.status) results = results.filter(e => e.status === query.data.status);

  res.json(results.map(e => ({ ...e, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString() })));
});

router.get("/events/:id", async (req, res) => {
  const params = GetLiveEventParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const event = await db.query.liveEventsTable.findFirst({ where: eq(liveEventsTable.id, params.data.id) });
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  res.json({ ...event, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() });
});

export default router;
