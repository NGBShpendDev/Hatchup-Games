import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Block social write surfaces for accounts that an admin has suspended.
 *
 * Suspended accounts can still sign in and read, but cannot post, comment,
 * react, repost, follow, or send group messages. Apply AFTER `attachPlayer`.
 */
export const blockSuspendedSocialWrite = async (
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
    columns: { isSuspended: true },
  });
  if (player?.isSuspended) {
    res.status(403).json({
      error: "account_suspended",
      message:
        "This account has been suspended by a moderator. Please contact support if you believe this is a mistake.",
    });
    return;
  }
  next();
};
