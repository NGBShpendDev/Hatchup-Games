import { Router } from "express";
import { db } from "@workspace/db";
import { personalRecordsTable, fitnessActivitiesTable, playersTable } from "@workspace/db";
import { eq, and, gte, sum } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";

const router = Router();

// GET /records/:playerId — returns all PRs + strength lifetime totals for the player
router.get("/records/:playerId", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.params.playerId);
  if (isNaN(playerId)) { res.status(400).json({ error: "Invalid playerId" }); return; }
  if (playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const records = await db.query.personalRecordsTable.findMany({
    where: eq(personalRecordsTable.playerId, playerId),
  });

  // Compute monthly running miles for ENDURANCE_KING badge
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthlyRunActivities = await db.query.fitnessActivitiesTable.findMany({
    where: and(
      eq(fitnessActivitiesTable.playerId, playerId),
      eq(fitnessActivitiesTable.type, "running"),
      gte(fitnessActivitiesTable.createdAt, monthStart),
    ),
  });
  // Use persisted distance when available; fall back to minute proxy only for legacy rows
  const monthlyRunMiles = monthlyRunActivities.reduce(
    (sum, a) => sum + (a.distanceMiles ?? a.value * 0.1),
    0,
  );

  res.json({
    personalRecords: records.map(r => ({
      ...r,
      achievedAt: r.achievedAt.toISOString(),
    })),
    strengthTotals: {
      totalReps:      player.totalReps      ?? 0,
      lifetimePushups: player.lifetimePushups ?? 0,
      lifetimeSquats:  player.lifetimeSquats  ?? 0,
      lifetimeBurpees: player.lifetimeBurpees ?? 0,
      lifetimePullups: player.lifetimePullups ?? 0,
      lifetimePlanks:  player.lifetimePlanks  ?? 0,
      lifetimeSitups:  player.lifetimeSitups  ?? 0,
    },
    monthlyRunMiles: Math.round(monthlyRunMiles * 10) / 10,
  });
});

export default router;
