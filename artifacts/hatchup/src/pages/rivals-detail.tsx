import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useQuery } from "@tanstack/react-query";
import { useGetBattleRivalDetail, getGetBattleRivalDetailQueryKey } from "@workspace/api-client-react";
import type { BattleRivalDetailEntry } from "@workspace/api-client-react";
import { useRoute, useLocation, Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ErrorCard } from "@/components/error-card";
import { ArrowLeft, Swords, Flame, Crown, Trophy, TrendingUp, TrendingDown, Zap, Sparkles, Star } from "lucide-react";
import { rankHatchlingsForRematch, formatRecord, formatStreak } from "@/lib/rematchSuggestions";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type RivalBattle = BattleRivalDetailEntry;

interface HatchlingLite {
  id: number;
  name: string;
  level: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface Highlights {
  biggestWin: RivalBattle | null;
  biggestLoss: RivalBattle | null;
  currentStreak: { count: number; type: "win" | "loss" | "draw" } | null;
  longestWinStreak: number;
  topMatchup: {
    myHatchlingId: number;
    myHatchlingName: string;
    opponentHatchlingId: number;
    opponentHatchlingName: string;
    count: number;
    wins: number;
    losses: number;
  } | null;
}

function computeHighlights(battles: RivalBattle[]): Highlights {
  let biggestWin: RivalBattle | null = null;
  let biggestLoss: RivalBattle | null = null;
  for (const b of battles) {
    if (b.outcome === "win" && (!biggestWin || b.eloChange > biggestWin.eloChange)) biggestWin = b;
    if (b.outcome === "loss" && (!biggestLoss || b.eloChange < biggestLoss.eloChange)) biggestLoss = b;
  }

  // Battles are sorted newest-first; reverse for chronological streak math.
  const chrono = [...battles].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let longestWinStreak = 0;
  let runWin = 0;
  for (const b of chrono) {
    if (b.outcome === "win") {
      runWin += 1;
      if (runWin > longestWinStreak) longestWinStreak = runWin;
    } else {
      runWin = 0;
    }
  }

  let currentStreak: Highlights["currentStreak"] = null;
  if (chrono.length > 0) {
    const latest = chrono[chrono.length - 1].outcome;
    let count = 0;
    for (let i = chrono.length - 1; i >= 0; i -= 1) {
      if (chrono[i].outcome === latest) count += 1;
      else break;
    }
    currentStreak = { count, type: latest };
  }

  const matchupMap = new Map<
    string,
    {
      myHatchlingId: number;
      myHatchlingName: string;
      opponentHatchlingId: number;
      opponentHatchlingName: string;
      count: number;
      wins: number;
      losses: number;
    }
  >();
  for (const b of battles) {
    if (!b.myHatchlingId || !b.opponentHatchlingId) continue;
    const key = `${b.myHatchlingId}-${b.opponentHatchlingId}`;
    const existing = matchupMap.get(key) ?? {
      myHatchlingId: b.myHatchlingId,
      myHatchlingName: b.myHatchlingName ?? "Unknown",
      opponentHatchlingId: b.opponentHatchlingId,
      opponentHatchlingName: b.opponentHatchlingName ?? "Unknown",
      count: 0,
      wins: 0,
      losses: 0,
    };
    existing.count += 1;
    if (b.outcome === "win") existing.wins += 1;
    else if (b.outcome === "loss") existing.losses += 1;
    matchupMap.set(key, existing);
  }
  let topMatchup: Highlights["topMatchup"] = null;
  for (const m of matchupMap.values()) {
    if (!topMatchup || m.count > topMatchup.count) topMatchup = m;
  }

  return { biggestWin, biggestLoss, currentStreak, longestWinStreak, topMatchup };
}

export default function RivalsDetail() {
  const [, params] = useRoute("/compete/rivals/:opponentId");
  const opponentId = Number(params?.opponentId ?? 0);
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [rematchOpen, setRematchOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data, isLoading, isError, refetch } = useGetBattleRivalDetail(opponentId, {
    query: {
      queryKey: getGetBattleRivalDetailQueryKey(opponentId),
      enabled: !!pid && opponentId > 0,
    },
  });

  const { data: myHatchlings = [] } = useQuery<HatchlingLite[]>({
    queryKey: ["hatchlings-rival-detail", pid],
    queryFn: () => fetch(`${BASE}/api/hatchlings?playerId=${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid && rematchOpen,
  });

  async function sendRematch(hatchlingId: number) {
    if (!data?.lastBattleId) return;
    setSending(true);
    try {
      const res = await fetch(`${BASE}/api/battles/rematch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId: data.lastBattleId, hatchlingId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not send rematch");
      toast({
        title: "Rematch sent!",
        description: `Waiting for ${data.opponentDisplayName ?? data.opponentUsername ?? "your rival"}…`,
      });
      setRematchOpen(false);
      navigate("/compete/battle");
    } catch (err) {
      toast({
        title: "Could not send rematch",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  const name = data?.opponentDisplayName ?? data?.opponentUsername ?? `Player #${opponentId}`;
  const ahead = (data?.wins ?? 0) > (data?.losses ?? 0);
  const tied = (data?.wins ?? 0) === (data?.losses ?? 0);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 pb-24 px-2">
        <Link href="/compete">
          <Button variant="ghost" size="sm" className="font-bold" data-testid="link-back-to-compete">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Compete
          </Button>
        </Link>

        {isError && !data ? (
          <ErrorCard title="Couldn't load this rivalry" onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-3xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Header */}
            <GlassCard className="p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-red-500/10" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rivalry</span>
                </div>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <Link href={`/players/${data.opponentId}`}>
                      <h1 className="text-3xl md:text-4xl font-black tracking-tight hover:text-primary transition cursor-pointer" data-testid="text-rival-name">
                        vs {name}
                      </h1>
                    </Link>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-1.5">
                        <Crown className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-sm font-black text-yellow-400">{data.opponentBattleElo}</span>
                        <span className="text-xs text-muted-foreground">ELO</span>
                      </div>
                      <GlowBadge tone={ahead ? "green" : tied ? "yellow" : "primary"}>
                        {ahead ? "You're ahead" : tied ? "Tied" : "You're behind"}
                      </GlowBadge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black text-4xl leading-none ${
                      ahead ? "text-green-400" : tied ? "text-yellow-300" : "text-red-400"
                    }`} data-testid="text-rival-record">
                      {data.wins}<span className="text-muted-foreground/60 text-2xl mx-1">–</span>{data.losses}
                      {data.draws > 0 && (
                        <span className="text-muted-foreground text-base font-bold ml-2">({data.draws}D)</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mt-1.5">
                      {data.totalBattles} total battle{data.totalBattles === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <Trophy className="w-4 h-4 text-cyan-400" />
                    <span className="text-muted-foreground">Net ELO from rival:</span>
                    <span className={`font-black ${
                      data.viewerEloDelta > 0 ? "text-green-400"
                        : data.viewerEloDelta < 0 ? "text-red-400" : "text-muted-foreground"
                    }`} data-testid="text-net-elo">
                      {data.viewerEloDelta > 0 ? "+" : ""}{data.viewerEloDelta}
                    </span>
                  </div>
                  <Button
                    onClick={() => setRematchOpen(true)}
                    disabled={!data.lastBattleId}
                    className="font-bold"
                    data-testid="button-rematch"
                  >
                    <Swords className="w-4 h-4 mr-1.5" /> Rematch
                  </Button>
                </div>
              </div>
            </GlassCard>

            {/* Highlights */}
            {data.battles.length > 0 && (() => {
              const h = computeHighlights(data.battles);
              const anyHighlights = h.biggestWin || h.biggestLoss || h.longestWinStreak > 0 || h.topMatchup || h.currentStreak;
              if (!anyHighlights) return null;
              return (
                <div className="space-y-3" data-testid="section-highlights">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Highlights</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {h.biggestWin && (
                      <GlassCard className="p-4" data-testid="card-highlight-biggest-win">
                        <div className="flex items-center gap-2 mb-1.5">
                          <TrendingUp className="w-4 h-4 text-green-400" />
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Biggest Win</p>
                        </div>
                        <p className="font-black text-2xl text-green-400">+{h.biggestWin.eloChange} ELO</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.biggestWin.myHatchlingName ?? "Your Hatchling"} · {formatDate(h.biggestWin.createdAt)}
                        </p>
                      </GlassCard>
                    )}
                    {h.biggestLoss && (
                      <GlassCard className="p-4" data-testid="card-highlight-biggest-loss">
                        <div className="flex items-center gap-2 mb-1.5">
                          <TrendingDown className="w-4 h-4 text-red-400" />
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Worst Loss</p>
                        </div>
                        <p className="font-black text-2xl text-red-400">{h.biggestLoss.eloChange} ELO</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.biggestLoss.myHatchlingName ?? "Your Hatchling"} · {formatDate(h.biggestLoss.createdAt)}
                        </p>
                      </GlassCard>
                    )}
                    {(h.currentStreak && h.currentStreak.count > 1) || h.longestWinStreak > 0 ? (
                      <GlassCard className="p-4" data-testid="card-highlight-streak">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Flame className="w-4 h-4 text-orange-400" />
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Streaks</p>
                        </div>
                        {h.currentStreak && h.currentStreak.count > 1 && (
                          <p className={`font-black text-2xl ${
                            h.currentStreak.type === "win" ? "text-green-400"
                              : h.currentStreak.type === "loss" ? "text-red-400"
                              : "text-yellow-300"
                          }`} data-testid="text-current-streak">
                            {h.currentStreak.count}-{h.currentStreak.type === "win" ? "W" : h.currentStreak.type === "loss" ? "L" : "D"} now
                          </p>
                        )}
                        {h.longestWinStreak > 0 && (
                          <p className="text-xs text-muted-foreground mt-1" data-testid="text-longest-streak">
                            Longest win streak: <span className="font-black text-foreground">{h.longestWinStreak}</span>
                          </p>
                        )}
                      </GlassCard>
                    ) : null}
                    {h.topMatchup && h.topMatchup.count >= 2 && (
                      <GlassCard className="p-4" data-testid="card-highlight-matchup">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Zap className="w-4 h-4 text-cyan-400" />
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Signature Matchup</p>
                        </div>
                        <p className="font-black text-base leading-tight">
                          <Link href={`/hatchlings/${h.topMatchup.myHatchlingId}`}>
                            <span className="hover:text-primary cursor-pointer">{h.topMatchup.myHatchlingName}</span>
                          </Link>
                          <span className="text-muted-foreground mx-1.5">vs</span>
                          <Link href={`/hatchlings/${h.topMatchup.opponentHatchlingId}`}>
                            <span className="hover:text-primary cursor-pointer">{h.topMatchup.opponentHatchlingName}</span>
                          </Link>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.topMatchup.count} battles ·{" "}
                          <span className="text-green-400 font-bold">{h.topMatchup.wins}W</span>{" "}
                          <span className="text-red-400 font-bold">{h.topMatchup.losses}L</span>
                        </p>
                      </GlassCard>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Battle log */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-primary" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Match Log</p>
              </div>

              {data.battles.length === 0 ? (
                <GlassCard className="p-8 text-center text-sm text-muted-foreground">
                  No battles recorded yet.
                </GlassCard>
              ) : (
                <div className="space-y-2">
                  {data.battles.map(b => {
                    const isWin = b.outcome === "win";
                    const isLoss = b.outcome === "loss";
                    return (
                      <div
                        key={b.id}
                        className={`rounded-2xl border p-4 ${
                          isWin ? "border-green-500/30 bg-green-500/5"
                            : isLoss ? "border-red-500/30 bg-red-500/5"
                            : "border-yellow-500/30 bg-yellow-500/5"
                        }`}
                        data-testid={`row-battle-${b.id}`}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-2xl">
                              {isWin ? "🏆" : isLoss ? "💀" : "🤝"}
                            </div>
                            <div className="min-w-0">
                              <p className={`font-black text-sm ${
                                isWin ? "text-green-400" : isLoss ? "text-red-400" : "text-yellow-300"
                              }`}>
                                {isWin ? "WIN" : isLoss ? "LOSS" : "DRAW"}
                                <span className="text-muted-foreground font-bold text-[11px] uppercase tracking-wider ml-2">
                                  {b.battleMode}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(b.createdAt)} · {formatTime(b.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-black text-base ${
                              b.eloChange > 0 ? "text-green-400"
                                : b.eloChange < 0 ? "text-red-400" : "text-muted-foreground"
                            }`}>
                              {b.eloChange > 0 ? "+" : ""}{b.eloChange} ELO
                            </p>
                            {b.xpAwarded > 0 && (
                              <p className="text-[11px] text-muted-foreground font-bold">
                                +{b.xpAwarded} XP
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                          <div className="min-w-0 text-left">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">You</p>
                            {b.myHatchlingId ? (
                              <Link href={`/hatchlings/${b.myHatchlingId}`}>
                                <p className="font-bold truncate hover:text-primary cursor-pointer">
                                  {b.myHatchlingName ?? "Unknown"}
                                </p>
                              </Link>
                            ) : (
                              <p className="font-bold truncate text-muted-foreground">—</p>
                            )}
                          </div>
                          <span className="text-muted-foreground font-black text-xs">vs</span>
                          <div className="min-w-0 text-right">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{name}</p>
                            {b.opponentHatchlingId ? (
                              <Link href={`/hatchlings/${b.opponentHatchlingId}`}>
                                <p className="font-bold truncate hover:text-primary cursor-pointer">
                                  {b.opponentHatchlingName ?? "Unknown"}
                                </p>
                              </Link>
                            ) : (
                              <p className="font-bold truncate text-muted-foreground">—</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={rematchOpen} onOpenChange={(open) => { if (!open) setRematchOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rematch {name}?</DialogTitle>
            <DialogDescription>
              {data && (
                <>You're {data.wins}–{data.losses}
                {data.draws > 0 ? `–${data.draws}` : ""} against them.
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
              rankHatchlingsForRematch(myHatchlings, data?.battles ?? []).map(r => {
                const h = r.hatchling;
                const record = formatRecord(r);
                const streakLabel = formatStreak(r.currentStreak);
                const streakTooltip = r.currentStreak && r.currentStreak.count >= 2
                  ? `${r.currentStreak.count}-${r.currentStreak.type} streak vs this rival`
                  : undefined;
                const subLabel = r.reason === "best-win-rate" && record
                  ? `Best win rate vs this rival · ${record}`
                  : r.reason === "last-used"
                    ? record
                      ? `Last used · ${record} vs this rival`
                      : "Last used vs this rival"
                    : r.reason === "most-wins" && record
                      ? `Most wins vs this rival · ${record}`
                      : record
                        ? `${record} vs this rival`
                        : `Lv. ${h.level}`;
                return (
                  <button
                    key={h.id}
                    disabled={sending}
                    onClick={() => sendRematch(h.id)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                      r.isRecommended
                        ? "border-primary/60 bg-primary/10 hover:bg-primary/15"
                        : "border-border bg-card/40 hover:border-primary/50 hover:bg-primary/5"
                    }`}
                    data-testid={`button-pick-hatchling-${h.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold truncate">{h.name}</p>
                        {r.isRecommended && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary"
                            data-testid={`badge-recommended-${h.id}`}
                          >
                            <Star className="w-2.5 h-2.5" /> Recommended
                          </span>
                        )}
                        {streakLabel && (
                          <span
                            title={streakTooltip}
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                              r.currentStreak?.type === "win"
                                ? "bg-orange-500/20 text-orange-300"
                                : r.currentStreak?.type === "loss"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-yellow-500/20 text-yellow-300"
                            }`}
                            data-testid={`badge-streak-${h.id}`}
                          >
                            {streakLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Lv. {h.level} · {subLabel}
                      </p>
                    </div>
                    <Swords className="w-4 h-4 text-primary shrink-0" />
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRematchOpen(false)} disabled={sending}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
