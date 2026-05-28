import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListHatchlings,
  getListHatchlingsQueryKey,
  useGetHatchling,
  getGetHatchlingQueryKey,
  useUpdateHatchling,
  useUpdatePlayer,
} from "@workspace/api-client-react";
import { usePlayer } from "@/lib/playerContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { motion, useAnimation } from "framer-motion";
import {
  Heart, Zap, Coffee, Star, Shield, TrendingUp, Footprints,
  Swords, ChevronLeft, ChevronRight, ArrowLeft, AlertTriangle, Target, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorCard } from "@/components/error-card";
import { HatchlingReaction, type HatchlingReactionData } from "@/components/hatchling-reaction";
import {
  LoyaltyMilestoneCelebration,
  checkLoyaltyMilestone,
  markMilestoneSeen,
  type LoyaltyMilestoneData,
} from "@/components/loyalty-milestone-celebration";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

const REALM_CONFIG: Record<string, { color: string; gradient: string; border: string; emoji: string }> = {
  strength: { color: "#ef4444", gradient: "from-red-950/60 to-orange-950/30", border: "border-red-500/50", emoji: "🔥" },
  cardio:   { color: "#06b6d4", gradient: "from-cyan-950/60 to-blue-950/30", border: "border-cyan-500/50", emoji: "⚡" },
  balance:  { color: "#a855f7", gradient: "from-purple-950/60 to-fuchsia-950/30", border: "border-purple-500/50", emoji: "✨" },
  beast:    { color: "#22c55e", gradient: "from-green-950/60 to-emerald-950/30", border: "border-green-500/50", emoji: "🌿" },
  mythic:   { color: "#ec4899", gradient: "from-pink-950/60 to-violet-950/30", border: "border-pink-500/50", emoji: "🌌" },
};

const PERSONALITY_FLAVOR: Record<string, { desc: string; traits: string[] }> = {
  Sleepy:       { desc: "Slow to wake, unstoppable once going.", traits: ["Low energy", "High recovery", "Burst power"] },
  Hyper:        { desc: "Bursting with energy — it never stops.", traits: ["High speed", "Eager", "Sprint specialist"] },
  Loyal:        { desc: "Devoted above all else. Bond grows fast.", traits: ["Bond +50%", "Team player", "Protective"] },
  Competitive:  { desc: "Born to win. Shines brightest in competition.", traits: ["High aggression", "Win-driven", "Rivalry boost"] },
  Calm:         { desc: "Measured and steady. Consistent in all situations.", traits: ["Balanced stats", "Steady growth", "Versatile"] },
};

function getFallbackImage(cat?: string | null) {
  switch (cat?.toLowerCase()) {
    case "strength": case "dragons": return lavaDragonImg;
    case "cardio":   case "cyber":   return cyberCreatureImg;
    case "beast":    case "shadow":  return shadowBeastImg;
    case "candy":                    return candyMonsterImg;
    case "mythic":   case "cosmic":  return cosmicEntityImg;
    case "balance":  case "crystal": return crystalGuardianImg;
    default: return lavaDragonImg;
  }
}

function StatRing({
  value, max = 100, size = 90, strokeWidth = 8, color, label, icon: Icon, sublabel, pulse = false,
}: {
  value: number; max?: number; size?: number; strokeWidth?: number;
  color: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  sublabel?: string; pulse?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, Math.max(0, value / max));
  const offset = circumference * (1 - pct);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        animate={pulse ? { scale: [1, 1.07, 1], filter: ["brightness(1)", "brightness(1.4)", "brightness(1)"] } : {}}
        transition={pulse ? { repeat: Infinity, duration: 1.4, ease: "easeInOut" } : {}}
      >
        <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
          <motion.circle
            cx={cx} cy={cy} r={radius} fill="none"
            stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-4 h-4 mb-0.5" style={{ color }} />
          <span className="text-sm font-black leading-none" style={{ color }}>{value}</span>
        </div>
      </motion.div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      {sublabel && <p className="text-[9px] text-muted-foreground/60 text-center max-w-[80px]">{sublabel}</p>}
    </div>
  );
}

function AnimatedBar({
  value, max = 100, color, label, icon: Icon,
}: {
  value: number; max?: number; color: string;
  label: string; icon: React.ComponentType<{ className?: string }>;
}) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs font-bold">
        <span className="flex items-center gap-1.5" style={{ color }}>
          <Icon className="w-3.5 h-3.5" />{label}
        </span>
        <span className="text-muted-foreground">{value}/{max}</span>
      </div>
      <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}99, ${color})`, boxShadow: `0 0 8px ${color}60` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function BattleReadinessBadge({ energy, happiness, loyaltyScore, confidenceScore }: { energy: number; happiness: number; loyaltyScore: number; confidenceScore: number }) {
  const score = Math.round((energy * 0.3 + happiness * 0.3 + loyaltyScore * 0.2 + confidenceScore * 0.2));
  const { label, color, emoji } =
    score >= 80 ? { label: "Battle Ready", color: "#22c55e", emoji: "⚔️" } :
    score >= 55 ? { label: "Warmed Up", color: "#f59e0b", emoji: "🔥" } :
    score >= 30 ? { label: "Needs Rest", color: "#f97316", emoji: "💤" } :
                  { label: "Exhausted", color: "#ef4444", emoji: "😴" };
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-full border font-black text-sm"
      style={{ borderColor: color + "50", color, background: color + "15" }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span className="ml-auto text-xs opacity-70">{score}/100</span>
    </div>
  );
}

export default function MyPalPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { player } = usePlayer();

  const [reaction, setReaction] = useState<HatchlingReactionData | null>(null);
  const [loyaltyMilestone, setLoyaltyMilestone] = useState<LoyaltyMilestoneData | null>(null);
  const palImgControls = useAnimation();

  type PalSnapshot = { loyaltyScore: number; motivationScore: number; battleWins: number };
  const prevPalRef = useRef<PalSnapshot | null>(null);
  const sadReactionFiredRef = useRef<number | null>(null);

  const startIdleFloat = useCallback(() => {
    palImgControls.start({
      y: [0, -5, 0],
      transition: { repeat: Infinity, duration: 3.5, ease: "easeInOut" },
    });
  }, [palImgControls]);

  const triggerPalBounce = useCallback(async (positive: boolean) => {
    palImgControls.stop();
    if (positive) {
      await palImgControls.start({
        y: [0, -18, 4, -10, 2, 0],
        scale: [1, 1.12, 0.97, 1.06, 0.99, 1],
        filter: [
          "drop-shadow(0 0 16px rgba(236,72,153,0.5))",
          "drop-shadow(0 0 36px rgba(236,72,153,1.0))",
          "drop-shadow(0 0 24px rgba(236,72,153,0.7))",
          "drop-shadow(0 0 28px rgba(236,72,153,0.85))",
          "drop-shadow(0 0 20px rgba(236,72,153,0.6))",
          "drop-shadow(0 0 16px rgba(236,72,153,0.5))",
        ],
        transition: { duration: 1.2, ease: "easeInOut" },
      });
    } else {
      await palImgControls.start({
        y: [0, 8, 4, 6, 0],
        scale: [1, 0.92, 0.95, 0.93, 1],
        transition: { duration: 1, ease: "easeInOut" },
      });
    }
    startIdleFloat();
  }, [palImgControls, startIdleFloat]);

  const palListParams = { playerId: player?.id, limit: 20 };
  const { data: allPals, isLoading: palsLoading } = useListHatchlings(
    palListParams,
    { query: { enabled: !!player?.id, queryKey: getListHatchlingsQueryKey(palListParams) } }
  );

  const sortedPals = allPals
    ? [...allPals].sort((a, b) => {
        if (a.id === player?.activeHatchlingId) return -1;
        if (b.id === player?.activeHatchlingId) return 1;
        return (b.level ?? 0) - (a.level ?? 0);
      })
    : [];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedPalPreview = sortedPals[selectedIndex];
  const activePalId = selectedPalPreview?.id ?? 0;

  const { data: pal, isLoading: palLoading, isError, refetch } = useGetHatchling(activePalId, {
    query: { enabled: !!activePalId, queryKey: getGetHatchlingQueryKey(activePalId) },
  });

  const updateMutation = useUpdateHatchling();
  const updatePlayerMutation = useUpdatePlayer();
  const isActivePal = player?.activeHatchlingId === activePalId;

  const handleSetActive = () => {
    if (!player || !pal || isActivePal) return;
    updatePlayerMutation.mutate(
      { id: player.id, data: { activeHatchlingId: activePalId } },
      {
        onSuccess: () => {
          toast({ title: "Active Pal Set!", description: `${pal.name} is now your bonded Pal.` });
          queryClient.invalidateQueries({ queryKey: getGetHatchlingQueryKey(activePalId) });
        },
        onError: () => toast({ title: "Couldn't set Pal", variant: "destructive" }),
      }
    );
  };

  const handleTrain = () => {
    if (!pal) return;
    updateMutation.mutate(
      { id: activePalId, data: { happiness: Math.min(100, pal.happiness + 15), energy: Math.max(0, pal.energy - 10), lastWorkoutAt: new Date().toISOString() } },
      {
        onSuccess: (updatedPal: any) => {
          const newLoyalty    = updatedPal?.loyaltyScore    ?? (pal as any).loyaltyScore    ?? 50;
          const newMotivation = updatedPal?.motivationScore ?? (pal as any).motivationScore ?? 50;
          const newBattleWins = updatedPal?.battleWins      ?? (pal as any).battleWins      ?? 0;
          const prevSnapshot  = prevPalRef.current;
          const prevLoyalty     = prevSnapshot?.loyaltyScore ?? (pal as any).loyaltyScore ?? 50;
          const loyaltyDelta    = prevSnapshot ? newLoyalty    - prevSnapshot.loyaltyScore    : 3;
          const motivationDelta = prevSnapshot ? newMotivation - prevSnapshot.motivationScore : 10;

          const parts: string[] = [];
          if (loyaltyDelta    > 0) parts.push(`+${loyaltyDelta} Loyalty`);
          if (motivationDelta > 0) parts.push(`+${motivationDelta} Motivation`);
          toast({ title: parts.length ? `${parts.join(", ")}! 🎉` : "Training Complete!" });

          setReaction({
            hatchlingName: pal.name,
            happinessDelta: 15,
            energyDelta: -10,
            loyaltyDelta:    loyaltyDelta    > 0 ? loyaltyDelta    : undefined,
            motivationDelta: motivationDelta > 0 ? motivationDelta : undefined,
            imageUrl: pal.imageUrl,
            realm: (pal as any).realm ?? null,
          });
          triggerPalBounce(true);

          const crossedMilestone = checkLoyaltyMilestone(activePalId, prevLoyalty, newLoyalty);
          if (crossedMilestone) {
            markMilestoneSeen(activePalId, crossedMilestone);
            setTimeout(() => {
              setLoyaltyMilestone({
                palId: activePalId,
                palName: pal.name,
                milestone: crossedMilestone,
                imageUrl: pal.imageUrl,
                realm: (pal as any).realm ?? null,
              });
            }, 2000);
          }

          prevPalRef.current = { loyaltyScore: newLoyalty, motivationScore: newMotivation, battleWins: newBattleWins };
          queryClient.invalidateQueries({ queryKey: getGetHatchlingQueryKey(activePalId) });
        },
        onError: () => toast({ title: "Couldn't train", variant: "destructive" }),
      }
    );
  };

  const handleFeed = () => {
    if (!pal) return;
    updateMutation.mutate(
      { id: activePalId, data: { hunger: Math.min(100, pal.hunger + 20) } },
      {
        onSuccess: () => {
          toast({ title: "+20 Hunger! 😋", description: `${pal.name} enjoyed the meal!` });
          setReaction({
            hatchlingName: pal.name,
            happinessDelta: 5,
            energyDelta: 0,
            imageUrl: pal.imageUrl,
            realm: (pal as any).realm ?? null,
          });
          triggerPalBounce(true);
          queryClient.invalidateQueries({ queryKey: getGetHatchlingQueryKey(activePalId) });
        },
        onError: () => toast({ title: "Couldn't feed", variant: "destructive" }),
      }
    );
  };

  useEffect(() => {
    if (!pal) return;

    const current: PalSnapshot = {
      loyaltyScore: (pal as any).loyaltyScore ?? 50,
      motivationScore: (pal as any).motivationScore ?? 50,
      battleWins: (pal as any).battleWins ?? 0,
    };

    // On first encounter of this pal (or when switching pals) check for a sad
    // moodState returned by the server, which means the player missed today's
    // daily goal or motivation has dropped critically low. Fire the sad slump
    // animation and a motivation-loss toast exactly once per pal per session.
    const palMoodState = (pal.moodState as string | undefined) ?? "happy";

    // Comeback: we previously saw this pal in a sad state, but mood has
    // now recovered (player logged a workout). Fire the celebratory comeback
    // reaction and clear the sad ref so it doesn't re-trigger.
    if (sadReactionFiredRef.current === pal.id && palMoodState !== "sad") {
      sadReactionFiredRef.current = null;
      const prevSnapshot = prevPalRef.current;
      const rawMotivationDelta = prevSnapshot
        ? current.motivationScore - prevSnapshot.motivationScore
        : 10;
      const motivationGain = rawMotivationDelta > 0 ? rawMotivationDelta : 10;
      toast({
        title: `+${motivationGain} Motivation 💪`,
        description: "Back on track!",
      });
      setReaction({
        hatchlingName: pal.name,
        happinessDelta: 10,
        energyDelta: 0,
        motivationDelta: motivationGain,
        imageUrl: pal.imageUrl,
        realm: (pal as any).realm ?? null,
        kind: "comeback",
      });
      triggerPalBounce(true);
      prevPalRef.current = current;
      return;
    }

    if (palMoodState === "sad" && sadReactionFiredRef.current !== pal.id) {
      sadReactionFiredRef.current = pal.id;
      toast({
        title: "-5 Motivation 😞",
        description: `${pal.name} missed today's goal!`,
      });
      setReaction({
        hatchlingName: pal.name,
        happinessDelta: -5,
        energyDelta: 0,
        motivationDelta: -5,
        imageUrl: pal.imageUrl,
        realm: (pal as any).realm ?? null,
      });
      triggerPalBounce(false);
    } else {
      startIdleFloat();
    }

    if (prevPalRef.current !== null) {
      const prev = prevPalRef.current;
      const loyaltyDelta   = current.loyaltyScore   - prev.loyaltyScore;
      const motivationDelta = current.motivationScore - prev.motivationScore;
      const battleWinsDelta = current.battleWins     - prev.battleWins;

      if (battleWinsDelta > 0) {
        const moodParts: string[] = [];
        if (loyaltyDelta    > 0) moodParts.push(`+${loyaltyDelta} Loyalty`);
        if (motivationDelta > 0) moodParts.push(`+${motivationDelta} Motivation`);
        const plural = battleWinsDelta > 1 ? "s" : "";
        const moodSuffix = moodParts.length ? ` · ${moodParts.join(", ")}` : "";
        toast({
          title: `+${battleWinsDelta} Battle Win${plural}! ⚔️${moodSuffix}`,
          description: `${pal.name} is growing stronger!`,
        });
        setReaction({
          hatchlingName: pal.name,
          happinessDelta: 20,
          energyDelta: -15,
          loyaltyDelta:    loyaltyDelta    > 0 ? loyaltyDelta    : 5,
          motivationDelta: motivationDelta > 0 ? motivationDelta : undefined,
          imageUrl: pal.imageUrl,
          realm: (pal as any).realm ?? null,
        });
        triggerPalBounce(true);
      } else if (loyaltyDelta > 0 || motivationDelta > 0) {
        const parts: string[] = [];
        if (loyaltyDelta > 0) parts.push(`+${loyaltyDelta} Loyalty`);
        if (motivationDelta > 0) parts.push(`+${motivationDelta} Motivation`);
        toast({ title: `${parts.join(", ")}! 🎉` });
        setReaction({
          hatchlingName: pal.name,
          happinessDelta: 15,
          energyDelta: -10,
          loyaltyDelta:    loyaltyDelta    > 0 ? loyaltyDelta    : undefined,
          motivationDelta: motivationDelta > 0 ? motivationDelta : undefined,
          imageUrl: pal.imageUrl,
          realm: (pal as any).realm ?? null,
        });
        triggerPalBounce(true);
      } else if (motivationDelta < -1) {
        toast({
          title: `${motivationDelta} Motivation 😞`,
          description: `${pal.name} needs your attention!`,
        });
        setReaction({
          hatchlingName: pal.name,
          happinessDelta: -5,
          energyDelta: 0,
          motivationDelta,
          imageUrl: pal.imageUrl,
          realm: (pal as any).realm ?? null,
        });
        triggerPalBounce(false);
      }
    }

    prevPalRef.current = current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal]);

  const isLoading = palsLoading || palLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto space-y-6 pb-12">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full rounded-3xl" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!allPals || allPals.length === 0) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto pt-12 text-center space-y-4">
          <p className="text-4xl">🥚</p>
          <h2 className="text-xl font-black">No Pals Yet</h2>
          <p className="text-muted-foreground text-sm">Hatch your first creature to meet your Pal!</p>
          <NeonButton onClick={() => setLocation("/hatch")}>Go Hatch</NeonButton>
        </div>
      </Layout>
    );
  }

  if (isError && !pal) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto pt-12">
          <ErrorCard title="Couldn't load your Pal" onRetry={() => refetch()} />
        </div>
      </Layout>
    );
  }

  if (!pal) return null;

  const realm = (pal.realm as string | undefined) ?? "balance";
  const realmCfg = REALM_CONFIG[realm] ?? REALM_CONFIG["balance"];
  const personality = pal.personality ?? "Calm";
  const personalityInfo = PERSONALITY_FLAVOR[personality] ?? PERSONALITY_FLAVOR["Calm"];
  const loyaltyScore = (pal as any).loyaltyScore ?? 50;
  const motivationScore = (pal as any).motivationScore ?? 50;
  const confidenceScore = (pal as any).confidenceScore ?? 50;
  const battleWins = (pal as any).battleWins ?? 0;
  const powerScore = (pal as any).powerScore ?? (pal.level * 10);
  const stepsToEvolution = (pal as any).stepsToEvolution ?? 0;
  const moodState = (pal.moodState as string | undefined) ?? "happy";
  const stage = pal.evolutionStage ?? 1;
  const palDailyStepGoal = (pal as any).dailyStepGoal ?? player?.dailyStepGoal ?? 8000;
  const palDeadlineHour = (pal as any).dailyWorkoutDeadlineHour ?? (player as any)?.dailyWorkoutDeadlineHour ?? 20;
  const deadlinePeriod = palDeadlineHour < 12 ? "AM" : "PM";
  const deadlineDisplay = `${palDeadlineHour === 0 ? 12 : palDeadlineHour > 12 ? palDeadlineHour - 12 : palDeadlineHour}:00 ${deadlinePeriod}`;

  const rarityColor =
    pal.rarity === "Celestial" ? "#22d3ee" :
    pal.rarity === "Legendary" ? "#eab308" :
    pal.rarity === "Epic"      ? "#a855f7" :
    pal.rarity === "Rare"      ? "#3b82f6" : "#6b7280";

  return (
    <Layout>
      <HatchlingReaction reaction={reaction} onDismiss={() => setReaction(null)} />
      <LoyaltyMilestoneCelebration data={loyaltyMilestone} onDismiss={() => setLoyaltyMilestone(null)} />
      <div className="max-w-2xl mx-auto pb-20">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/hatch")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black">My Pal</h1>
            <p className="text-xs text-muted-foreground">Your bonded creature companion</p>
          </div>
        </div>

        {/* Pal switcher (shown only if multiple pals) */}
        {sortedPals.length > 1 && (
          <GlassCard className="p-3 mb-5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex(i => Math.max(0, i - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-none">
                {sortedPals.map((p, i) => {
                  const isActive = p.id === player?.activeHatchlingId;
                  const isSelected = i === selectedIndex;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedIndex(i)}
                      className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all ${isSelected ? "border-primary/60 bg-primary/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                    >
                      <span className="text-xs font-black truncate max-w-[80px]">{p.name}</span>
                      <div className="flex gap-1 items-center">
                        <span className="text-[10px] text-muted-foreground">Lv {p.level}</span>
                        {isActive && <span className="text-[10px] text-yellow-400 font-bold">★</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                disabled={selectedIndex >= sortedPals.length - 1}
                onClick={() => setSelectedIndex(i => Math.min(sortedPals.length - 1, i + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </GlassCard>
        )}

        {/* Motivation warning banner */}
        {motivationScore < 30 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl border border-red-500/50 bg-red-950/40"
            style={{ boxShadow: "0 0 20px #ef444430" }}
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-red-400">Your Pal needs training!</p>
              <p className="text-[11px] text-red-300/70 mt-0.5">
                Motivation is critically low ({motivationScore}/100). Log a workout to restore it.
              </p>
            </div>
            <NeonButton
              size="sm"
              className="shrink-0 bg-red-600/30 border-red-500/50 text-red-300 hover:bg-red-600/50"
              onClick={() => setLocation("/training")}
            >
              Train Now
            </NeonButton>
          </motion.div>
        )}

        {/* Hero card */}
        <motion.div
          key={pal.id}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className={`bg-gradient-to-br ${realmCfg.gradient} border-2 ${realmCfg.border} rounded-3xl p-6 mb-5 relative overflow-hidden`}
          style={{ boxShadow: `0 0 40px ${realmCfg.color}25` }}
        >
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div>
              <h2 className="text-3xl font-black">{pal.name}</h2>
              <div className="flex gap-2 flex-wrap mt-1">
                <Badge variant="outline" className="text-xs font-bold" style={{ borderColor: realmCfg.color + "60", color: realmCfg.color }}>
                  {realmCfg.emoji} {realm}
                </Badge>
                <Badge variant="outline" className="text-xs font-bold" style={{ borderColor: rarityColor + "60", color: rarityColor }}>
                  {pal.rarity ?? "Common"}
                </Badge>
                <Badge variant="outline" className="text-xs font-bold border-white/20 text-muted-foreground">
                  Lv {pal.level} · Stage {stage}/3
                </Badge>
                {isActivePal && (
                  <Badge className="text-xs font-bold bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                    <Star className="w-3 h-3 mr-1 fill-yellow-400" /> Active Pal
                  </Badge>
                )}
              </div>
            </div>
            <motion.img
              src={pal.imageUrl || getFallbackImage(realm)}
              alt={pal.name}
              className="w-24 h-24 object-contain"
              animate={palImgControls}
            />
          </div>

          {/* Battle readiness */}
          <div className="relative z-10 mb-4">
            <BattleReadinessBadge energy={pal.energy} happiness={pal.happiness} loyaltyScore={loyaltyScore} confidenceScore={confidenceScore} />
          </div>

          {/* Set active / train / feed row */}
          <div className="relative z-10 flex gap-2">
            <NeonButton
              size="sm"
              variant={isActivePal ? "secondary" : "primary"}
              className="flex-1"
              onClick={handleSetActive}
              disabled={isActivePal || updatePlayerMutation.isPending}
            >
              <Star className={`w-3.5 h-3.5 mr-1 ${isActivePal ? "fill-yellow-400 text-yellow-400" : ""}`} />
              {isActivePal ? "Active Pal" : "Set Active"}
            </NeonButton>
            <NeonButton size="sm" className="flex-1" onClick={handleTrain} disabled={updateMutation.isPending}>
              <Swords className="w-3.5 h-3.5 mr-1" /> Train
            </NeonButton>
            <NeonButton size="sm" variant="secondary" className="flex-1" onClick={handleFeed} disabled={updateMutation.isPending}>
              <Coffee className="w-3.5 h-3.5 mr-1" /> Feed
            </NeonButton>
          </div>
        </motion.div>

        {/* Today's Goal indicator */}
        <GlassCard className="p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-violet-400" />
            <h3 className="font-black text-sm text-violet-400">Today's Goal</h3>
            <button
              className="ml-auto text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 font-bold"
              onClick={() => setLocation("/settings/privacy")}
            >
              Edit
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <Footprints className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Steps</p>
                <p className="text-sm font-black text-cyan-400">{palDailyStepGoal.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Deadline</p>
                <p className="text-sm font-black text-amber-400">{deadlineDisplay}</p>
              </div>
            </div>
          </div>
          {moodState === "sad" && (
            <p className="text-[10px] text-red-400/80 font-medium mt-2 text-center">
              Missed today's goal — train now to cheer your Pal up!
            </p>
          )}
        </GlassCard>

        {/* Stat rings row — loyalty, motivation, confidence, power */}
        <GlassCard className="p-5 mb-5">
          <h3 className="font-black text-sm mb-4">Core Stats</h3>
          <div className="flex justify-around flex-wrap gap-y-4">
            <StatRing value={loyaltyScore} color="#ec4899" label="Loyalty" icon={Heart} sublabel="Grows with training" />
            <StatRing
              value={motivationScore}
              color={motivationScore < 25 ? "#ef4444" : "#f59e0b"}
              label="Motivation"
              icon={TrendingUp}
              sublabel={motivationScore < 25 ? "Needs a boost! 😞" : "Daily goal impact"}
              pulse={motivationScore < 25}
            />
            <StatRing value={confidenceScore} color="#8b5cf6" label="Confidence" icon={Swords} sublabel={`${battleWins} battle wins`} />
            <StatRing value={Math.min(100, Math.round(powerScore / 5))} max={100} color={realmCfg.color} label="Power" icon={Shield} sublabel={`Score: ${powerScore}`} />
          </div>
        </GlassCard>

        {/* Vitals bars */}
        <GlassCard className="p-5 mb-5">
          <h3 className="font-black text-sm mb-4">Vitals</h3>
          <div className="space-y-3">
            <AnimatedBar value={pal.happiness} color="#22c55e" label="Happiness" icon={Heart} />
            <AnimatedBar value={pal.hunger} color="#f97316" label="Hunger" icon={Coffee} />
            <AnimatedBar value={pal.energy} color="#3b82f6" label="Energy" icon={Zap} />
            <AnimatedBar value={pal.friendshipLevel ?? 0} color="#ec4899" label="Friendship Bond" icon={Star} />
          </div>
        </GlassCard>

        {/* Steps to evolution */}
        {stage < 3 && (
          <GlassCard className="p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Footprints className="w-4 h-4 text-violet-400" />
              <h3 className="font-black text-sm text-violet-400">Steps to Evolution</h3>
              <GlowBadge tone="violet" className="ml-auto text-[10px]">Stage {stage} → {stage + 1}</GlowBadge>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Progress</span>
                <span className="text-violet-400">
                  {stepsToEvolution > 0 ? `${stepsToEvolution.toLocaleString()} steps remaining` : "Ready to evolve!"}
                </span>
              </div>
              {stepsToEvolution > 0 ? (
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #7c3aed, #a855f7)", boxShadow: "0 0 8px #a855f760" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(5, 100 - Math.min(100, stepsToEvolution / 50))}%` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                  />
                </div>
              ) : (
                <NeonButton size="sm" className="w-full" onClick={() => setLocation(`/hatchlings/${pal.id}`)}>
                  <Zap className="w-3.5 h-3.5 mr-1" /> Evolve Now!
                </NeonButton>
              )}
              <p className="text-[10px] text-muted-foreground">
                Log workouts and fitness activities to earn steps toward evolution.
              </p>
            </div>
          </GlassCard>
        )}

        {stage >= 3 && (
          <GlassCard className="p-4 mb-5 border-yellow-500/30">
            <div className="flex items-center gap-2">
              <span className="text-xl">👑</span>
              <div>
                <p className="font-black text-sm text-yellow-400">Max Evolution Reached</p>
                <p className="text-xs text-muted-foreground">Your Pal has reached its final legendary form.</p>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Personality */}
        <GlassCard className="p-5 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4" style={{ color: realmCfg.color }} />
            <h3 className="font-black text-sm">
              Personality — <span style={{ color: realmCfg.color }}>{personality}</span>
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{personalityInfo.desc}</p>
          <div className="flex gap-2 flex-wrap">
            {personalityInfo.traits.map(t => (
              <span
                key={t}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                style={{ borderColor: realmCfg.color + "50", color: realmCfg.color, background: realmCfg.color + "15" }}
              >
                {t}
              </span>
            ))}
          </div>
        </GlassCard>

        {/* XP progress */}
        <GlassCard className="p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h3 className="font-black text-sm text-yellow-400">XP Progress</h3>
            </div>
            <span className="text-xs font-bold text-muted-foreground">{pal.xp} XP · Level {pal.level}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Level {pal.level}</span>
              <span>Level {pal.level + 1}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #ca8a04, #eab308)", boxShadow: "0 0 8px #eab30860" }}
                initial={{ width: 0 }}
                animate={{ width: `${(pal.xp % 100)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
        </GlassCard>

        {/* View full detail link */}
        <Button
          variant="ghost"
          className="w-full text-muted-foreground hover:text-foreground font-bold text-sm"
          onClick={() => setLocation(`/hatchlings/${pal.id}`)}
        >
          View Full Pal Details →
        </Button>

      </div>
    </Layout>
  );
}
