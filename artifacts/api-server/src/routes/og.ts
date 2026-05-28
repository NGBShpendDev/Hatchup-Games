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
  };
  if (row.isFlagged) return { post, author: null };
  const authorRow = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, row.playerId),
  });
  const author: OgAuthorInput | null = authorRow
    ? { displayName: authorRow.displayName, username: authorRow.username }
    : null;
  return { post, author };
};

const router = createOgRouter(defaultLoader);

export default router;
export { createOgRouter };
export type { OgLoadResult, OgPostLoader };
