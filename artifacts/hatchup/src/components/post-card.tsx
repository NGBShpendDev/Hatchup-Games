import { useEffect, useRef, useState } from "react";
import {
  useAddPostComment,
  useEditPostComment,
  useDeletePostComment,
  useRepostPost,
  useRecordPostView,
  useToggleCommentLike,
  useListCommentRevisions,
  getListCommentRevisionsQueryKey,
  useGetPostViewSeries,
  getGetSocialFeedQueryKey,
  getGetPostViewSeriesQueryKey,
  type FeedPost,
  type PostComment,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// Note: useEditPostComment / useDeletePostComment are consumed by CommentRow below.
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Heart, Flame, Zap, Dumbbell, MessageCircle, Share2, Trash2,
  Send, ChevronDown, ChevronUp, Award, Sparkles, Eye, Crown, Coins, Users, MoreHorizontal, Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { ReportBlockMenu } from "@/components/report-block-menu";
import { usePlayer } from "@/lib/playerContext";

export const POST_TYPES = [
  { value: "general", label: "General Update", icon: "💬" },
  { value: "gym_selfie", label: "Gym Selfie", icon: "💪" },
  { value: "evolution_reveal", label: "Evolution Reveal", icon: "✨" },
  { value: "streak_milestone", label: "Streak Milestone", icon: "🔥" },
  { value: "transformation", label: "Transformation", icon: "🦋" },
  { value: "workout_stat", label: "Workout Stat", icon: "📊" },
  { value: "hatch_moment", label: "Hatch Moment", icon: "🥚" },
  { value: "tournament_win", label: "Tournament Win", icon: "👑" },
];

export const REACTION_ICONS: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  like: { icon: <Heart className="w-4 h-4" />, label: "Like", color: "text-pink-500" },
  encourage: { icon: <Zap className="w-4 h-4" />, label: "Encourage", color: "text-yellow-500" },
  fire: { icon: <Flame className="w-4 h-4" />, label: "Fire", color: "text-orange-500" },
  flex: { icon: <Dumbbell className="w-4 h-4" />, label: "Flex", color: "text-blue-500" },
};

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function buildPostShareUrl(postId: number): string {
  if (typeof window === "undefined") return "";
  const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${window.location.origin}${basePath}/post/${postId}`;
}

function CommentEditedLabel({
  postId,
  commentId,
  updatedAt,
  testIdPrefix,
}: {
  postId: number;
  commentId: number;
  updatedAt: string;
  testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: revisions, isLoading } = useListCommentRevisions(postId, commentId, {
    query: {
      queryKey: getListCommentRevisionsQueryKey(postId, commentId),
      enabled: open,
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-[10px] text-muted-foreground italic hover:text-foreground underline-offset-2 hover:underline"
          title={`Edited ${new Date(updatedAt).toLocaleString()} — click to see history`}
          data-testid={`text-${testIdPrefix}-edited-${commentId}`}
        >
          (edited)
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-2"
        align="start"
        data-testid={`popover-${testIdPrefix}-history-${commentId}`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Edit history
        </p>
        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        {!isLoading && (!revisions || revisions.length === 0) && (
          <p className="text-xs text-muted-foreground">No previous versions.</p>
        )}
        {!isLoading && revisions && revisions.length > 0 && (
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {revisions.map(r => (
              <li
                key={r.id}
                className="bg-muted/50 rounded-lg p-2 space-y-1"
                data-testid={`revision-${commentId}-${r.id}`}
              >
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.editedAt).toLocaleString()}
                </p>
                <p className="text-xs break-words whitespace-pre-wrap">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CommentRow({
  comment,
  postId,
  playerId,
  onAnonymousAction,
  testIdPrefix = "comment",
}: {
  comment: PostComment;
  postId: number;
  playerId: number | null;
  onAnonymousAction?: () => void;
  testIdPrefix?: string;
}) {
  const isAnonymous = playerId == null;
  const isOwn = !isAnonymous && comment.playerId === playerId;
  const qc = useQueryClient();
  const { toast } = useToast();
  const toggleLike = useToggleCommentLike();
  const editComment = useEditPostComment();
  const deleteComment = useDeletePostComment();
  const [optimistic, setOptimistic] = useState<{ liked: boolean; count: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState(comment.content);

  const liked = optimistic?.liked ?? comment.myLiked ?? false;
  const count = optimistic?.count ?? comment.likeCount ?? 0;

  function invalidateFeed() {
    if (playerId != null) {
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId }) });
    }
    qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
  }

  async function handleLike() {
    if (isAnonymous) { onAnonymousAction?.(); return; }
    const nextLiked = !liked;
    const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));
    setOptimistic({ liked: nextLiked, count: nextCount });
    try {
      const result = await toggleLike.mutateAsync({
        id: postId,
        commentId: comment.id,
        data: { playerId: playerId! },
      });
      setOptimistic({ liked: result.liked, count: result.likeCount });
      invalidateFeed();
    } catch {
      setOptimistic(null);
      toast({ title: "Could not like comment", variant: "destructive" });
    }
  }

  function startEdit() {
    setEditingText(comment.content);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditingText(comment.content);
  }

  async function handleSaveEdit() {
    if (!playerId || !editingText.trim() || editingText.trim() === comment.content) return;
    try {
      await editComment.mutateAsync({
        id: postId,
        commentId: comment.id,
        data: { playerId, content: editingText.trim() },
      });
      invalidateFeed();
      setIsEditing(false);
      toast({ title: "Comment updated ✏️" });
    } catch (err: any) {
      if (err?.response?.status === 422) {
        toast({ title: "Keep it positive! 🌟", description: "That content doesn't meet our community guidelines.", variant: "destructive" });
      } else {
        toast({ title: "Could not update comment", variant: "destructive" });
      }
    }
  }

  async function handleDelete() {
    if (!playerId) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this comment?")) return;
    try {
      await deleteComment.mutateAsync({
        id: postId,
        commentId: comment.id,
        params: { playerId },
      });
      invalidateFeed();
      toast({ title: "Comment deleted" });
    } catch {
      toast({ title: "Could not delete comment", variant: "destructive" });
    }
  }

  return (
    <div className="flex gap-2" data-testid={`${testIdPrefix}-${comment.id}`}>
      <Avatar className="h-6 w-6 flex-shrink-0">
        <AvatarImage src={comment.authorAvatar ?? undefined} />
        <AvatarFallback className="text-[9px] bg-muted">{(comment.authorName ?? "?").substring(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="bg-muted/50 rounded-xl px-2.5 py-1.5 flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="font-bold text-[11px]">{comment.authorName}</span>
          {comment.isTopComment && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
              title="Most-liked reply on this post"
              data-testid={`badge-${testIdPrefix}-top-${comment.id}`}
            >
              <Trophy className="w-2.5 h-2.5" />
              Top comment
            </span>
          )}
          {comment.updatedAt && (
            <CommentEditedLabel
              postId={postId}
              commentId={comment.id}
              updatedAt={comment.updatedAt}
              testIdPrefix={testIdPrefix}
            />
          )}
          {isOwn && !isEditing && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={startEdit}
                className="text-[10px] font-bold text-muted-foreground hover:text-primary"
                aria-label="Edit comment"
                data-testid={`button-${testIdPrefix}-edit-${comment.id}`}
              >
                Edit
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                onClick={handleDelete}
                disabled={deleteComment.isPending}
                className="text-[10px] font-bold text-muted-foreground hover:text-destructive disabled:opacity-50"
                aria-label="Delete comment"
                data-testid={`button-${testIdPrefix}-delete-${comment.id}`}
              >
                Delete
              </button>
            </div>
          )}
          {!isOwn && !isAnonymous && !isEditing && (
            <div className="ml-auto">
              <ReportBlockMenu
                targetPlayerId={comment.playerId}
                targetName={comment.authorName ?? "this user"}
                contentType="comment"
                contentId={comment.id}
                trigger={
                  <button
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    aria-label="Report comment"
                    data-testid={`button-${testIdPrefix}-menu-${comment.id}`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                }
              />
            </div>
          )}
        </div>
        {isEditing ? (
          <form
            onSubmit={e => { e.preventDefault(); handleSaveEdit(); }}
            className="flex gap-1 pt-1"
          >
            <Input
              value={editingText}
              onChange={e => setEditingText(e.target.value)}
              className="h-7 text-xs rounded-full bg-background/60"
              maxLength={280}
              autoFocus
              data-testid={`input-${testIdPrefix}-edit-${comment.id}`}
            />
            <Button
              type="submit"
              size="sm"
              className="h-7 px-2 text-[10px] rounded-full"
              disabled={editComment.isPending || !editingText.trim() || editingText.trim() === comment.content}
              data-testid={`button-${testIdPrefix}-save-edit-${comment.id}`}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] rounded-full"
              onClick={cancelEdit}
              data-testid={`button-${testIdPrefix}-cancel-edit-${comment.id}`}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground break-words">{comment.content}</p>
        )}
      </div>
      {!isEditing && (
        <button
          onClick={handleLike}
          disabled={toggleLike.isPending}
          className={`flex items-center gap-0.5 px-2 rounded-full text-[11px] font-bold transition-colors self-center ${
            liked ? "text-pink-500" : "text-muted-foreground hover:text-pink-500"
          }`}
          aria-label={liked ? "Unlike comment" : "Like comment"}
          data-testid={`button-${testIdPrefix}-like-${comment.id}`}
        >
          <Heart className={`w-3 h-3 ${liked ? "fill-current" : ""}`} />
          {count > 0 && <span>{count}</span>}
        </button>
      )}
    </div>
  );
}

function ViewSparkline({
  postId,
  playerId,
  postCreatedAt,
}: {
  postId: number;
  playerId: number;
  postCreatedAt?: string | null;
}) {
  // Posts older than 24 hours auto-pick the 7-day window so creators of
  // slower-burn content (evolutions, transformations, tournament wins) can
  // see momentum that builds over days. Users can also tap to flip windows.
  const ageMs = postCreatedAt ? Date.now() - new Date(postCreatedAt).getTime() : 0;
  const autoWindow: "day" | "week" = ageMs > 24 * 3600_000 ? "week" : "day";
  const [window, setWindow] = useState<"day" | "week">(autoWindow);

  const { data } = useGetPostViewSeries(postId, { playerId, window }, {
    query: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      queryKey: getGetPostViewSeriesQueryKey(postId, { playerId, window }),
    },
  });
  const buckets = data?.buckets ?? [];
  if (buckets.length === 0 || (data?.total ?? 0) === 0) return null;

  const width = 44;
  const height = 14;
  const max = Math.max(1, ...buckets.map(b => b.views));
  const step = buckets.length > 1 ? width / (buckets.length - 1) : 0;
  const pts = buckets.map((b, i) => {
    const x = i * step;
    const y = height - (b.views / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const windowLabel = window === "week" ? "last 7 days" : "last 24 hours";
  const toggleLabel = window === "week" ? "last 24 hours" : "last 7 days";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setWindow(w => (w === "week" ? "day" : "week"));
      }}
      className="inline-flex items-center cursor-pointer bg-transparent border-0 p-0 m-0 leading-none"
      title={`${data?.total ?? 0} views in the ${windowLabel} — tap for ${toggleLabel}`}
      aria-label={`${data?.total ?? 0} views in the ${windowLabel}. Tap to switch to ${toggleLabel}.`}
      data-testid={`button-sparkline-views-${postId}`}
      data-window={window}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="text-primary/80"
        data-testid={`sparkline-views-${postId}`}
      >
        <polygon points={area} fill="currentColor" opacity="0.18" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export const viewedPostIds = new Set<number>();

export function PostCard({
  post,
  playerId,
  onReact,
  onDelete,
  onViewProfile,
  defaultShowComments = false,
  onAnonymousAction,
  disableViewTracking = false,
}: {
  post: FeedPost;
  playerId: number | null;
  onReact?: (postId: number, type: string) => void;
  onDelete?: (postId: number) => void;
  onViewProfile?: (pid: number) => void;
  defaultShowComments?: boolean;
  onAnonymousAction?: () => void;
  disableViewTracking?: boolean;
}) {
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [commentText, setCommentText] = useState("");
  const addComment = useAddPostComment();
  const repost = useRepostPost();
  const recordView = useRecordPostView();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAnonymous = playerId == null;
  const { player } = usePlayer();
  const isSuspended = !!player?.isSuspended;
  const suspendedTitle = "Your account is suspended. Contact support to appeal.";
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disableViewTracking) return;
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;
    const node = cardRef.current;
    if (!node) return;
    const postId = post.id;
    if (!Number.isFinite(postId) || postId <= 0) return;
    if (viewedPostIds.has(postId)) return;

    const DWELL_MS = 2500;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDwell = () => {
      if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    };

    const fire = () => {
      if (viewedPostIds.has(postId)) return;
      if (document.visibilityState === "hidden") return;
      viewedPostIds.add(postId);
      recordView.mutate(
        { id: postId },
        {
          onSuccess: (data) => {
            if (data?.counted) {
              if (playerId != null) {
                qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId }) });
                qc.invalidateQueries({
                  queryKey: getGetPostViewSeriesQueryKey(postId, { playerId }),
                });
              }
              qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
            }
          },
          onError: () => {
            viewedPostIds.delete(postId);
          },
        },
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (dwellTimer === null && !viewedPostIds.has(postId)) {
              dwellTimer = setTimeout(fire, DWELL_MS);
            }
          } else {
            clearDwell();
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(node);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearDwell();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearDwell();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // recordView is stable; only re-run when the tracked post or viewer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, playerId, disableViewTracking]);

  async function handleRepost() {
    if (isAnonymous) { onAnonymousAction?.(); return; }
    try {
      const result = await repost.mutateAsync({ id: post.id, data: { playerId: playerId! } });
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: playerId! }) });
      toast({ title: result.reposted ? "Reposted! 🔁" : "Repost removed" });
    } catch {
      toast({ title: "Could not repost", variant: "destructive" });
    }
  }

  const postTypeInfo = POST_TYPES.find(t => t.value === post.postType);

  async function handleNativeShare() {
    const url = buildPostShareUrl(post.id);
    const tag = postTypeInfo ? `${postTypeInfo.icon} ${postTypeInfo.label}\n` : "";
    const text = `${tag}${post.authorName} on HatchUp: ${post.content}`;
    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof (navigator as any).share === "function";
    if (canNativeShare) {
      try {
        await (navigator as any).share({ title: "HatchUp", text, url });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast({ title: "Link copied to clipboard! 📋", description: "Paste it anywhere to share." });
        return;
      } catch {}
    }
    toast({ title: "Could not share post", variant: "destructive" });
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (isAnonymous) { onAnonymousAction?.(); return; }
    if (isSuspended) return;
    if (!commentText.trim()) return;
    try {
      await addComment.mutateAsync({ id: post.id, data: { playerId: playerId!, content: commentText.trim() } });
      setCommentText("");
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: playerId! }) });
      toast({ title: "Comment added! 💬" });
    } catch (err: any) {
      if (err?.response?.status === 422) {
        toast({ title: "Keep it positive! 🌟", description: "That content doesn't meet our community guidelines.", variant: "destructive" });
      } else {
        toast({ title: "Could not add comment", variant: "destructive" });
      }
    }
  }

  function handleReactClick(type: string) {
    if (isAnonymous) { onAnonymousAction?.(); return; }
    if (isSuspended) return;
    onReact?.(post.id, type);
  }

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <GlassCard className="p-4 space-y-3 overflow-hidden">
          {/* Header */}
          <div className="flex items-start gap-3">
            <button onClick={() => onViewProfile?.(post.playerId)} disabled={!onViewProfile}>
              <Avatar className="h-10 w-10 border border-border ring-2 ring-primary/20">
                <AvatarImage src={post.authorAvatar ?? undefined} />
                <AvatarFallback className="font-bold text-sm bg-primary/20">
                  {(post.authorName ?? "?").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onViewProfile?.(post.playerId)}
                  disabled={!onViewProfile}
                  className="font-bold text-sm hover:text-primary transition-colors disabled:hover:text-foreground"
                >
                  {post.authorName}
                </button>
                {post.creatorBadge && (
                  <Badge className="bg-gradient-to-r from-yellow-500 to-amber-400 text-black text-[10px] font-black px-1.5 py-0">
                    <Award className="w-2.5 h-2.5 mr-0.5" /> Creator
                  </Badge>
                )}
                {postTypeInfo && (
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                    {postTypeInfo.icon} {postTypeInfo.label}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{timeAgo(post.createdAt)}</p>
            </div>
            {!isAnonymous && post.playerId === playerId && onDelete && (
              <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content */}
          <p className="text-sm leading-relaxed">{post.content}</p>

          {/* Tournament-win champion card */}
          {post.postType === "tournament_win" && post.metadata && (() => {
            const meta = post.metadata as {
              challengeId?: number;
              challengeTitle?: string;
              bracketSize?: number;
              boostedXp?: number;
              boostedCoins?: number;
            };
            return (
              <div
                className="relative overflow-hidden rounded-2xl border-2 border-yellow-400/60 bg-gradient-to-br from-yellow-500/20 via-amber-400/15 to-orange-500/20 p-4 shadow-[0_0_24px_rgba(250,204,21,0.18)]"
                data-testid={`tournament-win-card-${post.id}`}
              >
                <div className="absolute -top-6 -right-6 opacity-20">
                  <Crown className="w-28 h-28 text-yellow-300" />
                </div>
                <div className="relative space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 shadow-md">
                      <Crown className="w-5 h-5 text-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                        Tournament Champion
                      </p>
                      {meta.challengeTitle && (
                        <p className="text-sm font-black text-yellow-100 truncate">
                          {meta.challengeTitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    {(meta.bracketSize ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 text-yellow-100">
                        <Users className="w-3 h-3" /> {meta.bracketSize}-player bracket
                      </span>
                    )}
                    {(meta.boostedXp ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 text-green-300">
                        <Zap className="w-3 h-3" /> +{(meta.boostedXp ?? 0).toLocaleString()} XP
                      </span>
                    )}
                    {(meta.boostedCoins ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 text-amber-200">
                        <Coins className="w-3 h-3" /> +{(meta.boostedCoins ?? 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {meta.challengeId != null && (
                    <Link href={`/challenges/${meta.challengeId}`}>
                      <Button
                        size="sm"
                        className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black hover:from-yellow-300 hover:to-amber-400"
                        data-testid={`button-join-bracket-${post.id}`}
                      >
                        <Crown className="w-3.5 h-3.5 mr-1" /> Join the next bracket
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Media */}
          {post.mediaUrl && (
            <div className="rounded-xl overflow-hidden border border-border/30 max-h-64">
              <img src={post.mediaUrl} alt="Post media" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Creature tag */}
          {post.creatureName && (
            <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
              <Sparkles className="w-3 h-3" />
              with {post.creatureName}
            </div>
          )}

          {/* Rewards */}
          <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
            {post.xpEarned > 0 && <span className="text-green-500">+{post.xpEarned} XP</span>}
            {post.energyEarned > 0 && <span className="text-yellow-500">+{post.energyEarned} Energy</span>}
          </div>

          {/* Reactions bar */}
          <div className="flex items-center gap-1 pt-1 border-t border-border/30">
            {Object.entries(REACTION_ICONS).map(([type, cfg]) => {
              const count = (post.reactionCounts as Record<string, number>)?.[type] ?? 0;
              const isActive = !isAnonymous && post.myReaction === type;
              return (
                <button
                  key={type}
                  onClick={() => handleReactClick(type)}
                  disabled={isSuspended}
                  aria-disabled={isSuspended}
                  title={isSuspended ? suspendedTitle : cfg.label}
                  data-testid={`button-react-${type}-${post.id}`}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                    isActive
                      ? `bg-primary/20 ${cfg.color} scale-105`
                      : "text-muted-foreground hover:bg-muted/50 hover:scale-105"
                  }`}
                >
                  <span className={isActive ? cfg.color : ""}>{cfg.icon}</span>
                  {count > 0 && <span>{count}</span>}
                </button>
              );
            })}
            <div className="flex-1" />
            <button
              onClick={handleRepost}
              disabled={repost.isPending}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all ${
                (post as any).myRepost
                  ? "bg-green-500/20 text-green-500 scale-105"
                  : "text-muted-foreground hover:text-green-500 hover:bg-muted/50"
              }`}
              data-testid={`button-repost-${post.id}`}
            >
              <Share2 className="w-3.5 h-3.5" />
              {((post as any).repostCount ?? 0) > 0 && <span>{(post as any).repostCount}</span>}
            </button>
            <button
              onClick={handleNativeShare}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-bold"
              data-testid={`button-share-${post.id}`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowComments(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-bold"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {post.commentCount > 0 && post.commentCount}
              {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {(() => {
              const views = post.viewCount ?? 0;
              const isOwn = !isAnonymous && post.playerId === playerId;
              const formatted = views >= 1000 ? `${(views / 1000).toFixed(views >= 10_000 ? 0 : 1)}k` : `${views}`;
              return (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground font-bold"
                  title={`${views.toLocaleString()} ${views === 1 ? "view" : "views"}`}
                  data-testid={`text-view-count-${post.id}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{formatted}</span>
                  {isOwn && views > 0 && (
                    <ViewSparkline
                      postId={post.id}
                      playerId={playerId!}
                      postCreatedAt={post.createdAt}
                    />
                  )}
                </div>
              );
            })()}
          </div>

          {/* Comments */}
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                {(post.comments ?? []).map((c: PostComment) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    postId={post.id}
                    playerId={playerId}
                    onAnonymousAction={onAnonymousAction}
                  />
                ))}
                {isAnonymous ? (
                  <button
                    onClick={() => onAnonymousAction?.()}
                    className="w-full text-xs text-muted-foreground bg-muted/30 rounded-full py-2 px-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    Sign in to add a comment…
                  </button>
                ) : isSuspended ? (
                  <div
                    data-testid={`comment-suspended-${post.id}`}
                    className="w-full text-xs text-destructive bg-destructive/15 border border-destructive/30 rounded-2xl py-2 px-3 font-bold"
                  >
                    Your account is suspended — you can't comment. Contact support to appeal.
                  </div>
                ) : (
                  <form onSubmit={handleComment} className="flex gap-2">
                    <Input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Add a supportive comment..."
                      className="h-8 text-xs rounded-full bg-muted/30"
                      maxLength={280}
                    />
                    <Button type="submit" size="sm" className="h-8 w-8 p-0 rounded-full" disabled={addComment.isPending || !commentText.trim()}>
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}
