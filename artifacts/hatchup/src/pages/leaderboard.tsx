import { Layout } from "@/components/layout";
import { useGetGlobalLeaderboard, getGetGlobalLeaderboardQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RankBadge } from "@/components/rank-badge";
import { Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useGetGlobalLeaderboard(
    { limit: 50 },
    { query: { queryKey: getGetGlobalLeaderboardQueryKey({ limit: 50 }) } }
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-yellow-500 mb-4 flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10" /> Global Leaderboard
          </h1>
          <p className="text-lg text-muted-foreground font-medium">The best hatchers and racers in the universe.</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-border">
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-1 text-center">Rank</div>
              <div className="col-span-5">Player</div>
              <div className="col-span-3">Top Hatchling</div>
              <div className="col-span-1 text-right">Wins</div>
              <div className="col-span-2 text-right">Score</div>
            </div>

            <div className="divide-y divide-border">
              {leaderboard?.map((entry, index) => (
                <motion.div 
                  key={entry.playerId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors ${index < 3 ? 'bg-primary/5' : ''}`}
                >
                  <div className="col-span-1 text-center font-black text-2xl text-muted-foreground">
                    {entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `#${entry.position}`}
                  </div>
                  
                  <div className="col-span-5 flex items-center gap-4">
                    <Avatar className="h-12 w-12 border-2 border-border shadow-sm">
                      <AvatarImage src={entry.avatarUrl || undefined} />
                      <AvatarFallback className="font-bold">{entry.username.substring(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-bold text-lg leading-tight">{entry.displayName || entry.username}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <RankBadge rank={entry.rank} size="sm" />
                        <span className="text-xs font-bold text-muted-foreground uppercase">{entry.rank}</span>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-3">
                    <p className="font-bold">{entry.hatchlingName}</p>
                    <p className="text-xs text-muted-foreground font-medium uppercase">{entry.hatchlingCategory}</p>
                  </div>

                  <div className="col-span-1 text-right font-black text-lg text-green-500">
                    {entry.wins}
                  </div>

                  <div className="col-span-2 text-right font-black text-xl">
                    {entry.score}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
