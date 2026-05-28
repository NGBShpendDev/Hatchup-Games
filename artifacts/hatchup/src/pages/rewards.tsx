import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Star, Flame, Zap, Gift, Lock, CheckCircle2, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIER_COLORS: Record<string, string> = {
  Common:    "from-gray-500 to-gray-400 border-gray-400",
  Rare:      "from-blue-600 to-blue-400 border-blue-400",
  Epic:      "from-purple-600 to-purple-400 border-purple-400",
  Legendary: "from-yellow-600 to-amber-400 border-yellow-400",
  Mythic:    "from-pink-600 to-red-400 border-pink-400",
};

const TIER_GLOW: Record<string, string> = {
  Common:    "",
  Rare:      "shadow-[0_0_15px_rgba(59,130,246,0.5)]",
  Epic:      "shadow-[0_0_15px_rgba(147,51,234,0.6)]",
  Legendary: "shadow-[0_0_20px_rgba(234,179,8,0.7)]",
  Mythic:    "shadow-[0_0_25px_rgba(236,72,153,0.8)]",
};

interface BadgeDef {
  key: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  icon: string;
  isSecret: boolean;
  xpReward: number;
  coinsReward: number;
}

interface EarnedBadge extends BadgeDef {
  earnedAt: string;
  isShowcase: boolean;
}

interface DailyReward {
  alreadyClaimed: boolean;
  streak: number;
  nextStreak: number;
  reward: { coins: number; xp: number; bonus?: string; day: number };
  lastClaimedAt: string | null;
}

const CATEGORIES = ["all", "fitness", "streak", "hatchling", "achievement", "event", "secret"];
const CATEGORY_LABELS: Record<string, string> = {
  all: "All", fitness: "Fitness", streak: "Streak", hatchling: "Pals",
  achievement: "Achievement", event: "Event", secret: "🔒 Secret",
};

export default function Rewards() {
  const { playerId } = usePlayer();
  const { toast } = useToast();
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [dailyReward, setDailyReward] = useState<DailyReward | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [newlyEarned, setNewlyEarned] = useState<string[]>([]);

  useEffect(() => {
    if (!playerId) return;
    Promise.all([
      fetch("/api/badges").then(r => r.json()),
      fetch(`/api/players/${playerId}/badges`, { credentials: "include" }).then(r => r.json()),
      fetch("/api/rewards/daily", { credentials: "include" }).then(r => r.json()),
    ]).then(([allBadges, earned, daily]) => {
      setBadges(allBadges);
      setEarnedBadges(earned);
      setDailyReward(daily);
      setLoading(false);
    });
  }, [playerId]);

  const handleClaimReward = async () => {
    if (!playerId || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/rewards/daily/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: `Day ${data.newStreak} Reward Claimed! 🎉`,
          description: `+${data.reward.xp} XP • +${data.reward.coins} Coins${data.reward.bonus ? " • Bonus item!" : ""}`,
        });
        setDailyReward(prev => prev ? { ...prev, alreadyClaimed: true, streak: data.newStreak } : prev);
        if (data.newBadges?.length > 0) {
          setNewlyEarned(data.newBadges.map((b: any) => b.key));
          setTimeout(() => setNewlyEarned([]), 4000);
          // Re-fetch badges
          fetch(`/api/players/${playerId}/badges`, { credentials: "include" })
            .then(r => r.json()).then(setEarnedBadges);
        }
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } finally {
      setClaiming(false);
    }
  };

  const earnedKeys = new Set(earnedBadges.map(b => b.key));

  const filteredBadges = badges.filter(b =>
    activeCategory === "all" || b.category === activeCategory
  );

  const earnedCount = badges.filter(b => earnedKeys.has(b.key)).length;

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 pb-12">
        <header className="pt-2">
          <h1 className="text-3xl font-black flex items-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-500" /> Rewards
          </h1>
          <p className="text-sm text-muted-foreground font-bold mt-1">
            {earnedCount} / {badges.length} Badges Collected
          </p>
        </header>

        {/* Daily Reward */}
        {dailyReward && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-3xl p-5 border-2 relative overflow-hidden ${
              dailyReward.alreadyClaimed
                ? "bg-card border-border"
                : "bg-gradient-to-br from-yellow-600/20 to-amber-500/10 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.2)]"
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`text-5xl ${!dailyReward.alreadyClaimed ? "animate-bounce" : ""}`}>
                {dailyReward.alreadyClaimed ? "✅" : "🎁"}
              </div>
              <div className="flex-1">
                <h2 className="font-black text-lg">Daily Reward</h2>
                <div className="flex gap-3 text-sm font-bold mt-1">
                  <span className="text-yellow-400">+{dailyReward.reward.coins} Coins</span>
                  <span className="text-purple-400">+{dailyReward.reward.xp} XP</span>
                  {dailyReward.reward.bonus === "streak_freeze" && <span className="text-blue-400">❄️ Freeze</span>}
                  {dailyReward.reward.bonus === "rare_egg_voucher" && <span className="text-pink-400">🥚 Rare Egg!</span>}
                </div>
                <div className="flex gap-1 mt-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i < (dailyReward.alreadyClaimed ? dailyReward.streak : dailyReward.streak)
                          ? "bg-yellow-400"
                          : "bg-border"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">
                  Day {dailyReward.reward.day} of 7
                </p>
              </div>
            </div>
            {!dailyReward.alreadyClaimed && (
              <Button
                onClick={handleClaimReward}
                disabled={claiming}
                className="w-full mt-4 font-black bg-yellow-500 hover:bg-yellow-400 text-black h-12 text-base active-elevate"
              >
                {claiming ? "Claiming..." : "Claim Reward! 🎉"}
              </Button>
            )}
            {dailyReward.alreadyClaimed && (
              <p className="text-center text-sm text-muted-foreground font-bold mt-3">
                Come back tomorrow for Day {((dailyReward.reward.day % 7) + 1)}!
              </p>
            )}
          </motion.div>
        )}

        {/* Streak freeze counter */}
        {/* Badge Collection */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-black flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" /> Badge Collection
            </h2>
            <span className="text-xs font-bold text-muted-foreground">
              {earnedCount}/{badges.length}
            </span>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 text-xs font-black px-3 py-1.5 rounded-full border transition-all ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <AnimatePresence>
              {filteredBadges.map((badge) => {
                const isEarned = earnedKeys.has(badge.key);
                const isNew = newlyEarned.includes(badge.key);
                const tierColor = TIER_COLORS[badge.tier] ?? TIER_COLORS.Common;
                const tierGlow = TIER_GLOW[badge.tier] ?? "";
                const earnedData = earnedBadges.find(e => e.key === badge.key);

                return (
                  <motion.div
                    key={badge.key}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    layout
                  >
                    <div
                      className={`relative rounded-2xl border-2 p-3 flex flex-col items-center text-center gap-1.5 transition-all ${
                        isEarned
                          ? `bg-gradient-to-b ${tierColor} ${tierGlow}`
                          : "bg-card/50 border-border/50 opacity-50 grayscale"
                      } ${isNew ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-background" : ""}`}
                    >
                      {isNew && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.3, 1] }}
                          className="absolute -top-2 -right-2 bg-yellow-400 rounded-full w-5 h-5 flex items-center justify-center"
                        >
                          <span className="text-[8px] font-black text-black">NEW</span>
                        </motion.div>
                      )}
                      <div className={`text-3xl ${isEarned && badge.tier !== "Common" ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" : ""}`}>
                        {isEarned || !badge.isSecret ? badge.icon : "🔒"}
                      </div>
                      <div className="font-black text-[10px] leading-tight text-white">
                        {isEarned || !badge.isSecret ? badge.name : "???"}
                      </div>
                      {isEarned && (
                        <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/30 text-white/80`}>
                          {badge.tier}
                        </div>
                      )}
                      {!isEarned && (
                        <div className="text-[9px] text-muted-foreground font-bold">
                          {badge.isSecret ? "???" : badge.description.slice(0, 20) + "..."}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Layout>
  );
}
