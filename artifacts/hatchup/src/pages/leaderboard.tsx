import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetGlobalLeaderboard, getGetGlobalLeaderboardQueryKey,
  SpeedLeaderboardEntry,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RankBadge } from "@/components/rank-badge";
import { Trophy, Zap, Footprints, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/lib/playerContext";

type TabKey = "global" | "speed";
type SpeedMode = "steps" | "pace";

export default function Leaderboard() {
  const { playerId } = usePlayer();
  const [activeTab, setActiveTab] = useState<TabKey>("global");
  const [speedMode, setSpeedMode] = useState<SpeedMode>("steps");

  const { data: leaderboard, isLoading: globalLoading } = useGetGlobalLeaderboard(
    { limit: 50 },
    { query: { queryKey: getGetGlobalLeaderboardQueryKey({ limit: 50 }), enabled: activeTab === "global" } }
  );

  const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const { data: speedBoard, isLoading: speedLoading } = useQuery<SpeedLeaderboardEntry[]>({
    queryKey: ["leaderboard-speed", speedMode],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/leaderboards/speed?mode=${speedMode}&limit=25`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load fitness leaderboard");
      return res.json();
    },
    enabled: activeTab === "speed" && !!playerId,
  });

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "global", label: "Global Rank", icon: <Trophy className="w-4 h-4" /> },
    { key: "speed",  label: "Fitness",     icon: <Zap className="w-4 h-4" /> },
  ];

  const speedModes: { key: SpeedMode; label: string; icon: React.ReactNode }[] = [
    { key: "steps", label: "Top Daily Steps", icon: <Footprints className="w-3.5 h-3.5" /> },
    { key: "pace",  label: "Best Run",        icon: <Timer className="w-3.5 h-3.5" /> },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        <div className="text-center max-w-2xl mx-auto py-6">
          <h1 className="text-4xl font-black tracking-tight text-yellow-500 mb-2 flex items-center justify-center gap-3">
            <Trophy className="w-9 h-9" /> Leaderboards
          </h1>
          <p className="text-base text-muted-foreground font-medium">The best trainers and Pal handlers in HatchUp.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 bg-card border border-border p-1 rounded-2xl">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Global Leaderboard */}
        {activeTab === "global" && (
          <>
            {globalLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
              </div>
            ) : (
              <div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-border">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-1 text-center">Rank</div>
                  <div className="col-span-5">Player</div>
                  <div className="col-span-3">Top Pal</div>
                  <div className="col-span-1 text-right">Wins</div>
                  <div className="col-span-2 text-right">Score</div>
                </div>
                <div className="divide-y divide-border">
                  {leaderboard?.map((entry, index) => (
                    <motion.div
                      key={entry.playerId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className={`grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors ${index < 3 ? "bg-primary/5" : ""}`}
                    >
                      <div className="col-span-1 text-center font-black text-xl text-muted-foreground">
                        {entry.position === 1 ? "🥇" : entry.position === 2 ? "🥈" : entry.position === 3 ? "🥉" : `#${entry.position}`}
                      </div>
                      <div className="col-span-5 flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-border shadow-sm">
                          <AvatarImage src={entry.avatarUrl || undefined} />
                          <AvatarFallback className="font-bold text-sm">{entry.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold leading-tight">{entry.displayName || entry.username}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <RankBadge rank={entry.rank} size="sm" />
                            <span className="text-xs font-bold text-muted-foreground uppercase">{entry.rank}</span>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <p className="font-bold text-sm">{entry.hatchlingName}</p>
                        <p className="text-xs text-muted-foreground font-medium uppercase">{entry.hatchlingCategory}</p>
                      </div>
                      <div className="col-span-1 text-right font-black text-base text-green-500">{entry.wins}</div>
                      <div className="col-span-2 text-right font-black text-lg">{entry.score}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Fitness Leaderboard with sub-mode switcher */}
        {activeTab === "speed" && (
          <>
            {/* Sub-mode switcher */}
            <div className="flex gap-2">
              {speedModes.map(m => (
                <button
                  key={m.key}
                  onClick={() => setSpeedMode(m.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm border transition-all ${
                    speedMode === m.key
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {speedLoading ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
              </div>
            ) : (
              <div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-border">
                <div className="grid grid-cols-12 gap-3 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-5">Player</div>
                  <div className="col-span-4 text-right">
                    {speedMode === "steps" ? (
                      <span className="flex items-center justify-end gap-1"><Footprints className="w-3 h-3" /> Steps Today</span>
                    ) : (
                      <span className="flex items-center justify-end gap-1"><Timer className="w-3 h-3" /> Best Run</span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">Streak</div>
                </div>
                <div className="divide-y divide-border">
                  {speedBoard?.map((entry, index) => (
                    <motion.div
                      key={entry.playerId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className={`grid grid-cols-12 gap-3 p-4 items-center hover:bg-muted/30 transition-colors ${index < 3 ? "bg-primary/5" : ""}`}
                    >
                      <div className="col-span-1 text-center font-black text-xl text-muted-foreground">
                        {entry.position === 1 ? "🥇" : entry.position === 2 ? "🥈" : entry.position === 3 ? "🥉" : `#${entry.position}`}
                      </div>
                      <div className="col-span-5 flex items-center gap-3">
                        <Avatar className="h-9 w-9 border-2 border-border">
                          <AvatarImage src={entry.avatarUrl || undefined} />
                          <AvatarFallback className="font-bold text-xs">{entry.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-sm leading-tight">{entry.displayName || entry.username}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{entry.rank}</p>
                        </div>
                      </div>
                      <div className="col-span-4 text-right font-black text-base text-blue-400">
                        {entry.metricLabel}
                      </div>
                      <div className="col-span-2 text-right font-bold text-sm text-orange-400">{entry.currentStreak}🔥</div>
                    </motion.div>
                  ))}
                  {(speedBoard?.length ?? 0) === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      <Footprints className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="font-bold">No data yet — start logging activities!</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
