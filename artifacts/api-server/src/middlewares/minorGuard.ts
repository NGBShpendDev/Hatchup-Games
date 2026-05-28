import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Block social write surfaces for accounts flagged as minors.
 *
 * Safer defaults for minors: no public posts, no DMs/group chat,
 * no follow actions, no exact-location sharing. Reads stay open.
 * Apply AFTER `attachPlayer`.
 */
export const blockMinorSocialWrite = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.playerId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, req.playerId),
    columns: { isMinor: true },
  });
  if (player?.isMinor) {
    res.status(403).json({
      error: "minor_account_restricted",
      message:
        "This account has minor-account safety defaults enabled. A parent or guardian must adjust safety settings to use this feature.",
    });
    return;
  }
  next();
};
