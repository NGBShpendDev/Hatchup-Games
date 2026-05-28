import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import {
  useGetPost,
  getGetPostQueryKey,
  useReactToPost,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/post-card";
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function TrendingPostPreviewDialog({
  postIds,
  initialIndex = 0,
  viewerId,
  open,
  onOpenChange,
}: {
  postIds: number[];
  initialIndex?: number;
  viewerId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { redirectToSignIn } = useClerk();
  const reactToPost = useReactToPost();

  const [index, setIndex] = useState(initialIndex);

  // Reset to the initial index whenever the dialog is opened.
  useEffect(() => {
    if (open) {
      setIndex(
        initialIndex >= 0 && initialIndex < postIds.length ? initialIndex : 0,
      );
    }
  }, [open, initialIndex, postIds.length]);

  const total = postIds.length;
  const safeIndex = total > 0 ? Math.min(Math.max(index, 0), total - 1) : 0;
  const postId = total > 0 ? postIds[safeIndex] : null;

  const queryParams = viewerId != null ? { playerId: viewerId } : undefined;
  const enabled =
    open && postId != null && Number.isFinite(postId) && postId > 0;

  const { data: post, isLoading, error } = useGetPost(
    (postId ?? 0) as number,
    queryParams,
    {
      query: {
        queryKey: getGetPostQueryKey((postId ?? 0) as number, queryParams),
        enabled,
        retry: false,
      },
    },
  );

  async function handleReact(id: number, reactionType: string) {
    if (viewerId == null) {
      redirectToSignIn();
      return;
    }
    try {
      await reactToPost.mutateAsync({
        id,
        data: { playerId: viewerId, reactionType: reactionType as any },
      });
      qc.invalidateQueries({
        queryKey: getGetPostQueryKey(id, { playerId: viewerId }),
      });
    } catch {
      toast({ title: "Could not react", variant: "destructive" });
    }
  }

  const isUnavailable = !isLoading && (!!error || (!post && enabled));

  const canPrev = total > 1 && safeIndex > 0;
  const canNext = total > 1 && safeIndex < total - 1;

  function goPrev() {
    if (canPrev) setIndex(safeIndex - 1);
  }
  function goNext() {
    if (canNext) setIndex(safeIndex + 1);
  }

  // Swipe gesture handling
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 50;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  // Keyboard arrow navigation
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canPrev, canNext, safeIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-background/95 backdrop-blur border-border/60 p-4 sm:p-5"
        data-testid="trending-post-preview-dialog"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle className="text-xs font-black uppercase tracking-wider text-primary inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Trending preview
            {total > 1 ? (
              <span
                className="ml-1 text-[10px] font-bold text-muted-foreground normal-case tracking-normal"
                data-testid="trending-post-preview-counter"
              >
                {safeIndex + 1} of {total}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            Quick look at one of today's hottest posts.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-2xl" />
        ) : isUnavailable ? (
          <div
            className="text-center py-8 space-y-2"
            data-testid="trending-post-preview-unavailable"
          >
            <p className="text-sm font-black">This post is no longer available</p>
            <p className="text-[11px] text-muted-foreground">
              It may have been deleted by its author.
            </p>
          </div>
        ) : post ? (
          <div className="space-y-3">
            <PostCard
              post={post}
              playerId={viewerId}
              onReact={handleReact}
              onAnonymousAction={() => redirectToSignIn()}
            />
            <Link href={`/post/${post.id}`}>
              <Button
                className="w-full rounded-full font-black"
                onClick={() => onOpenChange(false)}
                data-testid={`button-view-full-post-${post.id}`}
              >
                View full post <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        ) : null}

        {total > 1 ? (
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full font-black text-[11px] uppercase tracking-wider disabled:opacity-30"
              onClick={goPrev}
              disabled={!canPrev}
              aria-label="Previous trending post"
              data-testid="button-trending-preview-prev"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <div
              className="flex items-center gap-1"
              aria-hidden="true"
            >
              {postIds.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === safeIndex
                      ? "w-4 bg-primary"
                      : "w-1.5 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full font-black text-[11px] uppercase tracking-wider disabled:opacity-30"
              onClick={goNext}
              disabled={!canNext}
              aria-label="Next trending post"
              data-testid="button-trending-preview-next"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
