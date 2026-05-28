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
import { ExternalLink, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function TrendingPostPreviewDialog({
  postId,
  viewerId,
  open,
  onOpenChange,
}: {
  postId: number | null;
  viewerId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { redirectToSignIn } = useClerk();
  const reactToPost = useReactToPost();

  const queryParams = viewerId != null ? { playerId: viewerId } : undefined;
  const enabled = open && postId != null && Number.isFinite(postId) && postId > 0;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-background/95 backdrop-blur border-border/60 p-4 sm:p-5"
        data-testid="trending-post-preview-dialog"
      >
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle className="text-xs font-black uppercase tracking-wider text-primary inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Trending preview
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
      </DialogContent>
    </Dialog>
  );
}
