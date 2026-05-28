import { useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { Show, useClerk } from "@clerk/react";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/post-card";
import { PlayerProvider, usePlayer } from "@/lib/playerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetPost,
  getGetPostQueryKey,
  getGetSocialFeedQueryKey,
  getGetPostViewSeriesQueryKey,
  useReactToPost,
  useDeletePost,
  useRecordPostView,
} from "@workspace/api-client-react";

function PostBody({ postId, viewerId }: { postId: number; viewerId: number | null }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { redirectToSignIn } = useClerk();

  const { data: post, isLoading, error } = useGetPost(
    postId,
    viewerId != null ? { playerId: viewerId } : undefined,
    {
      query: {
        queryKey: getGetPostQueryKey(postId, viewerId != null ? { playerId: viewerId } : undefined),
        retry: false,
        enabled: Number.isFinite(postId) && postId > 0,
      },
    },
  );

  const reactToPost = useReactToPost();
  const deletePost = useDeletePost();
  const recordView = useRecordPostView();
  const viewedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(postId) || postId <= 0) return;
    if (viewedRef.current === postId) return;
    // Require a short dwell time before firing the view ping so accidental
    // taps, prefetches, and refresh loops don't inflate the counter.
    const DWELL_MS = 2500;
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      viewedRef.current = postId;
      recordView.mutate(
        { id: postId },
        {
          onSuccess: (data) => {
            if (data?.counted) {
              qc.invalidateQueries({
                queryKey: getGetPostQueryKey(postId, viewerId != null ? { playerId: viewerId } : undefined),
              });
              if (viewerId != null) {
                qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: viewerId }) });
                // Invalidate both window variants so the sparkline refreshes
                // regardless of which one the creator is currently viewing.
                qc.invalidateQueries({
                  queryKey: getGetPostViewSeriesQueryKey(postId, { playerId: viewerId, window: "day" }),
                });
                qc.invalidateQueries({
                  queryKey: getGetPostViewSeriesQueryKey(postId, { playerId: viewerId, window: "week" }),
                });
              }
            }
          },
        },
      );
    }, DWELL_MS);
    return () => clearTimeout(timer);
    // recordView is a stable mutation; we intentionally only re-run when postId/viewer changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, viewerId]);

  async function handleReact(id: number, reactionType: string) {
    if (viewerId == null) return;
    try {
      await reactToPost.mutateAsync({ id, data: { playerId: viewerId, reactionType: reactionType as any } });
      qc.invalidateQueries({ queryKey: getGetPostQueryKey(postId, { playerId: viewerId }) });
    } catch {
      toast({ title: "Could not react", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (viewerId == null) return;
    try {
      await deletePost.mutateAsync({ id, params: { playerId: viewerId } });
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: viewerId }) });
      toast({ title: "Post deleted" });
      navigate("/social");
    } catch {
      toast({ title: "Could not delete post", variant: "destructive" });
    }
  }

  const status = (error as any)?.status;
  const isNotFound = status === 404 || !Number.isFinite(postId) || postId <= 0;
  const otherError = !isNotFound && !!error && !post;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (viewerId != null ? navigate("/social") : navigate("/"))}
          className="rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      {viewerId == null && post && (
        <Card className="border border-primary/30 bg-gradient-to-r from-primary/10 to-violet-500/10 rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black">Join HatchUp to react, comment & share</p>
              <p className="text-[11px] text-muted-foreground">
                Every step you take hatches something amazing.
              </p>
            </div>
            <Button onClick={() => redirectToSignIn()} size="sm" className="rounded-full font-black" data-testid="button-signup-cta">
              Sign up
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : isNotFound || otherError ? (
        <Card className="border border-border/50 bg-card/80 backdrop-blur rounded-2xl">
          <CardContent className="p-8 text-center space-y-3">
            <Sparkles className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
            <h2 className="text-xl font-black" data-testid="text-post-unavailable">
              This post is no longer available
            </h2>
            <p className="text-sm text-muted-foreground">
              It may have been deleted by its author, or the link may be wrong.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Link href={viewerId != null ? "/social" : "/"}>
                <Button className="rounded-full font-black">
                  <Users className="w-4 h-4 mr-2" /> Browse the community
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : post ? (
        <PostCard
          post={post}
          playerId={viewerId}
          onReact={handleReact}
          onDelete={handleDelete}
          defaultShowComments
          disableViewTracking
          onAnonymousAction={() => redirectToSignIn()}
        />
      ) : null}
    </div>
  );
}

function SignedInPostDetail({ postId }: { postId: number }) {
  return (
    <PlayerProvider>
      <Layout>
        <SignedInBody postId={postId} />
      </Layout>
    </PlayerProvider>
  );
}

function SignedInBody({ postId }: { postId: number }) {
  const { playerId } = usePlayer();
  return <PostBody postId={postId} viewerId={playerId ?? null} />;
}

function SignedOutPostDetail({ postId }: { postId: number }) {
  const { redirectToSignIn } = useClerk();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-black pointer-events-none -z-10" />
      <header className="w-full max-w-lg mx-auto px-4 pt-4 flex items-center justify-between">
        <Link href="/">
          <a className="text-xl font-black tracking-tight text-primary">HATCHUP</a>
        </Link>
        <Button onClick={() => redirectToSignIn()} size="sm" className="rounded-full font-black">
          Sign in
        </Button>
      </header>
      <main className="flex-1 w-full max-w-lg mx-auto p-4">
        <PostBody postId={postId} viewerId={null} />
      </main>
    </div>
  );
}

export default function PostDetail() {
  const [, postParams] = useRoute("/post/:id");
  const [, pParams] = useRoute("/p/:id");
  const postId = Number(postParams?.id ?? pParams?.id);

  return (
    <>
      <Show when="signed-in">
        <SignedInPostDetail postId={postId} />
      </Show>
      <Show when="signed-out">
        <SignedOutPostDetail postId={postId} />
      </Show>
    </>
  );
}
