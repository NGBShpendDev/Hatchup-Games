import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { formatRoundCountdown } from "@/lib/roundCountdown";
import {
  useGetChallenge,
  getGetChallengeQueryKey,
  useJoinChallenge,
  useSubmitChallengeProgress,
  useReportChallenge,
  useInviteToChallenge,
  useSearchPlayers,
  getSearchPlayersQueryKey,
  useCreatePost,
  type PlayerStub,
} from "@workspace/api-client-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SafetyBanner } from "@/components/safety-banner";
import { ReportBlockMenu } from "@/components/report-block-menu";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { RewardSummaryModal, type RewardEntry } from "@/components/reward-summary-modal";
import { ChampionVictoryOverlay } from "@/components/champion-victory-overlay";
import { PodiumFinishOverlay } from "@/components/podium-finish-overlay";
import {
  Trophy, Users, Users2, Clock, Zap, Coins, Target, ArrowLeft,
  MapPin, Share2, CheckCircle2, Medal, Crown,
  Plus, Minus, MoreVertical, UserPlus, Search, Check, Swords, XCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MutualWorkoutPartnersLine } from "@/components/mutual-workout-partners";

const METRIC_META: Record<string, { label: string; icon: string; unit: string }> = {
  steps:       { label: "Steps",       icon: "👟", unit: "steps"   },
  pushups:     { label: "Pushups",     icon: "💪", unit: "reps"    },
  workouts:    { label: "Workouts",    icon: "🏋️", unit: "sessions" },
  streak_days: { label: "Streak Days", icon: "🔥", unit: "days"    },
  calories:    { label: "Calories",    icon: "🍎", unit: "cal"     },
  miles:       { label: "Miles",       icon: "🏃", unit: "miles"   },
  pullups:     { label: "Pullups",     icon: "🤸", unit: "reps"    },
};

function formatCountdown(endAt: string): string {
  const diff = new Date(endAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m left`;
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="w-5 h-5 flex items-center justify-center text-xs font-black text-muted-foreground">#{rank}</span>;
}

export default function ChallengeDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { player } = usePlayer();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [countdown, setCountdown] = useState("");
  const [roundCountdown, setRoundCountdown] = useState("");
  const prevRoundRef = useRef<number | null>(null);
  const prevEliminatedRef = useRef<boolean | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(100);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [invitedIds, setInvitedIds] = useState<Set<number>>(new Set());
  const [rewardSummary, setRewardSummary] = useState<{ open: boolean; entries: RewardEntry[]; title?: string }>({ open: false, entries: [] });
  const [championOverlayOpen, setChampionOverlayOpen] = useState(false);
  const [victoryShared, setVictoryShared] = useState(false);
  const [podiumOverlayOpen, setPodiumOverlayOpen] = useState(false);
  const [podiumRank, setPodiumRank] = useState<2 | 3 | null>(null);
  const [podiumShared, setPodiumShared] = useState(false);

  // Debounce the search input by 300ms to avoid hammering the API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inviteSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [inviteSearch]);

  const challengeId = Number(id);
  const { data: challenge, isLoading } = useGetChallenge(
    challengeId,
    { query: { queryKey: getGetChallengeQueryKey(challengeId), refetchInterval: 30000 } }
  );

  const searchParams = { q: debouncedSearch, limit: 20 };
  const { data: searchResults, isLoading: searchLoading, isFetching: searchFetching } = useSearchPlayers(
    searchParams,
    {
      query: {
        queryKey: getSearchPlayersQueryKey(searchParams),
        enabled: inviteOpen && debouncedSearch.length > 0,
      },
    }
  );

  // Live countdown — refresh every second when <1h remains for the round so
  // the "Next cut in …" banner feels alive in the final stretch.
  useEffect(() => {
    if (!challenge) return;
    const update = () => {
      setCountdown(formatCountdown(challenge.endAt));
      setRoundCountdown(formatRoundCountdown(challenge.endAt));
    };
    update();
    const diff = new Date(challenge.endAt).getTime() - Date.now();
    const tick = diff > 0 && diff < 3600_000 ? 1000 : 60_000;
    const t = setInterval(update, tick);
    return () => clearInterval(t);
  }, [challenge]);

  // Round advance / elimination celebrations. We diff against the prior
  // snapshot so the modal only opens when the bracket actually changes
  // (e.g. the 30s refetch picks up an auto-advanced round). Tournament
  // round wins now route through the unified RewardSummaryModal so they
  // get the same celebratory treatment as challenge progress / battle
  // wins — including bracket position, next-opponent preview, and the
  // grand-prize still in play.
  useEffect(() => {
    if (!challenge || !player) return;
    const c = challenge as unknown as {
      isElimination?: boolean;
      currentRound?: number;
      rewardXp?: number;
      rewardCoins?: number;
      leaderboard?: {
        playerId: number;
        currentValue?: number;
        eliminated: boolean;
        eliminatedRound?: number | null;
        player?: { username?: string; displayName?: string | null } | null;
      }[];
    };
    if (!c.isElimination) return;
    const round = c.currentRound ?? 1;
    const board = c.leaderboard ?? [];
    const me = board.find(e => e.playerId === player.id);
    if (!me) return;

    const prevRound = prevRoundRef.current;
    const prevEliminated = prevEliminatedRef.current;

    if (prevRound !== null && prevEliminated !== null) {
      const survivors = board.filter(e => !e.eliminated);
      const baseXp = c.rewardXp ?? 0;
      const baseCoins = c.rewardCoins ?? 0;

      if (!prevEliminated && me.eliminated) {
        // Final placement = surviving players + 1 (you were the next out).
        // This is the same ordering the bracket card already shows.
        const placement = survivors.length + 1;
        const cutRound = me.eliminatedRound ?? round;
        const entries: RewardEntry[] = [
          {
            kind: "challenge",
            label: `Eliminated in round ${cutRound}`,
            value: `#${placement}`,
            detail: "You went the distance. Respect — every round counts.",
          },
        ];
        // Top-3 finishers still get a share when the bracket finalizes.
        // For anyone below that, be honest: no rewards this run.
        if (placement <= 3) {
          entries.push({
            kind: "xp",
            label: "Final payout pending",
            detail: `Rewards finalize when the tournament wraps (top 3 share the prize).`,
          });
        } else {
          entries.push({
            kind: "leaderboard",
            label: "No payout this run",
            detail: "Top 3 finishers split the prize. Jump in the next bracket!",
          });
        }
        setRewardSummary({
          open: true,
          title: "Bracket Run Over",
          entries,
        });
      } else if (!prevEliminated && !me.eliminated && round > prevRound) {
        // Surfaced "next opponent": the strongest other survivor by their
        // last-round value (current cycle has just reset, so this leans on
        // the snapshot we already render in the bracket card).
        const opponents = survivors
          .filter(e => e.playerId !== player.id)
          .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
        const top = opponents[0];
        const topName =
          top?.player?.displayName ?? top?.player?.username ?? (top ? `Player ${top.playerId}` : null);

        const entries: RewardEntry[] = [
          {
            kind: "challenge",
            label: `Advanced to round ${round}`,
            value: `${survivors.length} left`,
            detail: "You survived the cut. Progress resets — go again!",
          },
        ];
        if (topName) {
          entries.push({
            kind: "leaderboard",
            label: "Next to beat",
            value: topName,
            detail: opponents.length > 1
              ? `${opponents.length - 1} other survivor${opponents.length - 1 === 1 ? "" : "s"} also in the hunt.`
              : "Heads up — it's coming down to the two of you.",
          });
        }
        if (baseXp > 0 || baseCoins > 0) {
          // Champion gets a 2× boost (see services/challengeRewards.ts).
          entries.push({
            kind: "xp",
            label: "Grand prize still in play",
            detail: `Win it all for ${(baseXp * 2).toLocaleString()} XP + ${(baseCoins * 2).toLocaleString()} coins.`,
          });
        }
        setRewardSummary({
          open: true,
          title: `Round ${round} Survived!`,
          entries,
        });
      }
    }

    prevRoundRef.current = round;
    prevEliminatedRef.current = me.eliminated;
  }, [challenge, player]);

  const joinMutation = useJoinChallenge({
    mutation: {
      onSuccess: () => {
        setRewardSummary({
          open: true,
          title: "You're in!",
          entries: [
            { kind: "challenge", label: "Challenge joined", detail: "Log progress to climb the leaderboard." },
          ],
        });
        queryClient.invalidateQueries({ queryKey: getGetChallengeQueryKey(challengeId) });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error ?? "Could not join", variant: "destructive" });
      },
    },
  });

  const progressMutation = useSubmitChallengeProgress({
    mutation: {
      onSuccess: (data: unknown) => {
        const updated = data as { currentValue?: number } | undefined;
        const newValue = updated?.currentValue;
        const target = (challenge as unknown as { targetValue: number } | undefined)?.targetValue ?? 0;
        const reachedGoal = newValue != null && target > 0 && newValue >= target;
        const prevRank = myEntry?.rank;
        const entries: RewardEntry[] = [
          {
            kind: "challenge",
            label: "Progress logged",
            value: `+${progressValue.toLocaleString()}`,
            detail: newValue != null
              ? `Now ${newValue.toLocaleString()} / ${target.toLocaleString()} ${metric.unit}`
              : `${metric.label} challenge`,
          },
        ];
        if (prevRank) {
          entries.push({ kind: "leaderboard", label: "Leaderboard", value: `#${prevRank}`, detail: "Refreshing live standings..." });
        }
        if (reachedGoal) {
          entries.push({ kind: "xp", label: "Goal reached!", detail: "Your run is locked in for the final tally." });
        }
        setRewardSummary({
          open: true,
          title: reachedGoal ? "Goal Crushed!" : "Reward Summary",
          entries,
        });
        setProgressOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetChallengeQueryKey(challengeId) });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error ?? "Could not log progress", variant: "destructive" });
      },
    },
  });

  const inviteMutation = useInviteToChallenge({
    mutation: {
      onSuccess: (_, vars) => {
        setInvitedIds((prev) => new Set(prev).add(vars.data.inviteeId));
        toast({ title: "Invite sent!", description: "They'll see it on their challenges page." });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Could not invite", description: err?.response?.data?.error ?? "Try again", variant: "destructive" });
      },
    },
  });

  const shareContextRef = useRef<"champion" | "podium" | null>(null);

  const createPostMutation = useCreatePost({
    mutation: {
      onSuccess: () => {
        if (shareContextRef.current === "podium") {
          setPodiumShared(true);
          toast({ title: "Podium shared! 🥈", description: "Your finish is live on the feed." });
        } else {
          setVictoryShared(true);
          toast({ title: "Victory shared! 🏆", description: "Your win is live on the feed." });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({
          title: "Could not share",
          description: err?.response?.data?.error ?? "Try again in a moment.",
          variant: "destructive",
        });
      },
    },
  });

  const reportMutation = useReportChallenge({
    mutation: {
      onSuccess: () => toast({ title: "Reported", description: "Sent for moderation review." }),
    },
  });

  // Champion victory overlay trigger. Lives above the loading early-return so
  // hooks order stays stable. Reads the rank straight off the challenge payload.
  // The podium overlay (rank 2/3) follows the same pattern below.
  useEffect(() => {
    if (!challenge || !player) return;
    const c = challenge as unknown as {
      status?: string;
      isElimination?: boolean;
      leaderboard?: { playerId: number; rank?: number }[];
    };
    if (c.status !== "completed" || c.isElimination !== true) return;
    const me = (c.leaderboard ?? []).find((e) => e.playerId === player.id);
    const rank = me?.rank;
    if (rank === 1) {
      const key = `champion-overlay-seen:${player.id}:${challengeId}`;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        // localStorage unavailable — still show this session.
      }
      setChampionOverlayOpen(true);
    } else if (rank === 2 || rank === 3) {
      const key = `podium-overlay-seen:${player.id}:${challengeId}`;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        // localStorage unavailable — still show this session.
      }
      setPodiumRank(rank);
      setPodiumOverlayOpen(true);
    }
  }, [challenge, player, challengeId]);

  if (isLoading || !challenge) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto space-y-4 p-4 pb-24">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </Layout>
    );
  }

  type LeaderboardEntry = { id: number; playerId: number; currentValue: number; eliminated: boolean; eliminatedRound?: number | null; rank?: number; joinedAt: string; player?: { id: number; username: string; displayName?: string | null; avatarUrl?: string | null } | null };
  type RichChallenge = typeof challenge & { isJoined?: boolean; leaderboard?: LeaderboardEntry[]; creator?: { id: number; username: string; displayName?: string | null; avatarUrl?: string | null } | null };
  const rich = challenge as unknown as RichChallenge;
  const metric = METRIC_META[rich.metric] ?? { label: rich.metric, icon: "🏆", unit: "units" };
  const isJoined = rich.isJoined ?? false;
  const isCompleted = rich.status === "completed";
  const isExpired = new Date(rich.endAt) < new Date();
  const isCreator = !!player && rich.creatorId === player.id;
  const inviteResults: PlayerStub[] = (searchResults ?? []).filter((p) => p.id !== player?.id);
  const searchIsLoading = (searchLoading || searchFetching) && debouncedSearch.length > 0;
  const hasTypedQuery = inviteSearch.trim().length > 0;
  const queryStillDebouncing = hasTypedQuery && debouncedSearch !== inviteSearch.trim();
  const leaderboard: LeaderboardEntry[] = rich.leaderboard ?? [];
  const myEntry = leaderboard.find(e => e.playerId === player?.id);
  const targetValue = rich.targetValue;
  const isElimination = (rich as { isElimination?: boolean }).isElimination ?? false;
  const currentRound = (rich as { currentRound?: number }).currentRound ?? 1;

  // Boosted payout mirrors the server-side formula in
  // services/challengeRewards.ts (rank 1 + isElimination → 2× the base reward).
  const boostedXp = (rich as { rewardXp: number }).rewardXp * 2;
  const boostedCoins = (rich as { rewardCoins: number }).rewardCoins * 2;

  const dismissChampionOverlay = () => {
    setChampionOverlayOpen(false);
    if (player) {
      try {
        localStorage.setItem(`champion-overlay-seen:${player.id}:${challengeId}`, "1");
      } catch {
        // ignore — the overlay just won't be suppressed across reloads
      }
    }
  };

  // Tournament bracket size for the victory share. Falls back to the live
  // participant count when maxParticipants isn't set on the challenge row.
  const bracketSize =
    (rich as { maxParticipants?: number | null }).maxParticipants ??
    (rich as { participantCount?: number }).participantCount ??
    0;

  const challengeUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/challenges/${challengeId}`
      : `/challenges/${challengeId}`;

  const victoryShareText =
    `👑 I just won "${challenge.title}" — a ${bracketSize}-player elimination tournament on HatchUp! ` +
    `Boosted reward: ${boostedXp.toLocaleString()} XP + ${boostedCoins.toLocaleString()} coins. ` +
    `Join the next bracket: ${challengeUrl}`;

  const handleShareVictory = async () => {
    if (!player || victoryShared || createPostMutation.isPending) return;
    shareContextRef.current = "champion";
    try {
      await createPostMutation.mutateAsync({
        data: {
          playerId: player.id,
          content: victoryShareText,
          postType: "tournament_win",
          metadata: {
            challengeId: Number(challengeId),
            challengeTitle: challenge.title,
            bracketSize,
            boostedXp,
            boostedCoins,
          },
        },
      });
    } catch {
      // toast handled in mutation onError
      return;
    }
    // Native share sheet / copy-to-clipboard fallback (mirrors handleShare)
    if (typeof navigator === "undefined") return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: challenge.title, text: victoryShareText, url: challengeUrl });
      } catch {
        // user canceled — that's fine
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(victoryShareText);
        toast({ title: "Copied!", description: "Victory details copied to clipboard." });
      } catch {
        // clipboard unavailable — the feed post is still up
      }
    }
  };

  const dismissPodiumOverlay = () => {
    setPodiumOverlayOpen(false);
    if (player) {
      try {
        localStorage.setItem(`podium-overlay-seen:${player.id}:${challengeId}`, "1");
      } catch {
        // ignore — the overlay just won't be suppressed across reloads
      }
    }
  };

  const podiumRewardXp = (rich as { rewardXp: number }).rewardXp;
  const podiumRewardCoins = (rich as { rewardCoins: number }).rewardCoins;
  const podiumPlaceText = podiumRank === 2 ? "2nd" : "3rd";
  const podiumMedal = podiumRank === 2 ? "🥈" : "🥉";
  const podiumShareText =
    `${podiumMedal} I made the podium — ${podiumPlaceText} place in "${challenge.title}", ` +
    `a ${bracketSize}-player elimination tournament on HatchUp! ` +
    `Think you can outlast me? Join the next bracket: ${challengeUrl}`;

  const handleSharePodium = async () => {
    if (!player || !podiumRank || podiumShared || createPostMutation.isPending) return;
    shareContextRef.current = "podium";
    try {
      await createPostMutation.mutateAsync({
        data: {
          playerId: player.id,
          content: podiumShareText,
          postType: "streak_milestone",
        },
      });
    } catch {
      // toast handled in mutation onError
      return;
    }
    if (typeof navigator === "undefined") return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: challenge.title, text: podiumShareText, url: challengeUrl });
      } catch {
        // user canceled — that's fine
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(podiumShareText);
        toast({ title: "Copied!", description: "Podium details copied to clipboard." });
      } catch {
        // clipboard unavailable — the feed post is still up
      }
    }
  };

  // Build bracket rounds: each round shows the players who were in it.
  // Survivors of round N appear in round N+1; players eliminated in round N
  // appear once in round N marked as eliminated.
  const bracketRounds: { round: number; entries: LeaderboardEntry[] }[] = [];
  if (isElimination) {
    const maxRound = Math.max(
      currentRound,
      ...leaderboard.map(e => e.eliminatedRound ?? 0),
    );
    for (let r = 1; r <= maxRound; r++) {
      const entries = leaderboard.filter(e => {
        if (e.eliminated) {
          return (e.eliminatedRound ?? 0) >= r;
        }
        return true;
      });
      // Within a round, eliminated players (those leaving this round) go to the bottom.
      const sorted = [...entries].sort((a, b) => {
        const aOut = a.eliminated && (a.eliminatedRound ?? 0) === r ? 1 : 0;
        const bOut = b.eliminated && (b.eliminatedRound ?? 0) === r ? 1 : 0;
        if (aOut !== bOut) return aOut - bOut;
        return (b.currentValue ?? 0) - (a.currentValue ?? 0);
      });
      bracketRounds.push({ round: r, entries: sorted });
    }
  }

  const shareText = `I'm competing in "${challenge.title}" on HatchUp! ${myEntry ? `My progress: ${myEntry.currentValue}/${targetValue} ${metric.unit}` : "Join me!"} 🏆`;
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: challenge.title, text: shareText });
    } else {
      navigator.clipboard.writeText(shareText);
      toast({ title: "Copied!", description: "Challenge details copied to clipboard." });
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-24">
        {/* Back + header */}
        <div className="flex items-center gap-3 pt-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/challenges")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground truncate">{challenge.title}</h1>
            <p className="text-xs text-muted-foreground">
              by{" "}
              {rich.creatorId ? (
                <Link
                  href={`/players/${rich.creatorId}`}
                  className="hover:text-primary transition-colors"
                  data-testid={`link-profile-${rich.creatorId}`}
                >
                  {rich.creator?.username ?? "Unknown"}
                </Link>
              ) : (
                rich.creator?.username ?? "Unknown"
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleShare}>
              <Share2 className="w-4 h-4" />
            </Button>
            <ReportBlockMenu
              trigger={<Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>}
              targetPlayerId={rich.creatorId}
              targetName={rich.creator?.username ?? "Creator"}
              contentType="challenge"
              contentId={challengeId}
            />
          </div>
        </div>

        {/* Safety banner if meetup required */}
        {(challenge as { requiresPublicMeetup: boolean }).requiresPublicMeetup && (
          <SafetyBanner variant="event" dismissible={false} />
        )}

        {/* Status + countdown */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{metric.icon}</span>
                <div>
                  <p className="font-black text-foreground">{metric.label} Challenge</p>
                  <p className="text-xs text-muted-foreground">
                    Target: {targetValue.toLocaleString()} {metric.unit}
                  </p>
                </div>
              </div>
              <Badge variant={isCompleted ? "secondary" : "default"} className="text-sm font-bold px-3 py-1">
                {isCompleted ? "Completed" : isExpired ? "Expired" : "Active"}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Prize (1st)</p>
                <p className="text-sm font-black text-yellow-400 flex items-center justify-center gap-1">
                  <Zap className="w-3.5 h-3.5" />{(challenge as { rewardXp: number }).rewardXp} XP
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Coins</p>
                <p className="text-sm font-black text-amber-400 flex items-center justify-center gap-1">
                  <Coins className="w-3.5 h-3.5" />{(challenge as { rewardCoins: number }).rewardCoins}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Players</p>
                <p className="text-sm font-black flex items-center justify-center gap-1">
                  <Users className="w-3.5 h-3.5" />{(challenge as { participantCount: number }).participantCount}
                </p>
              </div>
            </div>

            {!isCompleted && !isExpired && (
              <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-primary">
                <Clock className="w-4 h-4" />
                {isElimination ? `Round ${currentRound} ends in ${roundCountdown}` : countdown}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next cut banner (elimination tournaments only) */}
        {isElimination && !isCompleted && !isExpired && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-purple-900/20 to-fuchsia-950/40 px-4 py-3"
            data-testid="banner-next-cut"
          >
            <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
              <Swords className="w-4 h-4 text-purple-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-black text-purple-300/80">
                Next cut in
              </p>
              <p className="text-base font-black text-foreground" data-testid="text-next-cut">
                {roundCountdown}
              </p>
            </div>
            <Badge variant="secondary" className="bg-purple-500/20 text-purple-200 border-purple-500/30 font-black">
              Round {currentRound}
            </Badge>
          </motion.div>
        )}

        {/* Description */}
        {challenge.description && (
          <p className="text-sm text-muted-foreground px-1">{challenge.description}</p>
        )}

        {/* My progress */}
        {isJoined && myEntry && (
          <Card className="border-green-500/20 bg-green-950/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-sm text-green-300">My Progress</p>
                <span className="text-xs text-muted-foreground">
                  {myEntry.currentValue.toLocaleString()} / {targetValue.toLocaleString()} {metric.unit}
                </span>
              </div>
              <Progress
                value={Math.min(100, (myEntry.currentValue / targetValue) * 100)}
                className="h-2 bg-muted"
              />
              {myEntry.currentValue >= targetValue && (
                <p className="text-xs text-green-400 font-bold mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Goal reached!
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        {!isCompleted && !isExpired && (
          <div className="flex gap-3">
            {!isJoined ? (
              <Button
                className="flex-1 bg-primary hover:bg-primary/90 font-black"
                onClick={() => joinMutation.mutate({ id: challengeId })}
                disabled={joinMutation.isPending}
              >
                {joinMutation.isPending ? "Joining…" : "Join Challenge"}
              </Button>
            ) : (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-500 font-black"
                onClick={() => setProgressOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" /> Log Progress
              </Button>
            )}
            {isCreator && (
              <Button
                variant="outline"
                className="font-black border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setInviteOpen(true)}
              >
                <UserPlus className="w-4 h-4 mr-2" /> Invite
              </Button>
            )}
          </div>
        )}

        {/* Completed podium */}
        {isCompleted && leaderboard.length >= 1 && (
          <Card className="border-yellow-500/20 bg-yellow-950/10">
            <CardContent className="p-4">
              <h3 className="font-black text-yellow-300 mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5" /> Final Results
              </h3>
              <div className="flex justify-around items-end gap-2">
                {[1, 0, 2].map((idx) => {
                  const entry = leaderboard[idx];
                  if (!entry) return <div key={idx} className="flex-1" />;
                  const podiumRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                  const heights = ["h-16", "h-24", "h-12"];
                  const colors = ["bg-slate-600/40", "bg-yellow-600/40", "bg-amber-700/40"];
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                      <Link
                        href={`/players/${entry.playerId}`}
                        className="text-xs font-bold text-muted-foreground truncate max-w-[80px] hover:text-primary transition-colors"
                        data-testid={`link-profile-${entry.playerId}`}
                      >
                        {entry.player?.displayName ?? entry.player?.username ?? `Player ${entry.playerId}`}
                      </Link>
                      <p className="text-xs text-primary font-black">
                        {entry.currentValue.toLocaleString()} {metric.unit}
                      </p>
                      <div className={`w-full rounded-t-lg ${heights[idx]} ${colors[idx]} flex items-start justify-center pt-2`}>
                        <RankIcon rank={podiumRank} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Elimination bracket */}
        {isElimination && bracketRounds.length > 0 && (
          <Card className="border-purple-500/20 bg-purple-950/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-purple-300 flex items-center gap-2">
                  <Swords className="w-5 h-5" />
                  Tournament Bracket
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {isCompleted ? `Final · ${bracketRounds.length} round${bracketRounds.length === 1 ? "" : "s"}` : `Round ${currentRound}`}
                </Badge>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {bracketRounds.map(({ round, entries }) => {
                  const isActive = !isCompleted && round === currentRound;
                  return (
                  <div
                    key={round}
                    className={`shrink-0 w-56 space-y-2 rounded-xl p-2 transition-all ${
                      isActive
                        ? "bg-purple-500/10 ring-2 ring-purple-400/60 shadow-[0_0_20px_-4px_rgba(168,85,247,0.5)]"
                        : "opacity-80"
                    }`}
                    data-testid={isActive ? "round-active" : `round-${round}`}
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-xs font-black uppercase tracking-wider ${isActive ? "text-purple-100" : "text-purple-200"}`}>
                          Round {round}
                        </p>
                        {isActive && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-purple-300 opacity-75 animate-ping" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-300" />
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-bold">
                        {entries.length} {entries.length === 1 ? "player" : "players"}
                      </span>
                    </div>
                    {isActive && (
                      <p className="px-1 text-[10px] font-bold text-purple-200/80 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> Cut in {roundCountdown}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {entries.map((entry) => {
                        const outThisRound = entry.eliminated && (entry.eliminatedRound ?? 0) === round;
                        const isMe = entry.playerId === player?.id;
                        const name = entry.player?.displayName ?? entry.player?.username ?? `Player ${entry.playerId}`;
                        return (
                          <div
                            key={`${round}-${entry.id}`}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                              outThisRound
                                ? "bg-destructive/10 border-destructive/30 opacity-60"
                                : isMe
                                  ? "bg-primary/10 border-primary/30"
                                  : "bg-muted/30 border-border/40"
                            }`}
                          >
                            <Link
                              href={`/players/${entry.playerId}`}
                              className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                              data-testid={`link-profile-${entry.playerId}`}
                            >
                              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-black shrink-0 overflow-hidden">
                                {entry.player?.avatarUrl ? (
                                  <img src={entry.player.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <p className={`flex-1 min-w-0 truncate text-xs font-bold ${outThisRound ? "line-through text-muted-foreground" : isMe ? "text-primary" : "text-foreground"}`}>
                                {name}{isMe && !outThisRound && <span className="text-[10px] ml-1 text-primary/70">(you)</span>}
                              </p>
                            </Link>
                            {outThisRound ? (
                              <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            ) : round === bracketRounds.length && isCompleted && entries.length === 1 ? (
                              <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-400/70 shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
              {!isCompleted && (
                <p className="text-[11px] text-muted-foreground mt-3 text-center">
                  Bottom half is eliminated when the round timer ends. Progress resets each round.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Live leaderboard */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="font-black text-foreground mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Live Leaderboard
              <Badge variant="secondary" className="text-xs ml-auto">
                {leaderboard.length} players
              </Badge>
            </h3>

            {leaderboard.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">
                No participants yet. Be the first!
              </p>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry, i) => {
                  const rank = entry.rank ?? i + 1;
                  const pct = Math.min(100, targetValue > 0 ? (entry.currentValue / targetValue) * 100 : 0);
                  const isMe = entry.playerId === player?.id;
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`flex items-center gap-3 p-2 rounded-xl transition-all ${isMe ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/30"} ${entry.eliminated ? "opacity-40" : ""}`}
                    >
                      <RankIcon rank={rank} />
                      <Link
                        href={`/players/${entry.playerId}`}
                        className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-black shrink-0 overflow-hidden hover:opacity-80 transition-opacity"
                        data-testid={`link-profile-${entry.playerId}`}
                      >
                        {entry.player?.avatarUrl ? (
                          <img src={entry.player.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (entry.player?.displayName ?? entry.player?.username ?? "?").charAt(0).toUpperCase()
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <Link
                            href={`/players/${entry.playerId}`}
                            className={`text-sm font-bold truncate hover:text-primary transition-colors ${isMe ? "text-primary" : "text-foreground"}`}
                            data-testid={`link-profile-name-${entry.playerId}`}
                          >
                            {entry.player?.displayName ?? entry.player?.username ?? `Player ${entry.playerId}`}
                            {isMe && <span className="text-xs ml-1 text-primary/70">(you)</span>}
                          </Link>
                          <p className="text-xs text-muted-foreground font-bold shrink-0 ml-2">
                            {entry.currentValue.toLocaleString()} / {targetValue.toLocaleString()}
                          </p>
                        </div>
                        <Progress value={pct} className="h-1.5 bg-muted" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tournament champion victory overlay — one-time, dismissed forever via localStorage */}
      <ChampionVictoryOverlay
        show={championOverlayOpen}
        challengeTitle={challenge.title}
        boostedXp={boostedXp}
        boostedCoins={boostedCoins}
        onDismiss={dismissChampionOverlay}
        onShare={handleShareVictory}
        isSharing={shareContextRef.current === "champion" && createPostMutation.isPending}
        shared={victoryShared}
      />

      {/* Podium finish overlay — same one-time pattern for ranks 2 and 3 */}
      {podiumRank !== null && (
        <PodiumFinishOverlay
          show={podiumOverlayOpen}
          rank={podiumRank}
          challengeTitle={challenge.title}
          rewardXp={podiumRewardXp}
          rewardCoins={podiumRewardCoins}
          onDismiss={dismissPodiumOverlay}
          onShare={handleSharePodium}
          isSharing={shareContextRef.current === "podium" && createPostMutation.isPending}
          shared={podiumShared}
        />
      )}

      {/* Unified reward summary — fires on join and every progress submission */}
      <RewardSummaryModal
        open={rewardSummary.open}
        onClose={() => setRewardSummary({ open: false, entries: [] })}
        title={rewardSummary.title ?? "Reward Summary"}
        rewards={rewardSummary.entries}
      />

      {/* Progress dialog */}
      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Progress</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              How many {metric.unit} do you want to add?
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setProgressValue(Math.max(1, progressValue - 10))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min={1}
                value={progressValue}
                onChange={(e) => setProgressValue(Math.max(1, Number(e.target.value)))}
                className="text-center font-black text-xl"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setProgressValue(progressValue + 10)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              {[50, 100, 500, 1000].map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setProgressValue(v)}
                >
                  +{v >= 1000 ? `${v / 1000}k` : v}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProgressOpen(false)}>Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={() => progressMutation.mutate({ id: challengeId, data: { value: progressValue } })}
              disabled={progressMutation.isPending}
            >
              {progressMutation.isPending ? "Logging…" : `Log +${progressValue.toLocaleString()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite friends sheet */}
      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] flex flex-col">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <UserPlus className="w-5 h-5 text-primary" /> Invite Friends
            </SheetTitle>
            <SheetDescription>
              Search for anyone to invite to "{challenge.title}".
            </SheetDescription>
          </SheetHeader>

          <div className="relative mt-4 px-4">
            <Search className="w-4 h-4 absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or username…"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="flex-1 mt-3 px-4 pb-4">
            {!hasTypedQuery ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-bold">Search for players to invite</p>
                <p className="text-xs mt-1">Type a name or username to get started.</p>
              </div>
            ) : searchIsLoading || queryStillDebouncing ? (
              <div className="space-y-2 py-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : inviteResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-bold">No matches</p>
                <p className="text-xs mt-1">Try a different name or username.</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {inviteResults.map((p) => {
                  const invited = invitedIds.has(p.id);
                  const isPending =
                    inviteMutation.isPending &&
                    inviteMutation.variables?.data.inviteeId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-black shrink-0 overflow-hidden">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (p.displayName ?? p.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {p.displayName ?? p.username}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                        {p.sharedGroups && p.sharedGroups.length > 0 && (() => {
                          const names = p.sharedGroups.map(g => g.name);
                          const preview = names.slice(0, 2).join(" & ");
                          const extra = names.length - 2;
                          return (
                            <p
                              className="text-[10px] font-bold mt-0.5 flex items-center gap-1 text-purple-400 truncate"
                              data-testid={`invite-shared-groups-${p.id}`}
                            >
                              <Users2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                Also in {preview}{extra > 0 ? ` +${extra} more` : ""} with you
                              </span>
                            </p>
                          );
                        })()}
                        {p.mutualWorkoutPartners && p.mutualWorkoutPartners.length > 0 && (
                          <MutualWorkoutPartnersLine
                            partners={p.mutualWorkoutPartners}
                            onViewProfile={(pid) => navigate(`/players/${pid}`)}
                            testIdPrefix={`invite-${p.id}`}
                            className="text-[10px] font-bold mt-0.5 flex items-center gap-1 text-emerald-400 truncate"
                          />
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={invited ? "secondary" : "default"}
                        disabled={invited || isPending}
                        onClick={() =>
                          inviteMutation.mutate({
                            id: challengeId,
                            data: { inviteeId: p.id },
                          })
                        }
                        className={invited ? "" : "bg-primary hover:bg-primary/90"}
                      >
                        {invited ? (
                          <><Check className="w-3.5 h-3.5 mr-1" /> Invited</>
                        ) : isPending ? (
                          "Sending…"
                        ) : (
                          "Invite"
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
