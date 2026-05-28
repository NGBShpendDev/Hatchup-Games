import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useListGameModes, getListGameModesQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Swords, Trophy, Zap, Crown, Salad, Dumbbell, Bot, Flame } from "lucide-react";
import { ForYouStrip } from "@/components/for-you-strip";
import { ErrorCard } from "@/components/error-card";
import { useState } from "react";

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

interface RivalItem {
  opponentId: number;
  opponentUsername: string | null;
  opponentDisplayName: string | null;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  lastBattleAt: string;
  lastBattleId: number;
}

interface HatchlingLite {
  id: number;
  name: string;
  level: number;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export default function Compete() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [rematchTarget, setRematchTarget] = useState<RivalItem | null>(null);
  const [sendingRematch, setSendingRematch] = useState(false);

  const { data: modes, isLoading, isError, refetch } = useListGameModes({
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

  const { data: rivals = [] } = useQuery<RivalItem[]>({
    queryKey: ["battle-rivals", pid],
    queryFn: () => fetch(`${BASE}/api/battles/rivals?limit=8`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const { data: myHatchlings = [] } = useQuery<HatchlingLite[]>({
    queryKey: ["hatchlings-compete", pid],
    queryFn: () => fetch(`${BASE}/api/hatchlings?playerId=${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid && !!rematchTarget,
  });

  async function sendRematch(rival: RivalItem, hatchlingId: number) {
    setSendingRematch(true);
    try {
      const res = await fetch(`${BASE}/api/battles/rematch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId: rival.lastBattleId, hatchlingId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not send rematch");
      toast({
        title: "Rematch sent!",
        description: `Waiting for ${rival.opponentDisplayName ?? rival.opponentUsername ?? "your rival"}…`,
      });
      setRematchTarget(null);
      navigate("/compete/battle");
    } catch (err) {
      toast({
        title: "Could not send rematch",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setSendingRematch(false);
    }
  }

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
                <GlowBadge tone="primary">NEW</GlowBadge>
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
              <NeonButton variant="primary" size="lg" className="shrink-0">
                <Swords className="w-4 h-4 mr-2 inline" /> Quick Battle
              </NeonButton>
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

        {/* ── Rivalries ── */}
        {rivals.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Rivalries</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rivals.map(r => {
                const ahead = r.wins > r.losses;
                const tied = r.wins === r.losses;
                const name = r.opponentDisplayName ?? r.opponentUsername ?? `Player #${r.opponentId}`;
                return (
                  <GlassCard key={r.opponentId} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black truncate">{name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.totalBattles} battle{r.totalBattles === 1 ? "" : "s"} · last {formatRelative(r.lastBattleAt)}
                        </p>
                      </div>
                      <div className={`text-right font-black text-lg leading-none ${
                        ahead ? "text-green-400" : tied ? "text-yellow-300" : "text-red-400"
                      }`}>
                        {r.wins}<span className="text-muted-foreground/60 text-base mx-0.5">–</span>{r.losses}
                        {r.draws > 0 && (
                          <span className="text-muted-foreground text-xs font-bold ml-1">({r.draws}D)</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        ahead ? "bg-green-500/15 text-green-300"
                          : tied ? "bg-yellow-500/15 text-yellow-300"
                          : "bg-red-500/15 text-red-300"
                      }`}>
                        {ahead ? "Ahead" : tied ? "Tied" : "Behind"}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="font-bold"
                        onClick={() => setRematchTarget(r)}
                        data-testid={`button-rematch-${r.opponentId}`}
                      >
                        <Swords className="w-3.5 h-3.5 mr-1.5" /> Rematch
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
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

        {isError && !modes ? (
          <ErrorCard title="Couldn't load game modes" onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {modes?.map(mode => (
              <motion.div key={mode.id} whileHover={{ y: -5 }}>
                <GlassCard glow={mode.isLive ? "primary" : "none"} className="overflow-hidden h-full">
                  <div className="h-full flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/3 bg-muted/40 flex items-center justify-center p-8 border-b sm:border-b-0 sm:border-r border-border">
                      <span className="text-6xl">{(mode as any).iconEmoji || '🎮'}</span>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-2xl font-black">{mode.name}</h3>
                          {mode.isLive && <GlowBadge tone="primary">Live</GlowBadge>}
                        </div>
                        <p className="text-sm text-muted-foreground font-medium mb-4">{mode.description}</p>
                        <div className="flex gap-4 text-xs font-bold text-muted-foreground mb-6">
                          <span className="bg-card-foreground/5 px-2 py-1 rounded-md">{mode.maxPlayers} Players</span>
                          <span className="bg-card-foreground/5 px-2 py-1 rounded-md">Min Lvl {mode.minLevel}</span>
                        </div>
                      </div>
                      <Link href={`/compete/race?mode=${encodeURIComponent(mode.name)}`}>
                        {mode.isLive ? (
                          <NeonButton variant="primary" size="lg" className="w-full">Play Now</NeonButton>
                        ) : (
                          <Button className="w-full font-bold" size="lg" disabled>Coming Soon</Button>
                        )}
                      </Link>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!rematchTarget} onOpenChange={(open) => { if (!open) setRematchTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rematch {rematchTarget?.opponentDisplayName ?? rematchTarget?.opponentUsername ?? "rival"}?
            </DialogTitle>
            <DialogDescription>
              {rematchTarget && (
                <>You're {rematchTarget.wins}–{rematchTarget.losses}
                {rematchTarget.draws > 0 ? `–${rematchTarget.draws}` : ""} against them.
                Pick a Hatchling to send into the arena.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {myHatchlings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                You need a Hatchling first.
              </p>
            ) : (
              myHatchlings.map(h => (
                <button
                  key={h.id}
                  disabled={sendingRematch}
                  onClick={() => rematchTarget && sendRematch(rematchTarget, h.id)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 px-3 py-2.5 text-left hover:border-primary/50 hover:bg-primary/5 transition disabled:opacity-50"
                  data-testid={`button-pick-hatchling-${h.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-bold truncate">{h.name}</p>
                    <p className="text-[11px] text-muted-foreground">Lv. {h.level}</p>
                  </div>
                  <Swords className="w-4 h-4 text-primary shrink-0" />
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRematchTarget(null)} disabled={sendingRematch}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
