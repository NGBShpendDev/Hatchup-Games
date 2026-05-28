import { db } from "@workspace/db";
import { postsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createOgRouter, type OgLoadResult, type OgPostLoader } from "./og-router";
import type { OgPostInput, OgAuthorInput } from "./og-render";

const defaultLoader: OgPostLoader = async (id: number): Promise<OgLoadResult> => {
  const row = await db.query.postsTable.findFirst({ where: eq(postsTable.id, id) });
  if (!row) return { post: null, author: null };
  const post: OgPostInput = {
    postType: row.postType,
    content: row.content,
    mediaUrl: row.mediaUrl,
    isFlagged: row.isFlagged,
    deletedAt: row.deletedAt,
  };
  // Posts that are flagged or soft-deleted must never expose their content
  // or author through link unfurls. Skip the author lookup entirely.
  if (row.isFlagged || row.deletedAt != null) return { post, author: null };
  // Author lookup is best-effort — if the player row can't be read (e.g.
  // unrelated schema drift on a column we don't care about) we still want
  // to render a card with fallback author info.
  try {
    const authorRow = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, row.playerId),
    });
    const author: OgAuthorInput | null = authorRow
      ? {
          displayName: authorRow.displayName,
          username: authorRow.username,
          avatarUrl: authorRow.avatarUrl,
          isSuspended: authorRow.isSuspended,
        }
      : null;
    return { post, author };
  } catch {
    return { post, author: null };
  }
};

const router = createOgRouter(defaultLoader);

export default router;
