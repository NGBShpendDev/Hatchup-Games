import { Router } from "express";
import { db } from "@workspace/db";
import { shareEventsTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";

const router = Router();

const ShareEventBody = z.object({
  contentType: z.enum(["player", "club", "post"]),
  contentId: z.string().min(1).max(256),
  action: z.enum(["dialog_opened", "native_share", "copy_link"]),
});

router.post(
  "/analytics/share",
  requireAuth,
  attachPlayer,
  async (req, res) => {
    const parsed = ShareEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    await db.insert(shareEventsTable).values({
      playerId: req.playerId!,
      contentType: parsed.data.contentType,
      contentId: parsed.data.contentId,
      action: parsed.data.action,
    });

    res.status(204).end();
  },
);

export default router;
