import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useGetChallenge,
  getGetChallengeQueryKey,
  useJoinChallenge,
  useSubmitChallengeProgress,
  useReportChallenge,
} from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
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
import {
  Trophy, Users, Clock, Zap, Coins, Target, ArrowLeft,
  MapPin, Share2, CheckCircle2, Medal, Crown,
  Plus, Minus, MoreVertical,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(100);

  const challengeId = Number(id);
  const { data: challenge, isLoading } = useGetChallenge(
    challengeId,
    { query: { queryKey: getGetChallengeQueryKey(challengeId), refetchInterval: 30000 } }
  );

  // Live countdown
  useEffect(() => {
    if (!challenge) return;
    const update = () => setCountdown(formatCountdown(challenge.endAt));
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [challenge]);

  const joinMutation = useJoinChallenge({
    mutation: {
      onSuccess: () => {
        toast({ title: "Joined!", description: "You're in. Go crush it! 💪" });
        queryClient.invalidateQueries({ queryKey: getGetChallengeQueryKey(challengeId) });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error ?? "Could not join", variant: "destructive" });
      },
    },
  });

  const progressMutation = useSubmitChallengeProgress({
    mutation: {
      onSuccess: () => {
        toast({ title: "Progress logged!", description: `+${progressValue} added to your total.` });
        setProgressOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetChallengeQueryKey(challengeId) });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error ?? "Could not log progress", variant: "destructive" });
      },
    },
  });

  const reportMutation = useReportChallenge({
    mutation: {
      onSuccess: () => toast({ title: "Reported", description: "Sent for moderation review." }),
    },
  });

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

  type LeaderboardEntry = { id: number; playerId: number; currentValue: number; eliminated: boolean; rank?: number; joinedAt: string; player?: { id: number; username: string; displayName?: string | null; avatarUrl?: string | null } | null };
  type RichChallenge = typeof challenge & { isJoined?: boolean; leaderboard?: LeaderboardEntry[]; creator?: { id: number; username: string; displayName?: string | null; avatarUrl?: string | null } | null };
  const rich = challenge as unknown as RichChallenge;
  const metric = METRIC_META[rich.metric] ?? { label: rich.metric, icon: "🏆", unit: "units" };
  const isJoined = rich.isJoined ?? false;
  const isCompleted = rich.status === "completed";
  const isExpired = new Date(rich.endAt) < new Date();
  const leaderboard: LeaderboardEntry[] = rich.leaderboard ?? [];
  const myEntry = leaderboard.find(e => e.playerId === player?.id);
  const targetValue = rich.targetValue;

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
              by {(challenge as { creator?: { username: string } | null }).creator?.username ?? "Unknown"}
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
                {countdown}
              </div>
            )}
          </CardContent>
        </Card>

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
                      <p className="text-xs font-bold text-muted-foreground truncate max-w-[80px]">
                        {entry.player?.displayName ?? entry.player?.username ?? `Player ${entry.playerId}`}
                      </p>
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
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-black shrink-0 overflow-hidden">
                        {entry.player?.avatarUrl ? (
                          <img src={entry.player.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (entry.player?.displayName ?? entry.player?.username ?? "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className={`text-sm font-bold truncate ${isMe ? "text-primary" : "text-foreground"}`}>
                            {entry.player?.displayName ?? entry.player?.username ?? `Player ${entry.playerId}`}
                            {isMe && <span className="text-xs ml-1 text-primary/70">(you)</span>}
                          </p>
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
    </Layout>
  );
}
