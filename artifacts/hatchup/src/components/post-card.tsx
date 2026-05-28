import { useState } from "react";
import {
  useAddPostComment,
  useRepostPost,
  getGetSocialFeedQueryKey,
  type FeedPost,
  type PostComment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Heart, Flame, Zap, Dumbbell, MessageCircle, Share2, Trash2,
  Send, ChevronDown, ChevronUp, Award, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const POST_TYPES = [
  { value: "general", label: "General Update", icon: "💬" },
  { value: "gym_selfie", label: "Gym Selfie", icon: "💪" },
  { value: "evolution_reveal", label: "Evolution Reveal", icon: "✨" },
  { value: "streak_milestone", label: "Streak Milestone", icon: "🔥" },
  { value: "transformation", label: "Transformation", icon: "🦋" },
  { value: "workout_stat", label: "Workout Stat", icon: "📊" },
  { value: "hatch_moment", label: "Hatch Moment", icon: "🥚" },
];

const REACTION_ICONS: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
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

export function PostCard({
  post,
  playerId,
  onReact,
  onDelete,
  onViewProfile,
  defaultShowComments = false,
  onAnonymousAction,
}: {
  post: FeedPost;
  playerId: number | null;
  onReact?: (postId: number, type: string) => void;
  onDelete?: (postId: number) => void;
  onViewProfile?: (pid: number) => void;
  defaultShowComments?: boolean;
  onAnonymousAction?: () => void;
}) {
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [commentText, setCommentText] = useState("");
  const addComment = useAddPostComment();
  const repost = useRepostPost();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAnonymous = playerId == null;

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
    onReact?.(post.id, type);
  }

  return (
    <motion.div
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
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all ${
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
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-6 w-6 flex-shrink-0">
                      <AvatarImage src={c.authorAvatar ?? undefined} />
                      <AvatarFallback className="text-[9px] bg-muted">{(c.authorName ?? "?").substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="bg-muted/50 rounded-xl px-2.5 py-1.5 flex-1">
                      <span className="font-bold text-[11px]">{c.authorName}</span>
                      <p className="text-xs text-muted-foreground">{c.content}</p>
                    </div>
                  </div>
                ))}
                {isAnonymous ? (
                  <button
                    onClick={() => onAnonymousAction?.()}
                    className="w-full text-xs text-muted-foreground bg-muted/30 rounded-full py-2 px-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    Sign in to add a comment…
                  </button>
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
