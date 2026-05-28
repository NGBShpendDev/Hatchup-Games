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
