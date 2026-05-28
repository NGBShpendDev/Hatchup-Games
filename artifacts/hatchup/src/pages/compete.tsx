import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useListGameModes, getListGameModesQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Swords, Trophy, Zap, Crown, Salad, Dumbbell, Bot } from "lucide-react";
import { ForYouStrip } from "@/components/for-you-strip";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface BattleHistoryItem {
  id: number;
  opponent: string;
  viewerWon: boolean;
  myHatchling: string | null;
  createdAt: string;
  battleMode: string;
  eloChange: number;
}

export default function Compete() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;

  const { data: modes, isLoading } = useListGameModes({
    query: { queryKey: getListGameModesQueryKey() }
  });

  const { data: player } = useQuery<{ level: number; battleElo: number; totalBattleWins: number }>({
    queryKey: ["player-compete", pid],
    queryFn: () => fetch(`${BASE}/api/players/${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const { data: battleHistory = [] } = useQuery<BattleHistoryItem[]>({
    queryKey: ["battle-history-compete", pid],
    queryFn: () => fetch(`${BASE}/api/battles/history?limit=5`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-24 px-2">

        <ForYouStrip
          heading="Power Up For Battle"
          items={[
            { id: "battle-ready", title: "Check battle readiness", subtitle: "How fueled your Pals are today.", href: "/compete/battle", icon: <Swords className="w-4 h-4" />, tone: "violet", tag: "Stats" },
            { id: "fuel-meal", title: "Log a meal first", subtitle: "Nutrition raises battle stats.", href: "/nutrition", icon: <Salad className="w-4 h-4" />, tone: "green", tag: "Fuel" },
            { id: "warm-up", title: "Quick warm-up workout", subtitle: "Earn XP before queueing.", href: "/training", icon: <Dumbbell className="w-4 h-4" />, tone: "primary", tag: "Train" },
            { id: "ask-coach", title: "Ask the AI Coach", subtitle: "Get the best match for your strengths.", href: "/coach", icon: <Bot className="w-4 h-4" />, tone: "primary", tag: "AI" },
          ]}
        />

        {/* ── Battle Arena CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-primary/40 shadow-2xl shadow-primary/10"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-900/20 to-black" />
          <div className="relative z-10 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Swords className="w-5 h-5 text-primary" />
                <span className="font-black text-lg">Battle Arena</span>
                <span className="text-[10px] bg-primary/20 border border-primary/40 text-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">NEW</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Real-time 1v1 Hatchling battles. Fitness stats power your moves. Climb the ELO ladder.
              </p>
              {/* ELO + wins strip */}
              <div className="flex gap-3 flex-wrap">
                {player && (
                  <>
                    <div className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-1.5">
                      <Crown className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-sm font-black text-yellow-400">{player.battleElo}</span>
                      <span className="text-xs text-muted-foreground">ELO</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-1.5">
                      <Trophy className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-sm font-black text-green-400">{player.totalBattleWins}</span>
                      <span className="text-xs text-muted-foreground">wins</span>
                    </div>
                    {player.level >= 10 && (
                      <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-3 py-1.5">
                        <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-bold text-cyan-300">Ranked unlocked</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <Link href="/compete/battle">
              <Button size="lg" className="font-black bg-gradient-to-r from-primary to-purple-600 rounded-2xl shadow-primary/30 shadow-lg px-8 shrink-0">
                <Swords className="w-4 h-4 mr-2" /> Quick Battle
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* ── Recent battle history strip ── */}
        {battleHistory.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Battles</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2">
              {battleHistory.map(b => (
                <div
                  key={b.id}
                  className={`flex-shrink-0 rounded-xl border p-3 min-w-[140px] text-center text-xs
                    ${b.viewerWon ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
                >
                  <p className="text-2xl mb-1">{b.viewerWon ? "🏆" : "💀"}</p>
                  <p className={`font-black ${b.viewerWon ? "text-green-400" : "text-red-400"}`}>
                    {b.viewerWon ? "WIN" : "LOSS"}
                  </p>
                  <p className="text-muted-foreground truncate mt-0.5">vs {b.opponent}</p>
                  <p className="text-muted-foreground text-[10px] capitalize mt-0.5">{b.battleMode}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Page header ── */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Compete & Conquer</h1>
            <p className="text-base font-medium max-w-2xl opacity-90">
              Pit your Pals against players worldwide in various game modes. Earn XP, coins, and climb the global leaderboard.
            </p>
          </div>
        </div>

        <h2 className="text-2xl font-black">Game Modes</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {modes?.map(mode => (
              <motion.div key={mode.id} whileHover={{ y: -5 }}>
                <Card className={`overflow-hidden border-2 h-full ${mode.isLive ? 'border-primary shadow-primary/20 shadow-lg' : 'border-border'}`}>
                  <CardContent className="p-0 h-full flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/3 bg-muted flex items-center justify-center p-8 border-b sm:border-b-0 sm:border-r border-border">
                      <span className="text-6xl">{mode.iconEmoji || '🎮'}</span>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-2xl font-black">{mode.name}</h3>
                          {mode.isLive && <span className="bg-red-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-full animate-pulse">Live</span>}
                        </div>
                        <p className="text-sm text-muted-foreground font-medium mb-4">{mode.description}</p>
                        <div className="flex gap-4 text-xs font-bold text-muted-foreground mb-6">
                          <span className="bg-card-foreground/5 px-2 py-1 rounded-md">{mode.maxPlayers} Players</span>
                          <span className="bg-card-foreground/5 px-2 py-1 rounded-md">Min Lvl {mode.minLevel}</span>
                        </div>
                      </div>
                      <Link href={`/compete/race?mode=${encodeURIComponent(mode.name)}`}>
                        <Button className="w-full font-bold active-elevate" size="lg" disabled={!mode.isLive && mode.type !== 'standard'}>
                          {mode.isLive || mode.type === 'standard' ? 'Play Now' : 'Coming Soon'}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
