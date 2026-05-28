import { useState } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useGetPlayerDashboard, getGetPlayerDashboardQueryKey, useLogActivity, useGetSocialFeed, getGetSocialFeedQueryKey, useReactToPost, useAddPostComment } from "@workspace/api-client-react";
import type { PostComment } from "@workspace/api-client-react";
import { ComposeSheet, REACTION_ICONS } from "@/pages/social";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Zap, Flame, Trophy, Footprints, ChevronRight, PlusCircle, Star, Sparkles, Gift, Bot, Dumbbell, Minus, Plus, Users, MessageCircle, ChevronDown, ChevronUp, Send } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { XpBar } from "@/components/xp-bar";
import { SubscriptionChip } from "@/components/subscription-chip";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { ArtifactUnlockOverlay, type UnlockedArtifact } from "@/components/artifact-unlock-overlay";
import { ForYouStrip, type ForYouItem } from "@/components/for-you-strip";
import { RewardSummaryModal, type RewardEntry } from "@/components/reward-summary-modal";
import { Bot as BotIcon, Salad as SaladIcon, Swords as SwordsIcon, Users as UsersIcon, Trophy as TrophyIcon, Egg as EggLucide } from "lucide-react";

const OVERLAY_RARITIES = new Set(["Legendary", "Mythic", "Ancient", "Celestial"]);

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const BAR_MINI_ICONS: Record<string, string> = {
  strength: "💪", speed: "⚡", cardio: "🫀", recovery: "🌿",
  consistency: "🔥", endurance: "🏔️", agility: "🐆", discipline: "🧘",
};
const BAR_MINI_COLORS: Record<string, string> = {
  strength:    "from-red-500 to-orange-500",
  speed:       "from-yellow-400 to-amber-500",
  cardio:      "from-pink-500 to-rose-500",
  recovery:    "from-green-400 to-emerald-500",
  consistency: "from-orange-500 to-yellow-500",
  endurance:   "from-blue-500 to-indigo-500",
  agility:     "from-purple-500 to-violet-500",
  discipline:  "from-teal-400 to-cyan-500",
};

const RARITY_NOTIF_STYLES: Record<string, string> = {
  Mythic:    "bg-pink-950/60 border-pink-500/60 text-pink-300",
  Ancient:   "bg-orange-950/60 border-orange-500/60 text-orange-300",
  Celestial: "bg-cyan-950/60 border-cyan-400/70 text-cyan-200",
};

const TIER_GLOW: Record<string, string> = {
  Common:    "shadow-none",
  Rare:      "shadow-[0_0_10px_rgba(59,130,246,0.6)]",
  Epic:      "shadow-[0_0_10px_rgba(147,51,234,0.7)]",
  Legendary: "shadow-[0_0_12px_rgba(234,179,8,0.8)]",
  Mythic:    "shadow-[0_0_14px_rgba(236,72,153,0.9)]",
};

const CARDIO_TYPES = ["steps", "running", "weightlifting", "yoga", "cycling"];
const REP_TYPES = ["pushups", "squats", "burpees", "pullups", "planks", "situps"];

const REP_TYPE_LABELS: Record<string, string> = {
  pushups: "Pushups",
  squats:  "Squats",
  burpees: "Burpees",
  pullups: "Pull-ups",
  planks:  "Planks",
  situps:  "Sit-ups",
};

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;

  const { data: dashboard, isLoading } = useGetPlayerDashboard(pid, {
    query: { queryKey: getGetPlayerDashboardQueryKey(pid), enabled: !!playerId }
  });

  const { data: worldNotifs } = useQuery<Array<{ id: number; playerUsername: string; artifactName: string; rarity: string; createdAt: string }>>({
    queryKey: ["artifact-world-notifications"],
    queryFn: () => fetch(`${BASE}/api/artifacts/world-notifications?limit=5`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
    enabled: !!playerId,
  });

  const { data: fitnessBars } = useQuery<Array<{ barType: string; level: number; xp: number; nextLevelXp: number; xpInCurrentLevel: number; progressPct: number }>>({
    queryKey: ["fitness-bars", pid],
    queryFn: () => fetch(`${BASE}/api/players/me/fitness-bars`, { credentials: "include" }).then(r => r.json()),
    enabled: !!playerId,
  });

  const { data: socialFeed } = useGetSocialFeed(
    { playerId: pid, limit: 3, shuffle: true },
    {
      query: {
        queryKey: getGetSocialFeedQueryKey({ playerId: pid, limit: 3, shuffle: true }),
        enabled: !!playerId,
        // Always refetch on mount so each home visit gets a fresh random sample
        // of community highlights instead of the same cached cards.
        staleTime: 0,
        refetchOnMount: "always",
      },
    }
  );
  const reactToPost = useReactToPost();
  const handleHighlightReact = (postId: number, reactionType: string) => {
    if (!playerId) return;
    reactToPost.mutate(
      { id: postId, data: { playerId: pid, reactionType: reactionType as any } },
      {
        onSuccess: () => {
          // Invalidate every social feed variant (home limit:3 AND main /social feed)
          // so reactions update everywhere at once.
          queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
        },
      }
    );
  };
  const [composeOpen, setComposeOpen] = useState(false);

  const HIGHLIGHT_POST_TYPE_ICONS: Record<string, string> = {
    general: "💬",
    gym_selfie: "💪",
    evolution_reveal: "✨",
    streak_milestone: "🔥",
    transformation: "🦋",
    workout_stat: "📊",
    hatch_moment: "🥚",
  };

  const logActivity = useLogActivity();
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [activityType, setActivityType] = useState("steps");
  const [activityValue, setActivityValue] = useState("");
  const [repMode, setRepMode] = useState(false);
  const [repType, setRepType] = useState("pushups");
  const [repCount, setRepCount] = useState(10);
  const [distanceMiles, setDistanceMiles] = useState("");
  const [levelUpShow, setLevelUpShow] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{ level: number; newBadges: any[] }>({ level: 1, newBadges: [] });
  const [artifactQueue, setArtifactQueue] = useState<UnlockedArtifact[]>([]);
  const [xpPopups, setXpPopups] = useState<{ id: number; amount: number }[]>([]);
  const [rewardSummary, setRewardSummary] = useState<{ open: boolean; entries: RewardEntry[] }>({ open: false, entries: [] });

  const spawnXpPopup = (amount: number) => {
    const id = Date.now();
    setXpPopups(prev => [...prev, { id, amount }]);
    setTimeout(() => setXpPopups(prev => prev.filter(p => p.id !== id)), 1500);
  };

  const handleLogActivity = () => {
    const type = repMode ? repType : activityType;
    const value = repMode ? repCount : Number(activityValue);

    if (!repMode && (!activityValue || isNaN(value))) return;
    if (repMode && (repCount < 1)) return;

    const prevLevel = (dashboard as any)?.levelProgress?.level ?? 1;
    const parsedDistance = distanceMiles ? parseFloat(distanceMiles) : undefined;
    const hasDistance = parsedDistance && parsedDistance > 0 && (type === "running" || type === "cycling");

    logActivity.mutate(
      { data: { playerId: pid, type, value, distanceMiles: hasDistance ? parsedDistance : undefined } },
      {
        onSuccess: (res) => {
          const xpEarned = (res as any).xpEarned ?? (res as any).fitnessXpEarned ?? 0;
          spawnXpPopup(xpEarned);
          setLogModalOpen(false);
          setActivityValue("");
          setRepCount(10);
          setDistanceMiles("");

          const prResult = (res as any).prResult;
          const newArtifacts: UnlockedArtifact[] = (res as any).newArtifacts ?? [];
          const newBadges: Array<{ id?: number; name?: string; rarity?: string }> = (res as any).newBadges ?? [];
          const groupBonusXp = (res as any).groupBonusXp ?? 0;
          const eggsUpdated = (res as any).eggsUpdated ?? 0;
          const streakAfter = (res as any).player?.currentStreak ?? null;

          // Epic artifact unlocks get the dedicated celebratory overlay;
          // everything else funnels through the unified reward summary.
          const epicUnlocks = newArtifacts.filter(a => OVERLAY_RARITIES.has(a.rarity));
          const minorUnlocks = newArtifacts.filter(a => !OVERLAY_RARITIES.has(a.rarity));
          if (epicUnlocks.length > 0) {
            setArtifactQueue(epicUnlocks);
          }

          // Build a unified cross-feature reward summary that reflects the
          // server-side fan-out (XP → Pals, challenge progress, leaderboard,
          // streak, artifact mint) in a single celebratory modal.
          const entries: RewardEntry[] = [];
          if (xpEarned > 0) entries.push({ kind: "xp", label: "Fitness XP", value: xpEarned, detail: "Granted to your active Hatchling." });
          if (groupBonusXp > 0) entries.push({ kind: "xp", label: "Group bonus XP", value: groupBonusXp });
          if (eggsUpdated > 0) entries.push({ kind: "hatchling", label: "Egg progress", value: `+${eggsUpdated}`, detail: "Your incubator advanced." });
          if (streakAfter && streakAfter > 0) entries.push({ kind: "streak", label: `${streakAfter}-day streak`, detail: "Keep the chain alive tomorrow." });
          if (prResult?.isNew) {
            const paceDesc = prResult.metric === "pace_seconds_per_mile"
              ? (() => { const s = prResult.value; return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")} /mi`; })()
              : prResult.metric === "speed_mph_x10"
              ? `${(prResult.value / 10).toFixed(1)} mph`
              : `${prResult.value} reps`;
            entries.push({
              kind: "leaderboard",
              label: "New Personal Record",
              value: paceDesc,
              detail: `${REP_TYPE_LABELS[prResult.activityType] ?? prResult.activityType} — your leaderboard entry just climbed.`,
            });
          }
          for (const artifact of minorUnlocks) {
            entries.push({ kind: "artifact", label: artifact.name, value: artifact.rarity, detail: "Equip it from the Museum." });
          }
          for (const badge of newBadges) {
            if (badge?.name) entries.push({ kind: "challenge", label: `Badge: ${badge.name}`, detail: badge.rarity ?? "" });
          }
          if (entries.length === 0) {
            entries.push({ kind: "xp", label: "Activity logged", detail: "Your Pals are thriving!" });
          }
          setRewardSummary({ open: true, entries });

          queryClient.invalidateQueries({ queryKey: getGetPlayerDashboardQueryKey(pid) }).then(() => {
            const newDash = queryClient.getQueryData(getGetPlayerDashboardQueryKey(pid)) as any;
            const newLevel = newDash?.levelProgress?.level ?? prevLevel;
            if (newLevel > prevLevel) {
              setLevelUpData({ level: newLevel, newBadges: [] });
              setLevelUpShow(true);
            }
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </Layout>
    );
  }

  if (!dashboard) return null;

  const dash = dashboard as any;
  const levelProgress = dash.levelProgress ?? { level: dash.player.level, xpCurrentLevel: 0, xpForNextLevel: 150, xpPercent: 0 };
  const prestige = dash.prestige ?? 0;
  const dailyReward = dash.dailyReward;
  const recentBadges: any[] = dash.recentBadges ?? [];
  const badgeCount = dash.badgeCount ?? 0;
  const streakFreezes = dash.streakFreezes ?? 0;

  return (
    <Layout>
      <LevelUpOverlay
        show={levelUpShow}
        level={levelUpData.level}
        newBadges={levelUpData.newBadges}
        onDismiss={() => setLevelUpShow(false)}
      />

      <ArtifactUnlockOverlay
        queue={artifactQueue}
        onDismissAll={() => setArtifactQueue([])}
      />

      <RewardSummaryModal
        open={rewardSummary.open}
        onClose={() => setRewardSummary({ open: false, entries: [] })}
        title="Reward Summary"
        rewards={rewardSummary.entries}
      />

      {/* Floating XP popups */}
      <div className="fixed top-20 right-4 z-50 pointer-events-none">
        <AnimatePresence>
          {xpPopups.map(p => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 0, scale: 0.8 }}
              animate={{ opacity: 1, y: -60, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="font-black text-yellow-400 text-lg drop-shadow-[0_0_8px_rgba(234,179,8,1)] mb-1"
            >
              +{p.amount} XP ⚡
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="max-w-5xl mx-auto space-y-5 pb-12">
        {/* Top Bar */}
        <header className="flex justify-between items-center py-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                prestige > 0
                  ? "bg-gradient-to-br from-yellow-500/30 to-pink-500/20 border-yellow-500/70 shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                  : "bg-primary/20 border-primary/50 shadow-[0_0_12px_rgba(var(--primary),0.3)]"
              }`}>
                <span className="font-black text-primary text-lg">L{levelProgress.level}</span>
              </div>
              {prestige > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center border-2 border-background">
                  <span className="text-[8px] font-black text-black">P{prestige}</span>
                </div>
              )}
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight leading-none">
                {dashboard.player.displayName || dashboard.player.username}
              </h1>
              {dash.title ? (
                <div className="text-xs font-bold text-yellow-500 uppercase flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3" /> {dash.title}
                </div>
              ) : (
                <div className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1 mt-0.5">
                  <Trophy className="w-3 h-3 text-yellow-500" /> {dashboard.player.rank}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SubscriptionChip />
            {streakFreezes > 0 && (
              <div className="flex items-center gap-1 bg-blue-500/20 border border-blue-500/40 px-2 py-1 rounded-full">
                <span className="text-sm">❄️</span>
                <span className="font-black text-xs text-blue-400">{streakFreezes}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur px-3 py-1.5 rounded-full border border-border">
              <Flame className={`w-4 h-4 ${(dashboard as any).fitness?.currentStreak >= 7 ? "text-orange-400" : "text-orange-500/70"}`} />
              <span className="font-black text-sm">{(dashboard as any).fitness?.currentStreak ?? 0}d</span>
            </div>
          </div>
        </header>

        {/* XP Bar */}
        <XpBar
          level={levelProgress.level}
          xpPercent={levelProgress.xpPercent}
          xpCurrentLevel={levelProgress.xpCurrentLevel}
          xpForNextLevel={levelProgress.xpForNextLevel}
          prestige={prestige}
        />

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary to-purple-800 rounded-3xl p-6 text-white relative overflow-hidden shadow-2xl neon-glow"
        >
          <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-20 pointer-events-none">
            <Zap className="w-64 h-64" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between gap-5">
            <div>
              <h2 className="text-3xl font-black mb-1 drop-shadow-md">Keep Moving!</h2>
              <p className="text-white/80 font-medium text-sm">Your Pals are waiting to evolve.</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-bold">
                <span className="flex items-center gap-1"><Footprints className="w-4 h-4"/> Today's Steps</span>
                <span>{(dashboard as any).fitness.todaySteps.toLocaleString()} / {(dashboard as any).fitness.dailyStepGoal.toLocaleString()}</span>
              </div>
              <Progress value={(dashboard as any).fitness.stepGoalPct} className="h-4 bg-black/20 [&>div]:bg-white" />
            </div>
          </div>
        </motion.div>

        {/* Daily Reward CTA */}
        {dailyReward && !dailyReward.alreadyClaimed && (
          <Link href="/rewards">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-4 bg-gradient-to-r from-yellow-600/20 to-amber-500/10 border-2 border-yellow-500/50 rounded-2xl p-4 cursor-pointer active:scale-95 transition-transform shadow-[0_0_20px_rgba(234,179,8,0.15)]"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-3xl"
              >
                🎁
              </motion.div>
              <div className="flex-1">
                <p className="font-black text-sm text-yellow-400">Daily Reward Ready!</p>
                <p className="text-xs text-muted-foreground font-bold">
                  +{dailyReward.reward.coins} Coins • +{dailyReward.reward.xp} XP
                  {dailyReward.reward.bonus === "rare_egg_voucher" && " • 🥚 Rare Egg!"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-yellow-500" />
            </motion.div>
          </Link>
        )}

        {/* Fitness Bars Mini-Dashboard */}
        {fitnessBars && fitnessBars.length > 0 && (
          <section>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Fitness Bars</h2>
              <Link href="/artifacts" className="text-xs font-bold text-primary hover:underline">Museum →</Link>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {fitnessBars.map(bar => (
                <div key={bar.barType} className="bg-muted/40 rounded-xl p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">{BAR_MINI_ICONS[bar.barType] ?? "💪"}</span>
                    <span className="text-[10px] font-black text-white">{bar.level}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${BAR_MINI_COLORS[bar.barType] ?? "from-primary to-primary"}`}
                      style={{ width: `${bar.progressPct}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate">{bar.barType}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* For You — personalized recommendations across the universe */}
        <ForYouStrip
          items={(() => {
            const items: ForYouItem[] = [];
            const fitness = (dashboard as any).fitness ?? {};
            const eggs = (dashboard as any).eggs ?? {};
            const streak = fitness.currentStreak ?? 0;
            const stepPct = fitness.stepGoalPct ?? 0;

            if (eggs.readyCount > 0) {
              items.push({
                id: "hatch-ready",
                title: `${eggs.readyCount} egg${eggs.readyCount > 1 ? "s" : ""} ready to hatch`,
                subtitle: "Open it now to grow your collection.",
                href: "/hatch",
                icon: <EggLucide className="w-4 h-4" />,
                tone: "yellow",
                tag: "Now",
              });
            }
            if (stepPct < 100) {
              items.push({
                id: "log-activity",
                title: "Hit today's step goal",
                subtitle: `${Math.max(0, 100 - Math.round(stepPct))}% to go. Log a quick activity.`,
                href: "/",
                icon: <Zap className="w-4 h-4" />,
                tone: "primary",
                tag: "Daily",
              });
            }
            items.push({
              id: "battle-ready",
              title: "Test battle readiness",
              subtitle: "See how your nutrition + workouts power your Pals.",
              href: "/compete/battle",
              icon: <SwordsIcon className="w-4 h-4" />,
              tone: "violet",
              tag: "Compete",
            });
            items.push({
              id: "fuel-up",
              title: "Fuel up with a meal",
              subtitle: "Logging meals raises battle readiness.",
              href: "/nutrition",
              icon: <SaladIcon className="w-4 h-4" />,
              tone: "green",
              tag: "Nutrition",
            });
            if (streak >= 3) {
              items.push({
                id: "streak-share",
                title: `${streak}-day streak — share it`,
                subtitle: "Post your streak to your feed.",
                href: "/social",
                icon: <UsersIcon className="w-4 h-4" />,
                tone: "cyan",
                tag: "Social",
              });
            }
            items.push({
              id: "ai-coach",
              title: "Ask the AI Coach",
              subtitle: "Get a personalized plan based on your day.",
              href: "/coach",
              icon: <BotIcon className="w-4 h-4" />,
              tone: "primary",
              tag: "AI",
            });
            items.push({
              id: "climb-board",
              title: "Climb the leaderboard",
              subtitle: "Your local placement also boosts the global board.",
              href: "/social",
              icon: <TrophyIcon className="w-4 h-4" />,
              tone: "yellow",
              tag: "Ranks",
            });
            return items;
          })()}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/hatch">
            <Card className="bg-card border-2 hover:border-primary/50 transition-colors cursor-pointer group active-elevate h-full">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2 h-full justify-center">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <EggIcon className="w-6 h-6" />
                  </div>
                  {(dashboard as any).eggs?.readyCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white animate-pulse">
                      {(dashboard as any).eggs.readyCount}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm">Incubator</h3>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase mt-1">{(dashboard as any).eggs?.totalActive ?? 0} Active Eggs</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Log Activity Dialog */}
          <Dialog open={logModalOpen} onOpenChange={(open) => {
            setLogModalOpen(open);
            if (!open) { setRepMode(false); setRepCount(10); setActivityValue(""); setDistanceMiles(""); }
          }}>
            <DialogTrigger asChild>
              <Card className="bg-card border-2 hover:border-accent/50 transition-colors cursor-pointer group active-elevate h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2 h-full justify-center">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                    <PlusCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Log Activity</h3>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase mt-1">Earn Quick XP</p>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">Log Activity</DialogTitle>
              </DialogHeader>

              {/* Mode Toggle */}
              <div className="flex gap-1 bg-muted rounded-xl p-1">
                <button
                  onClick={() => setRepMode(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    !repMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" /> Standard
                </button>
                <button
                  onClick={() => setRepMode(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    repMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Dumbbell className="w-3.5 h-3.5" /> Rep Mode
                </button>
              </div>

              {!repMode ? (
                /* Standard Mode */
                <div className="grid gap-4 py-2">
                  <div className="grid grid-cols-3 gap-2">
                    {CARDIO_TYPES.map(type => (
                      <Button
                        key={type}
                        variant={activityType === type ? "default" : "outline"}
                        onClick={() => setActivityType(type)}
                        className="capitalize font-bold text-xs h-12"
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase text-muted-foreground">
                      Amount ({activityType === "steps" ? "count" : "minutes"})
                    </label>
                    <Input
                      type="number"
                      value={activityValue}
                      onChange={e => setActivityValue(e.target.value)}
                      placeholder="e.g. 5000"
                      className="h-14 text-xl font-bold font-mono"
                    />
                  </div>
                  {(activityType === "running" || activityType === "cycling") && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                        Distance (miles) <span className="text-muted-foreground font-normal">— optional, enables pace PR tracking</span>
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={distanceMiles}
                        onChange={e => setDistanceMiles(e.target.value)}
                        placeholder="e.g. 3.1"
                        className="h-10 font-bold font-mono"
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Rep Counter Mode */
                <div className="grid gap-4 py-2">
                  <div className="grid grid-cols-3 gap-2">
                    {REP_TYPES.map(type => (
                      <Button
                        key={type}
                        variant={repType === type ? "default" : "outline"}
                        onClick={() => setRepType(type)}
                        className="capitalize font-bold text-xs h-12"
                      >
                        {REP_TYPE_LABELS[type]}
                      </Button>
                    ))}
                  </div>

                  {/* Large Rep Counter */}
                  <div className="flex flex-col items-center gap-3 py-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Rep Count</p>
                    <div className="flex items-center gap-6">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 rounded-full text-2xl"
                        onClick={() => setRepCount(Math.max(1, repCount - (repCount >= 25 ? 5 : 1)))}
                      >
                        <Minus className="w-6 h-6" />
                      </Button>
                      <div className="text-center min-w-[80px]">
                        <p className="text-5xl font-black text-primary leading-none">{repCount}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-1">reps</p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 rounded-full text-2xl"
                        onClick={() => setRepCount(repCount + (repCount >= 25 ? 5 : 1))}
                      >
                        <Plus className="w-6 h-6" />
                      </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center">
                      {[10, 20, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => setRepCount(n)}
                          className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                            repCount === n ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      1 rep = 1 XP • Each rep helps your Pals evolve!
                    </p>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  onClick={handleLogActivity}
                  disabled={logActivity.isPending}
                  className="w-full font-black text-lg h-14 active-elevate"
                >
                  {logActivity.isPending
                    ? "Logging..."
                    : repMode
                      ? `Log ${repCount} ${REP_TYPE_LABELS[repType]} ⚡`
                      : "Log & Earn XP ⚡"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Community Highlights */}
        <section>
          <div className="flex justify-between items-end mb-3">
            <h2 className="text-lg font-black flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Community Highlights
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setComposeOpen(true)}
                className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                data-testid="button-home-compose"
                aria-label="Share an update"
              >
                <PlusCircle className="w-3 h-3" /> Share
              </button>
              <Link href="/social" className="text-xs font-bold text-primary flex items-center hover:underline">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Inline compose entry */}
          <button
            onClick={() => setComposeOpen(true)}
            className="w-full text-left mb-2 flex items-center gap-3 bg-card/60 hover:bg-card border border-border hover:border-primary/40 rounded-2xl p-3 transition-colors"
            data-testid="button-home-compose-inline"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/20 border border-primary/40 flex items-center justify-center font-black text-sm text-primary shrink-0">
              {(dashboard.player.displayName || dashboard.player.username || "?")[0]?.toUpperCase()}
            </div>
            <span className="text-sm text-muted-foreground font-medium flex-1">
              Share an update with the community...
            </span>
            <PlusCircle className="w-4 h-4 text-primary shrink-0" />
          </button>

          {socialFeed && socialFeed.posts && socialFeed.posts.length > 0 && (
            <div className="space-y-2">
              {socialFeed.posts.slice(0, 3).map((post: any) => (
                <HighlightCard
                  key={post.id}
                  post={post}
                  playerId={pid}
                  typeIcon={HIGHLIGHT_POST_TYPE_ICONS[post.postType] ?? "💬"}
                  onReact={handleHighlightReact}
                  reactPending={reactToPost.isPending}
                />
              ))}
            </div>
          )}
        </section>

        {/* Compose sheet — same modal used on /social */}
        <ComposeSheet
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          playerId={pid}
        />

        {/* Badge Showcase */}
        {recentBadges.length > 0 && (
          <section>
            <div className="flex justify-between items-end mb-3">
              <h2 className="text-lg font-black flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" /> Badges
                <Badge variant="outline" className="font-black text-xs">{badgeCount}</Badge>
              </h2>
              <Link href="/rewards" className="text-xs font-bold text-primary flex items-center hover:underline">
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {recentBadges.map((badge: any) => badge && (
                <motion.div
                  key={badge.key ?? badge.badgeKey}
                  whileHover={{ scale: 1.08 }}
                  className={`shrink-0 flex flex-col items-center gap-1 bg-card border-2 rounded-2xl p-3 min-w-[72px] ${
                    TIER_GLOW[badge.tier] ?? ""
                  }`}
                >
                  <span className="text-2xl">{badge.icon}</span>
                  <span className="text-[9px] font-black text-center leading-tight max-w-[60px]">{badge.name}</span>
                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${
                    badge.tier === "Mythic" ? "bg-pink-500/20 text-pink-400" :
                    badge.tier === "Legendary" ? "bg-yellow-500/20 text-yellow-400" :
                    badge.tier === "Epic" ? "bg-purple-500/20 text-purple-400" :
                    badge.tier === "Rare" ? "bg-blue-500/20 text-blue-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{badge.tier}</span>
                </motion.div>
              ))}
              <Link href="/rewards">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="shrink-0 flex flex-col items-center justify-center gap-1 bg-card/50 border-2 border-dashed border-border rounded-2xl p-3 min-w-[72px] h-full cursor-pointer"
                >
                  <Gift className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[9px] font-bold text-muted-foreground text-center">All Rewards</span>
                </motion.div>
              </Link>
            </div>
          </section>
        )}

        {/* Legendary Drops Widget */}
        {worldNotifs && worldNotifs.length > 0 && (
          <section>
            <div className="flex justify-between items-end mb-3">
              <h2 className="text-lg font-black flex items-center gap-2">
                <span className="text-lg">🌍</span> World Drops
              </h2>
              <Link href="/artifacts" className="text-xs font-bold text-primary flex items-center hover:underline">
                Museum <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {worldNotifs.map(notif => {
                const s = RARITY_NOTIF_STYLES[notif.rarity] ?? "bg-muted/40 border-border text-muted-foreground";
                const emoji = notif.rarity === "Celestial" ? "🌟" : notif.rarity === "Ancient" ? "🟠" : "🔴";
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${s}`}
                  >
                    <span className="text-xl flex-shrink-0">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate">{notif.playerUsername} <span className="font-normal opacity-80">unlocked</span> {notif.artifactName}</p>
                      <p className="text-[10px] opacity-60">{notif.rarity} Artifact · {new Date(notif.createdAt).toLocaleDateString()}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* Top Hatchling */}
        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-black flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" /> Star Pal</h2>
            <Link href="/hatchlings" className="text-xs font-bold text-primary flex items-center hover:underline">View All <ChevronRight className="w-3 h-3" /></Link>
          </div>

          {dashboard.topHatchling ? (
            <Link href={`/hatchlings/${dashboard.topHatchling.id}`}>
              <Card className="bg-card border-2 hover:border-primary/30 transition-colors cursor-pointer overflow-hidden group">
                <div className="flex p-4 gap-4 items-center relative">
                  <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                    {dashboard.topHatchling.imageUrl ? (
                      <img src={dashboard.topHatchling.imageUrl} alt={dashboard.topHatchling.name} className="w-16 h-16 object-contain" />
                    ) : (
                      <Sparkles className="w-10 h-10 text-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-2xl leading-none mb-1">{dashboard.topHatchling.name}</h3>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{dashboard.topHatchling.species}</p>
                    <div className="flex gap-2">
                      <Badge className="bg-primary/20 text-primary border-0 font-black">Lvl {dashboard.topHatchling.level}</Badge>
                      <Badge variant="outline" className="font-bold">{dashboard.topHatchling.category}</Badge>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ) : (
            <Card className="bg-card border-dashed">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground font-bold mb-3">No Pals yet!</p>
                <Link href="/hatch"><Button size="sm" className="font-bold">Hatch your first Pal</Button></Link>
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      {/* Floating AI Coach button */}
      <Link href="/coach">
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white px-4 py-2.5 rounded-full shadow-[0_0_20px_rgba(var(--primary),0.5)] font-bold text-sm"
        >
          <Bot className="w-4 h-4" />
          Ask Coach
        </motion.button>
      </Link>
    </Layout>
  );
}

function HighlightCard({
  post,
  playerId,
  typeIcon,
  onReact,
  reactPending,
}: {
  post: any;
  playerId: number;
  typeIcon: string;
  onReact: (postId: number, reactionType: string) => void;
  reactPending: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const addComment = useAddPostComment();

  const myReaction = post.myReaction as string | null;
  const allComments: PostComment[] = post.comments ?? [];
  const commentCount: number = post.commentCount ?? allComments.length;
  const previewComments = showComments ? allComments : allComments.slice(-2);
  const hiddenCount = Math.max(0, commentCount - previewComments.length);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || !playerId) return;
    try {
      await addComment.mutateAsync({
        id: post.id,
        data: { playerId, content: commentText.trim() },
      });
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
      toast({ title: "Comment added! 💬" });
    } catch (err: any) {
      if (err?.response?.status === 422) {
        toast({
          title: "Keep it positive! 🌟",
          description: "That content doesn't meet our community guidelines.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Could not add comment", variant: "destructive" });
      }
    }
  }

  return (
    <Card className="bg-card border-2 hover:border-primary/40 transition-colors overflow-hidden">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-3">
          <Link href="/social" className="shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/20 border border-primary/40 flex items-center justify-center font-black text-sm text-primary">
              {post.authorAvatar ? (
                <img src={post.authorAvatar} alt={post.authorName} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                (post.authorName?.[0] ?? "?").toUpperCase()
              )}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-black text-sm truncate">{post.authorName}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 shrink-0">
                <span>{typeIcon}</span>
                {(post.postType ?? "general").replace(/_/g, " ")}
              </span>
            </div>
            <Link href="/social">
              <p className="text-xs text-foreground/90 line-clamp-2 leading-snug cursor-pointer">
                {post.content}
              </p>
            </Link>
          </div>
        </div>

        {/* Full reaction picker — matches /social PostCard */}
        <div className="flex items-center gap-1 pt-1 border-t border-border/30">
          {Object.entries(REACTION_ICONS).map(([type, cfg]) => {
            const count = (post.reactionCounts as Record<string, number>)?.[type] ?? 0;
            const isActive = myReaction === type;
            return (
              <button
                key={type}
                onClick={() => onReact(post.id, type)}
                disabled={reactPending}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? `bg-primary/20 ${cfg.color} scale-105`
                    : "text-muted-foreground hover:bg-muted/50 hover:scale-105"
                }`}
                aria-label={`React with ${cfg.label}`}
                data-testid={`button-home-react-${type}-${post.id}`}
              >
                <span className={isActive ? cfg.color : ""}>{cfg.icon}</span>
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            onClick={() => setShowComments(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-bold"
            aria-label="Toggle comments"
            data-testid={`button-home-toggle-comments-${post.id}`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {commentCount > 0 && <span>{commentCount}</span>}
            {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Comment previews + quick reply */}
        {(previewComments.length > 0 || showComments) && (
          <div className="space-y-1.5 pt-1">
            {hiddenCount > 0 && !showComments && (
              <button
                onClick={() => setShowComments(true)}
                className="text-[11px] font-bold text-muted-foreground hover:text-primary"
                data-testid={`button-home-show-all-comments-${post.id}`}
              >
                View {hiddenCount} more {hiddenCount === 1 ? "comment" : "comments"}
              </button>
            )}
            {previewComments.map(c => (
              <div key={c.id} className="flex gap-2" data-testid={`home-comment-${c.id}`}>
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {c.authorAvatar ? (
                    <img src={c.authorAvatar} alt={c.authorName} className="w-6 h-6 object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold">
                      {(c.authorName ?? "?").substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="bg-muted/50 rounded-xl px-2.5 py-1.5 flex-1 min-w-0">
                  <span className="font-bold text-[11px]">{c.authorName}</span>
                  <p className="text-xs text-muted-foreground break-words">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
          <Input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Reply..."
            className="h-8 text-xs rounded-full bg-muted/30"
            maxLength={280}
            data-testid={`input-home-comment-${post.id}`}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            disabled={addComment.isPending || !commentText.trim()}
            aria-label="Post comment"
            data-testid={`button-home-comment-submit-${post.id}`}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EggIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z" />
    </svg>
  );
}
