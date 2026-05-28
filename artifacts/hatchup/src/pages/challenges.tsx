import { useState } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useListChallenges,
  getListChallengesQueryKey,
  useJoinChallenge,
  type ChallengeListItem,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SafetyBanner } from "@/components/safety-banner";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Users, Clock, Flame, Plus, ChevronRight,
  Zap, Coins, Target, Swords, Globe, Lock, MapPin, Users2,
  TrendingUp,
} from "lucide-react";

type Tab = "trending" | "nearby" | "friends" | "my";

const METRIC_META: Record<string, { label: string; icon: string }> = {
  steps:       { label: "Steps",       icon: "👟" },
  pushups:     { label: "Pushups",     icon: "💪" },
  workouts:    { label: "Workouts",    icon: "🏋️" },
  streak_days: { label: "Streak Days", icon: "🔥" },
  calories:    { label: "Calories",    icon: "🍎" },
  miles:       { label: "Miles",       icon: "🏃" },
  pullups:     { label: "Pullups",     icon: "🤸" },
};

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  public:  { label: "Public",  icon: <Globe className="w-3 h-3" /> },
  private: { label: "Private", icon: <Lock className="w-3 h-3" /> },
  guild:   { label: "Guild",   icon: <Users2 className="w-3 h-3" /> },
  city:    { label: "City",    icon: <MapPin className="w-3 h-3" /> },
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

function ChallengeCard({ challenge, onJoin }: {
  challenge: ChallengeListItem;
  onJoin: (id: number) => void;
}) {
  const [, navigate] = useLocation();
  const metric = METRIC_META[challenge.metric] ?? { label: challenge.metric, icon: "🏆" };
  const type = TYPE_META[challenge.type] ?? { label: challenge.type, icon: <Globe className="w-3 h-3" /> };
  const isCompleted = challenge.status === "completed";
  const isExpired = new Date(challenge.endAt) < new Date() && !isCompleted;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        className={`border-border/50 bg-card/60 hover:bg-card/80 cursor-pointer transition-all duration-200 hover:border-primary/30 ${isCompleted ? "opacity-70" : ""}`}
        onClick={() => navigate(`/challenges/${challenge.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xl">{metric.icon}</span>
                <span className="font-black text-base text-foreground truncate">{challenge.title}</span>
                {isCompleted && <Badge variant="secondary" className="text-xs shrink-0">Ended</Badge>}
                {isExpired && !isCompleted && <Badge variant="destructive" className="text-xs shrink-0">Expired</Badge>}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                <span className="flex items-center gap-1">
                  {type.icon}
                  {type.label}
                </span>
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {challenge.targetValue.toLocaleString()} {metric.label}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {challenge.participantCount} players
                </span>
              </div>

              {/* Prizes */}
              <div className="flex items-center gap-3 text-xs mb-3">
                <span className="flex items-center gap-1 text-yellow-400 font-bold">
                  <Zap className="w-3 h-3" />
                  {challenge.rewardXp} XP
                </span>
                <span className="flex items-center gap-1 text-amber-400 font-bold">
                  <Coins className="w-3 h-3" />
                  {challenge.rewardCoins}
                </span>
                {challenge.requiresPublicMeetup && (
                  <span className="flex items-center gap-1 text-orange-400 font-semibold">
                    <MapPin className="w-3 h-3" />
                    Meetup
                  </span>
                )}
              </div>

              {/* Countdown */}
              {!isCompleted && !isExpired && (
                <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
                  <Clock className="w-3 h-3" />
                  {formatCountdown(challenge.endAt)}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              {challenge.isJoined ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs"
                  onClick={(e) => { e.stopPropagation(); navigate(`/challenges/${challenge.id}`); }}
                >
                  View <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              ) : !isCompleted && !isExpired ? (
                <Button
                  size="sm"
                  className="text-xs bg-primary hover:bg-primary/90"
                  onClick={(e) => { e.stopPropagation(); onJoin(challenge.id); }}
                >
                  Join <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="text-xs">
                  View <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Challenges() {
  const [tab, setTab] = useState<Tab>("trending");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: challenges, isLoading } = useListChallenges(
    { tab },
    { query: { queryKey: getListChallengesQueryKey({ tab }) } }
  );

  const joinMutation = useJoinChallenge({
    mutation: {
      onSuccess: (_, { id }) => {
        toast({ title: "Joined!", description: "You've joined the challenge. Good luck! 🏆" });
        queryClient.invalidateQueries({ queryKey: getListChallengesQueryKey({ tab }) });
        navigate(`/challenges/${id}`);
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Could not join", description: err?.response?.data?.error ?? "Try again", variant: "destructive" });
      },
    },
  });

  const hasMeetupChallenge = challenges?.some(c => c.requiresPublicMeetup && c.status === "active");

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        {/* Header */}
        <div className="text-center py-6">
          <h1 className="text-4xl font-black tracking-tight text-primary mb-2 flex items-center justify-center gap-3">
            <Swords className="w-9 h-9" /> Challenges
          </h1>
          <p className="text-muted-foreground font-medium">Compete in community fitness battles</p>
        </div>

        {hasMeetupChallenge && <SafetyBanner variant="event" dismissible />}

        {/* Create CTA */}
        <Button
          className="w-full h-12 text-base font-black bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          onClick={() => navigate("/challenges/create")}
        >
          <Plus className="w-5 h-5 mr-2" /> Create Challenge
        </Button>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid grid-cols-4 w-full bg-muted/40">
            <TabsTrigger value="trending" className="text-xs font-bold">
              <TrendingUp className="w-3 h-3 mr-1" />Trending
            </TabsTrigger>
            <TabsTrigger value="nearby" className="text-xs font-bold">
              <MapPin className="w-3 h-3 mr-1" />Nearby
            </TabsTrigger>
            <TabsTrigger value="friends" className="text-xs font-bold">
              <Users className="w-3 h-3 mr-1" />Friends
            </TabsTrigger>
            <TabsTrigger value="my" className="text-xs font-bold">
              <Trophy className="w-3 h-3 mr-1" />Mine
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Challenge list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {challenges && challenges.length > 0 ? (
                challenges.map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    onJoin={(id) => joinMutation.mutate({ id })}
                  />
                ))
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-bold text-lg">No challenges here yet</p>
                  <p className="text-sm mt-1">Be the first to create one!</p>
                  <Button className="mt-4" onClick={() => navigate("/challenges/create")}>
                    <Plus className="w-4 h-4 mr-2" /> Create Challenge
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </Layout>
  );
}
