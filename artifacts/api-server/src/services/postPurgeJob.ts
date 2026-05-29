import { db } from "@workspace/db";
import {
  postsTable,
  postReactionsTable,
  postCommentsTable,
  postCommentReactionsTable,
  postRepostsTable,
  postViewsTable,
} from "@workspace/db";
import { and, lt, isNotNull, inArray, eq } from "drizzle-orm";
import { logger } from "../lib/logger.ts";
import { ObjectStorageService } from "../lib/objectStorage.ts";

const objectStorageService = new ObjectStorageService();

const RETENTION_DAYS = 30;
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 60 * 1000;

export { RETENTION_DAYS };

/**
 * Hard-delete the given posts (and all dependent rows). Shared by the
 * scheduled retention job and the admin "purge now" action so they behave
 * identically.
 */
export async function hardDeletePosts(ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  // Collect media URLs before deleting rows so we can purge storage objects.
  // Any post whose soft-delete path already removed the object will simply
  // encounter a not-found error inside tryDeleteObject, which is swallowed.
  const postRows = await db
    .select({ id: postsTable.id, mediaUrl: postsTable.mediaUrl })
    .from(postsTable)
    .where(inArray(postsTable.id, ids));
  const mediaUrls = postRows.map(r => r.mediaUrl).filter((u): u is string => !!u);

  const comments = await db
    .select({ id: postCommentsTable.id })
    .from(postCommentsTable)
    .where(inArray(postCommentsTable.postId, ids));
  const commentIds = comments.map(c => c.id);
  if (commentIds.length) {
    await db
      .delete(postCommentReactionsTable)
      .where(inArray(postCommentReactionsTable.commentId, commentIds));
  }

  await db.delete(postCommentsTable).where(inArray(postCommentsTable.postId, ids));
  await db.delete(postReactionsTable).where(inArray(postReactionsTable.postId, ids));
  await db.delete(postRepostsTable).where(inArray(postRepostsTable.postId, ids));
  await db.delete(postViewsTable).where(inArray(postViewsTable.postId, ids));

  for (const id of ids) {
    await db.delete(postsTable).where(eq(postsTable.id, id));
  }

  // Delete storage objects after the DB rows are gone. Errors are swallowed
  // by tryDeleteObject so a missing or already-deleted object won't fail the job.
  await Promise.all(mediaUrls.map(url => objectStorageService.tryDeleteObject(url)));
}

export async function purgeSoftDeletedPosts(now: Date = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expired = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(and(isNotNull(postsTable.deletedAt), lt(postsTable.deletedAt, cutoff)));

  if (expired.length === 0) return { purged: 0 };

  const ids = expired.map(r => r.id);
  await hardDeletePosts(ids);

  logger.info({ purged: ids.length, retentionDays: RETENTION_DAYS }, "post_purge_job_completed");
  return { purged: ids.length };
}

export function startPostPurgeJob(): void {
  logger.info({ retentionDays: RETENTION_DAYS }, "Post purge job started (6h interval)");

  const tick = async () => {
    try {
      await purgeSoftDeletedPosts();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "post_purge_job_failed");
    }
  };

  setTimeout(tick, INITIAL_DELAY_MS);
  setInterval(tick, TICK_INTERVAL_MS);
}
