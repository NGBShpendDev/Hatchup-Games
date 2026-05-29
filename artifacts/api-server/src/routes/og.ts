import { db } from "@workspace/db";
import { postsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createOgRouter, type OgLoadResult, type OgPostLoader } from "./og-router.ts";
import type { OgPostInput, OgAuthorInput } from "./og-render.ts";
import { getEntitlement } from "../services/entitlement.ts";
import { resolveAccentColor, resolveAccentColorId } from "../services/accentColors.ts";

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
    if (!authorRow) return { post, author: null };
    // Apply the same visibility gates as the authenticated social permalink:
    // posts from hidden-visibility or minor accounts must not be surfaced via
    // the public OG routes (mirrors isPlayerVisibleToViewer in social.ts).
    if (authorRow.locationVisibility === "hidden" || authorRow.isMinor) {
      return { post: null, author: null };
    }
    // Resolve accent color server-side using the author's entitlement tier so
    // a free player can't paint share cards with a premium-only gradient by
    // patching `share_accent_color` directly.
    const tier = getEntitlement(authorRow).tier;
    const accentId = resolveAccentColorId(authorRow.shareAccentColor, tier);
    const accent = resolveAccentColor(authorRow.shareAccentColor, tier);
    const author: OgAuthorInput = {
      displayName: authorRow.displayName,
      username: authorRow.username,
      avatarUrl: authorRow.avatarUrl,
      isSuspended: authorRow.isSuspended,
      accentId,
      accent,
    };
    return { post, author };
  } catch {
    return { post, author: null };
  }
};

const router = createOgRouter(defaultLoader);

export default router;
