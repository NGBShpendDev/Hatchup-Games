import { Link } from "wouter";
import { motion } from "framer-motion";
import { Eye, TrendingUp, ChevronRight, Flame } from "lucide-react";
import { useGetTrendingPosts, getGetTrendingPostsQueryKey, type TrendingPost } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

const POST_TYPE_ICON: Record<string, string> = {
  workout: "💪",
  meal: "🥗",
  tournament_win: "🏆",
  battle_win: "⚔️",
  level_up: "⭐",
  hatch: "🥚",
  artifact_unlock: "✨",
  streak: "🔥",
};

export function TrendingStrip({ playerId }: { playerId: number }) {
  const params = { playerId, window: "day" as const, limit: 5 };
  const { data, isLoading } = useGetTrendingPosts(params, {
    query: { queryKey: getGetTrendingPostsQueryKey(params) },
  });
  const posts: TrendingPost[] = (data?.posts ?? []).slice(0, 5);

  if (isLoading) {
    return (
      <section data-testid="trending-strip-loading">
        <Header />
        <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 pb-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-56 flex-shrink-0 rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return (
      <section data-testid="trending-strip-empty">
        <Header />
        <Link href="/social">
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-5 text-center cursor-pointer hover:border-primary/40 hover:bg-card/70 transition-colors active:scale-[0.99]">
            <TrendingUp className="w-7 h-7 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-black mb-1">Nothing trending yet</p>
            <p className="text-[11px] text-muted-foreground font-medium">
              Be the first spark — post to the feed.
            </p>
          </div>
        </Link>
      </section>
    );
  }

  return (
    <section data-testid="trending-strip">
      <Header />
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 pb-2 snap-x snap-mandatory">
          {posts.map((post, idx) => {
            const icon = POST_TYPE_ICON[post.postType] ?? "✨";
            const snippet = (post.content ?? "").trim() || `${post.postType.replace(/_/g, " ")} highlight`;
            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="snap-start flex-shrink-0 w-56"
                data-testid={`trending-strip-card-${post.id}`}
              >
                <Link href={`/post/${post.id}`}>
                  <div className="group relative h-full rounded-2xl border border-white/10 bg-card/70 backdrop-blur p-3 hover:border-primary/50 hover:bg-card/90 transition-all cursor-pointer active:scale-[0.97] overflow-hidden">
                    <div className="absolute -top-1 left-3 z-10 inline-flex items-center gap-1 px-2 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-black shadow-lg shadow-primary/30">
                      <span>#{idx + 1}</span>
                      <span className="opacity-70">·</span>
                      <Eye className="w-2.5 h-2.5" />
                      <span>{post.recentViewCount}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 mb-2">
                      <span className="text-lg leading-none">{icon}</span>
                      <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wide truncate">
                        {post.authorName}
                      </span>
                    </div>
                    <p className="font-bold text-sm leading-tight line-clamp-3 min-h-[3.5rem]">
                      {snippet}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-400">
                        <Flame className="w-3 h-3" />
                        {post.engagementScore}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider group-hover:translate-x-0.5 transition-transform">
                        View <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: posts.length * 0.04 }}
            className="snap-start flex-shrink-0 w-28"
          >
            <Link href="/social">
              <div className="group h-full rounded-2xl border border-dashed border-border bg-card/40 backdrop-blur p-3 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary/50 hover:bg-card/70 transition-all active:scale-[0.97]">
                <TrendingUp className="w-5 h-5 text-primary mb-2" />
                <p className="text-[11px] font-black uppercase tracking-wider">See all</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Trending tab</p>
              </div>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="flex justify-between items-center mb-2">
      <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        Trending now
      </h2>
      <Link href="/social">
        <span className="text-[11px] font-black text-primary uppercase tracking-wider cursor-pointer hover:underline">
          See all
        </span>
      </Link>
    </div>
  );
}
