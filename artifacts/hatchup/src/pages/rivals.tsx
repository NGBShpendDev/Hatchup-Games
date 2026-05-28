import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useListBattleRivals,
  getListBattleRivalsQueryKey,
  useListPendingBattleRematches,
  getListPendingBattleRematchesQueryKey,
  useAcceptBattleRematch,
  useDeclineBattleRematch,
  type BattleRival,
  type BattleRematchInvite,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import {
  ArrowLeft,
  Swords,
  Flame,
  Inbox,
  Send,
  Check,
  X,
  Clock,
} from "lucide-react";
import { ErrorCard } from "@/components/error-card";

const REMATCH_POLL_MS = 30_000;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const past = diffMs >= 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return past ? "just now" : "in <1m";
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return past ? `${months}mo ago` : `in ${months}mo`;
  return past ? `${Math.round(months / 12)}y ago` : `in ${Math.round(months / 12)}y`;
}

function inviteName(inv: BattleRematchInvite, viewerId: number): string {
  const isReceived = inv.toPlayerId === viewerId;
  const display = isReceived ? inv.fromDisplayName : inv.toDisplayName;
  if (display && display.trim().length > 0) return display;
  return `Player #${isReceived ? inv.fromPlayerId : inv.toPlayerId}`;
}

export default function RivalsPage() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const rivalsParams = { limit: 50 };
  const {
    data: rivals = [],
    isLoading: rivalsLoading,
    isError: rivalsError,
    refetch: refetchRivals,
  } = useListBattleRivals(rivalsParams, {
    query: {
      queryKey: getListBattleRivalsQueryKey(rivalsParams),
      enabled: !!pid,
    },
  });

  const {
    data: pending = [],
    isLoading: pendingLoading,
    isError: pendingError,
    refetch: refetchPending,
  } = useListPendingBattleRematches({
    query: {
      queryKey: getListPendingBattleRematchesQueryKey(),
      enabled: !!pid,
      refetchInterval: REMATCH_POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });

  const acceptMut = useAcceptBattleRematch();
  const declineMut = useDeclineBattleRematch();

  const invalidatePending = () =>
    qc.invalidateQueries({ queryKey: getListPendingBattleRematchesQueryKey() });

  function onAccept(inv: BattleRematchInvite) {
    acceptMut.mutate(
      { id: inv.id },
      {
        onSuccess: () => {
          invalidatePending();
          toast({
            title: "Rematch accepted",
            description: `Heading to the arena vs ${inviteName(inv, pid)}…`,
          });
          navigate("/compete/battle");
        },
        onError: (err) => {
          toast({
            title: "Could not accept",
            description: String((err as Error).message ?? "Try again in a moment."),
            variant: "destructive",
          });
        },
      },
    );
  }

  function onDecline(inv: BattleRematchInvite) {
    const isReceived = inv.toPlayerId === pid;
    declineMut.mutate(
      { id: inv.id },
      {
        onSuccess: () => {
          invalidatePending();
          toast({
            title: isReceived ? "Rematch declined" : "Rematch cancelled",
            description: isReceived
              ? `You passed on ${inviteName(inv, pid)}'s challenge.`
              : `Your challenge to ${inviteName(inv, pid)} was cancelled.`,
          });
        },
        onError: (err) => {
          toast({
            title: "Could not update invite",
            description: String((err as Error).message ?? "Try again in a moment."),
            variant: "destructive",
          });
        },
      },
    );
  }

  const received = pending.filter((p) => p.toPlayerId === pid);
  const sent = pending.filter((p) => p.fromPlayerId === pid);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 pb-24 px-2">
        <Link href="/compete">
          <Button
            variant="ghost"
            size="sm"
            className="font-bold"
            data-testid="link-back-to-compete"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Compete
          </Button>
        </Link>

        {/* Page header */}
        <div className="relative rounded-3xl overflow-hidden border border-orange-500/30 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-600/30 via-red-900/20 to-black" />
          <div className="relative z-10 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-5 h-5 text-orange-400" />
              <span className="font-black text-lg">Your Rivals</span>
              {received.length > 0 && (
                <GlowBadge tone="primary">
                  {received.length} new
                </GlowBadge>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Track every head-to-head record, current streaks, and incoming rematch
              challenges from the players who can't stop battling you.
            </p>
          </div>
        </div>

        {/* ── Pending rematch invites ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Pending Rematches
            </h2>
            {received.length > 0 && (
              <span
                className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center"
                data-testid="badge-received-count"
              >
                {received.length}
              </span>
            )}
          </div>

          {pendingError && pending.length === 0 ? (
            <ErrorCard
              title="Couldn't load pending rematches"
              onRetry={() => refetchPending()}
            />
          ) : pendingLoading && pending.length === 0 ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : pending.length === 0 ? (
            <GlassCard className="p-6 text-center text-sm text-muted-foreground">
              No pending rematch challenges. Send one from a rival below!
            </GlassCard>
          ) : (
            <div className="space-y-2">
              {received.map((inv) => {
                const name = inviteName(inv, pid);
                const isProcessing =
                  (acceptMut.isPending && acceptMut.variables?.id === inv.id) ||
                  (declineMut.isPending && declineMut.variables?.id === inv.id);
                return (
                  <GlassCard
                    key={inv.id}
                    glow="primary"
                    className="p-4"
                    data-testid={`card-received-invite-${inv.id}`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/20 text-primary">
                            Incoming
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {inv.mode}
                          </span>
                        </div>
                        <p className="font-black mt-1 truncate">
                          {name} wants a rematch
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires {formatRelative(inv.expiresAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="font-bold"
                          onClick={() => onDecline(inv)}
                          disabled={isProcessing}
                          data-testid={`button-decline-${inv.id}`}
                        >
                          <X className="w-4 h-4 mr-1" /> Decline
                        </Button>
                        <Button
                          size="sm"
                          className="font-bold"
                          onClick={() => onAccept(inv)}
                          disabled={isProcessing}
                          data-testid={`button-accept-${inv.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" /> Accept
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}

              {sent.map((inv) => {
                const name = inviteName(inv, pid);
                const isProcessing =
                  declineMut.isPending && declineMut.variables?.id === inv.id;
                return (
                  <GlassCard
                    key={inv.id}
                    className="p-4"
                    data-testid={`card-sent-invite-${inv.id}`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                            <Send className="w-3 h-3 inline mr-1" /> Sent
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {inv.mode}
                          </span>
                        </div>
                        <p className="font-black mt-1 truncate">
                          Waiting on {name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires {formatRelative(inv.expiresAt)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="font-bold"
                        onClick={() => onDecline(inv)}
                        disabled={isProcessing}
                        data-testid={`button-cancel-${inv.id}`}
                      >
                        <X className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Rivals list ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Head-to-Head Records
            </h2>
          </div>

          {rivalsError && rivals.length === 0 ? (
            <ErrorCard
              title="Couldn't load rivals"
              onRetry={() => refetchRivals()}
            />
          ) : rivalsLoading && rivals.length === 0 ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : rivals.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No rivals yet. Battle the same opponent at least twice to start a
                rivalry.
              </p>
              <Link href="/compete/battle">
                <Button className="font-bold">
                  <Swords className="w-4 h-4 mr-1.5" /> Find a match
                </Button>
              </Link>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rivals.map((r: BattleRival) => {
                const ahead = r.wins > r.losses;
                const tied = r.wins === r.losses;
                const name =
                  r.opponentDisplayName ??
                  r.opponentUsername ??
                  `Player #${r.opponentId}`;
                return (
                  <GlassCard
                    key={r.opponentId}
                    className="p-0 overflow-hidden"
                    data-testid={`card-rival-${r.opponentId}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/compete/rivals/${r.opponentId}`)
                      }
                      className="w-full text-left p-4 hover:bg-white/5 transition focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-t-2xl"
                      aria-label={`View battle history vs ${name}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.totalBattles} battle
                            {r.totalBattles === 1 ? "" : "s"} · last{" "}
                            {formatRelative(r.lastBattleAt)}
                          </p>
                        </div>
                        <div
                          className={`text-right font-black text-lg leading-none ${
                            ahead
                              ? "text-green-400"
                              : tied
                              ? "text-yellow-300"
                              : "text-red-400"
                          }`}
                          data-testid={`text-rival-record-${r.opponentId}`}
                        >
                          {r.wins}
                          <span className="text-muted-foreground/60 text-base mx-0.5">
                            –
                          </span>
                          {r.losses}
                          {r.draws > 0 && (
                            <span className="text-muted-foreground text-xs font-bold ml-1">
                              ({r.draws}D)
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="px-4 pb-4 -mt-1 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            ahead
                              ? "bg-green-500/15 text-green-300"
                              : tied
                              ? "bg-yellow-500/15 text-yellow-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {ahead ? "Ahead" : tied ? "Tied" : "Behind"}
                        </span>
                        {r.streakCount > 0 && (
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              r.streakType === "W"
                                ? "bg-green-500/20 text-green-300"
                                : r.streakType === "L"
                                ? "bg-red-500/20 text-red-300"
                                : "bg-yellow-500/20 text-yellow-300"
                            }`}
                            data-testid={`text-rival-streak-${r.opponentId}`}
                            title={`Current ${
                              r.streakType === "W"
                                ? "win"
                                : r.streakType === "L"
                                ? "loss"
                                : "draw"
                            } streak`}
                          >
                            {r.streakType}
                            {r.streakCount}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            r.lastEloChange > 0
                              ? "bg-green-500/10 text-green-300"
                              : r.lastEloChange < 0
                              ? "bg-red-500/10 text-red-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                          title="ELO swing from your most recent battle"
                        >
                          Last: {r.lastEloChange > 0 ? "+" : ""}
                          {r.lastEloChange} ELO
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="font-bold text-xs"
                        onClick={() =>
                          navigate(`/compete/rivals/${r.opponentId}`)
                        }
                        data-testid={`button-view-rival-${r.opponentId}`}
                      >
                        View log
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
