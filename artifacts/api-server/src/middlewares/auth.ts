import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      playerId?: number;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.clerkUserId = userId;
  next();
};

export const attachPlayer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) {
    res.status(404).json({ error: "Player profile not found. Please complete registration." });
    return;
  }
  req.playerId = player.id;
  next();
};

export const requirePlayerOwnership = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const requestedId =
    req.params.playerId ??
    req.query.playerId ??
    req.body?.playerId;

  if (requestedId === undefined || requestedId === null) {
    next();
    return;
  }

  const requestedPlayerId = Number(requestedId);
  if (isNaN(requestedPlayerId)) {
    res.status(400).json({ error: "Invalid playerId" });
    return;
  }

  if (req.playerId !== requestedPlayerId) {
    res.status(403).json({ error: "Forbidden: you can only access your own data" });
    return;
  }
  next();
};
