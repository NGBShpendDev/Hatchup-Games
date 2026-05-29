import { db } from "@workspace/db";
import { clubsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createClubOgRouter, type OgClubLoader } from "./og-router.ts";
import type { OgClubInput } from "./og-render.ts";

// Map the optional free-form `clubs.color` (a single hex) to a two-stop accent
// gradient used by the OG share card. When the club has no color set we fall
// through to the brand default by leaving accent undefined.
function clubColorToAccent(
  color: string | null,
): { accentId: string; accent: { from: string; to: string } } | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return null;
  return {
    accentId: `club:${trimmed.toLowerCase()}`,
    accent: { from: trimmed, to: trimmed },
  };
}

const clubLoader: OgClubLoader = async (id: number): Promise<OgClubInput | null> => {
  try {
    const row = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, id) });
    if (!row) return null;
    // Private clubs must not be discoverable via public OG routes —
    // mirrors the membership gate in GET /clubs/:id.
    if (!row.isPublic) return null;
    const accent = clubColorToAccent(row.color);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      emblem: row.emblem,
      memberCount: row.memberCount,
      maxMembers: row.maxMembers,
      level: row.level,
      totalWins: row.totalWins,
      accentId: accent?.accentId ?? null,
      accent: accent?.accent ?? null,
    };
  } catch {
    return null;
  }
};

const router = createClubOgRouter(clubLoader);

export default router;
