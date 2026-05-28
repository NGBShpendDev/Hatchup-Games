import { Router } from "express";
import { db } from "@workspace/db";
import { playerBadgesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { BADGE_DEFINITIONS, BADGE_MAP } from "../services/badgeService.ts";

const router = Router();

/** GET /badges — all badge definitions (public catalog) */
router.get("/badges", async (req, res) => {
  res.json(BADGE_DEFINITIONS.map(b => ({
    ...b,
    description: b.isSecret ? "???" : b.description,
  })));
});

/** GET /players/:id/badges — player's earned badges */
router.get("/players/:id/badges", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.params.id);
  if (playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const earned = await db.query.playerBadgesTable.findMany({
    where: eq(playerBadgesTable.playerId, playerId),
    orderBy: (t, { desc }) => [desc(t.earnedAt)],
  });

  const result = earned.map(e => {
    const def = BADGE_MAP[e.badgeKey];
    return {
      ...e,
      earnedAt: e.earnedAt.toISOString(),
      ...def,
    };
  });

  res.json(result);
});

/** POST /players/:id/badges/showcase — set up to 3 showcase badges */
router.post("/players/:id/badges/showcase", requireAuth, attachPlayer, async (req, res) => {
  const playerId = Number(req.params.id);
  if (playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { badgeKeys } = req.body as { badgeKeys: string[] };
  if (!Array.isArray(badgeKeys) || badgeKeys.length > 3) {
    res.status(400).json({ error: "badgeKeys must be an array of up to 3 keys" }); return;
  }

  // Verify player owns these badges
  for (const key of badgeKeys) {
    const owned = await db.query.playerBadgesTable.findFirst({
      where: and(eq(playerBadgesTable.playerId, playerId), eq(playerBadgesTable.badgeKey, key)),
    });
    if (!owned) { res.status(400).json({ error: `Badge ${key} not earned` }); return; }
  }

  // Clear all showcase flags, then set selected
  await db.update(playerBadgesTable)
    .set({ isShowcase: false })
    .where(eq(playerBadgesTable.playerId, playerId));

  for (const key of badgeKeys) {
    await db.update(playerBadgesTable)
      .set({ isShowcase: true })
      .where(and(eq(playerBadgesTable.playerId, playerId), eq(playerBadgesTable.badgeKey, key)));
  }

  res.json({ success: true, showcaseBadges: badgeKeys });
});

export default router;
