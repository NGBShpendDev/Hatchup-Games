import { db } from "@workspace/db";
import { clubsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createClubOgRouter, type OgClubLoader } from "./og-router";
import type { OgClubInput } from "./og-render";

const clubLoader: OgClubLoader = async (id: number): Promise<OgClubInput | null> => {
  try {
    const row = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, id) });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      emblem: row.emblem,
      memberCount: row.memberCount,
      maxMembers: row.maxMembers,
      level: row.level,
      totalWins: row.totalWins,
    };
  } catch {
    return null;
  }
};

const router = createClubOgRouter(clubLoader);

export default router;
