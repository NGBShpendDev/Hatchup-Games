/**
 * Pure helper for picking the top `limit` comments to preview on a post.
 *
 * Ordering rules:
 *   1. Most-liked first.
 *   2. Ties (including the no-likes fallback) broken by recency, newer first.
 */
export function selectTopComments<T extends { id: number; createdAt: Date }>(
  comments: readonly T[],
  likeCountByComment: ReadonlyMap<number, number>,
  limit = 3,
): T[] {
  return [...comments]
    .sort((a, b) => {
      const likeDiff = (likeCountByComment.get(b.id) ?? 0) - (likeCountByComment.get(a.id) ?? 0);
      if (likeDiff !== 0) return likeDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, limit);
}

/**
 * Mark the lead comment as the "Top comment" only when it actually owes
 * its position to likes (not just recency). `sortedComments` is expected
 * to be the output of `selectTopComments`, so the first entry is the
 * most-liked. Returns true only at index 0 and only when that comment has
 * at least one like — every other position and the all-zero-likes case
 * return false.
 */
export function isTopCommentAt<T extends { id: number }>(
  index: number,
  sortedComments: readonly T[],
  likeCountByComment: ReadonlyMap<number, number>,
): boolean {
  if (index !== 0) return false;
  const lead = sortedComments[0];
  if (!lead) return false;
  return (likeCountByComment.get(lead.id) ?? 0) > 0;
}
