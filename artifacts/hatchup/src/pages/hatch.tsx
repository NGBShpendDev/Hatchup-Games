import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useListEggs, getListEggsQueryKey,
  useHatchEgg,
  useAddEgg,
  useCollectDailyEggs,
  usePlaceEggInIncubator,
  useListHatchlings, getListHatchlingsQueryKey
} from "@workspace/api-client-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { RarityBadge } from "@/components/rarity-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Egg as EggIcon, Sparkles, Footprints, Trophy, Star, ArrowDown, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Link, useLocation } from "wouter";
import { ApiError } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { LegendaryCinematic, type LegendaryRarity } from "@/components/legendary-hatch-cinematic";
import { ErrorCard } from "@/components/error-card";

// ── Realm visual config ────────────────────────────────────────────────────────
const REALM_EGG_STYLES: Record<string, {
  bg: string; border: string; glow: string; crackColor: string;
  label: string; emoji: string; auraClass: string;
}> = {
  strength: {
    bg: "bg-gradient-to-br from-red-950 via-orange-950 to-stone-950",
    border: "border-red-500",
    glow: "shadow-red-500/40",
    crackColor: "#f97316",
    label: "Strength",
    emoji: "🔥",
    auraClass: "from-red-500/30 to-orange-500/10",
  },
  cardio: {
    bg: "bg-gradient-to-br from-cyan-950 via-blue-950 to-slate-950",
    border: "border-cyan-400",
    glow: "shadow-cyan-500/40",
    crackColor: "#06b6d4",
    label: "Cardio",
    emoji: "⚡",
    auraClass: "from-cyan-500/30 to-blue-500/10",
  },
  balance: {
    bg: "bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950",
    border: "border-purple-400",
    glow: "shadow-purple-500/40",
    crackColor: "#a855f7",
    label: "Balance",
    emoji: "✨",
    auraClass: "from-purple-500/30 to-fuchsia-500/10",
  },
  beast: {
    bg: "bg-gradient-to-br from-green-950 via-emerald-950 to-stone-950",
    border: "border-green-500",
    glow: "shadow-green-500/40",
    crackColor: "#22c55e",
    label: "Beast",
    emoji: "🌿",
    auraClass: "from-green-500/30 to-emerald-500/10",
  },
  mythic: {
    bg: "bg-gradient-to-br from-pink-950 via-violet-950 to-indigo-950",
    border: "border-pink-400",
    glow: "shadow-pink-500/40",
    crackColor: "#ec4899",
    label: "Mythic",
    emoji: "🌌",
    auraClass: "from-pink-500/30 to-violet-500/10",
  },
};

const EGG_TYPE_TO_REALM: Record<string, string> = {
  strength: "strength", cardio: "cardio", balance: "balance",
  beast: "beast", balanced: "balance", legendary: "mythic", mythic: "mythic",
};

function getRealm(eggType: string): string {
  return EGG_TYPE_TO_REALM[eggType] ?? "balance";
}

// ── SVG Egg Shape ──────────────────────────────────────────────────────────────
function EggSvg({ realm, isReady, progress, size = "md" }: {
  realm: string; isReady: boolean; progress: number; size?: "sm" | "md";
}) {
  const style = REALM_EGG_STYLES[realm] ?? REALM_EGG_STYLES["balance"];
  const crackColor = style.crackColor;
  const dim = size === "sm" ? "w-16 h-16" : "w-28 h-28";
  const r = size === "sm" ? 26 : 50;
  const cx = size === "sm" ? 32 : 64;
  const viewBox = size === "sm" ? "0 0 64 64" : "0 0 128 128";
  const circumference = 2 * Math.PI * r;

  return (
    <div className={`relative ${dim}`}>
      <svg className="w-full h-full transform -rotate-90" viewBox={viewBox}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size === "sm" ? 5 : 8} />
        <motion.circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={crackColor} strokeWidth={size === "sm" ? 5 : 8} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * (progress / 100))}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (circumference * (progress / 100)) }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: isReady ? `drop-shadow(0 0 6px ${crackColor})` : "none" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative"
          animate={isReady ? { scale: [1, 1.15, 1], rotate: [0, -6, 6, -6, 0] } : {}}
          transition={isReady ? { repeat: Infinity, duration: 0.7 } : {}}
        >
          {isReady && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: `radial-gradient(circle, ${crackColor}40 0%, transparent 70%)` }}
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
          )}
          <span className={size === "sm" ? "text-2xl" : "text-4xl"}>{style.emoji}</span>
        </motion.div>
      </div>
    </div>
  );
}

// ── Source badge ───────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source?: string }) {
  if (source === "challenge") return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-[10px] font-black uppercase tracking-wider">
      <Trophy className="w-2.5 h-2.5" /> Challenge Win
    </div>
  );
  if (source === "event") return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/40 text-pink-400 text-[10px] font-black uppercase tracking-wider">
      <Star className="w-2.5 h-2.5" /> Live Event
    </div>
  );
  return null;
}

// ── Hatch animation phases ─────────────────────────────────────────────────────
type HatchPhase = "idle" | "cracking" | "burst" | "reveal";

// ── Small egg bag card (tappable) ──────────────────────────────────────────────
function BagEggCard({
  egg,
  onPlace,
  isPlacing,
  incubatorFull,
}: {
  egg: any;
  onPlace: (id: number) => void;
  isPlacing: boolean;
  incubatorFull: boolean;
}) {
  const realm = getRealm(egg.eggType);
  const style = REALM_EGG_STYLES[realm] ?? REALM_EGG_STYLES["balance"];
  const disabled = incubatorFull || isPlacing;

  return (
    <motion.div
      whileHover={disabled ? {} : { y: -4, scale: 1.03 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      className={`cursor-pointer ${disabled ? "opacity-60" : ""}`}
      onClick={() => !disabled && onPlace(egg.id)}
    >
      <GlassCard className={`p-4 flex flex-col items-center text-center relative overflow-hidden ${style.bg} border ${style.border}`}
        style={{ boxShadow: `0 0 18px ${style.crackColor}25` }}>
        <SourceBadge source={egg.source} />
        <div className="mt-1 mb-2">
          <EggSvg realm={realm} isReady={false} progress={0} size="sm" />
        </div>
        <p className="text-xs font-black truncate w-full leading-tight">{egg.name}</p>
        <div className="mt-1.5">
          <RarityBadge rarity={egg.rarity ?? "Common"} />
        </div>
        <div className="mt-2 w-full">
          {incubatorFull ? (
            <span className="text-[10px] text-muted-foreground font-bold">Incubator full</span>
          ) : (
            <div className="flex items-center justify-center gap-1 text-[10px] font-black text-primary/80">
              <ArrowDown className="w-2.5 h-2.5" /> Tap to incubate
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default function Hatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const [, setLocation] = useLocation();

  // ── Fetch all non-hatched eggs ──────────────────────────────────────────
  const allEggsKey = getListEggsQueryKey({ playerId: pid, hatched: false });
  const { data: allEggs, isLoading: isLoadingEggs, isError: isErrorEggs, refetch: refetchEggs } = useListEggs(
    { playerId: pid, hatched: false },
    { query: { queryKey: allEggsKey, enabled: !!playerId } }
  );

  const availableEggs = (allEggs ?? []).filter((e: any) => e.status === "available");
  const incubatingEggs = (allEggs ?? []).filter((e: any) => e.status !== "available");

  // ── Hatchlings for the Pals mini-grid ──────────────────────────────────
  const { data: hatchlings, isLoading: isLoadingHatchlings, isError: isErrorHatchlings, refetch: refetchHatchlings } = useListHatchlings(
    { playerId: pid },
    { query: { queryKey: getListHatchlingsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

  // ── Daily refill (runs once on mount when player is known) ──────────────
  const dailyRefillMutation = useCollectDailyEggs();
  useEffect(() => {
    if (!pid) return;
    dailyRefillMutation.mutate(
      { data: { playerId: pid } },
      {
        onSuccess: (res: any) => {
          if (res.eggsGranted > 0) {
            queryClient.invalidateQueries({ queryKey: allEggsKey });
            toast({
              title: `🥚 ${res.eggsGranted} new egg${res.eggsGranted !== 1 ? "s" : ""} added to your bag!`,
              description: "Tap an egg to start incubating it.",
            });
          }
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  // ── Place egg in incubator ──────────────────────────────────────────────
  const placeEggMutation = usePlaceEggInIncubator();

  const handlePlaceEgg = (eggId: number) => {
    placeEggMutation.mutate(
      { id: eggId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: allEggsKey });
          toast({ title: "🥚 Egg placed in incubator!", description: "Start walking to hatch it." });
        },
        onError: (err: unknown) => {
          const msg = (err as any)?.response?.data?.error ?? (err as any)?.data?.error;
          if (msg === "incubator_full") {
            toast({ title: "Incubator full", description: "Hatch one of your eggs first to free up a slot.", variant: "destructive" });
          } else {
            toast({ title: "Couldn't place egg", variant: "destructive" });
          }
        },
      }
    );
  };

  // ── Hatch mutations ─────────────────────────────────────────────────────
  const hatchMutation = useHatchEgg();
  const addEggMutation = useAddEgg();

  const [selectedEgg, setSelectedEgg] = useState<number | null>(null);
  const [selectedEggRealm, setSelectedEggRealm] = useState<string>("balance");
  const [selectedEggSteps, setSelectedEggSteps] = useState<number>(0);
  const [hatchName, setHatchName] = useState("");
  const [showHatchModal, setShowHatchModal] = useState(false);
  const [hatchResult, setHatchResult] = useState<any>(null);
  const [hatchPhase, setHatchPhase] = useState<HatchPhase>("idle");

  const [cinematicData, setCinematicData] = useState<{
    species: string; name: string; rarity: LegendaryRarity;
    realmColor: string; realmEmoji: string; steps: number; hatchlingId: number;
  } | null>(null);

  const LEGENDARY_RARITIES = new Set(["Legendary", "Mythic", "Ancient", "Celestial"]);

  const handleHatchClick = (eggId: number, eggType: string, steps: number) => {
    setSelectedEgg(eggId);
    setSelectedEggRealm(getRealm(eggType));
    setSelectedEggSteps(steps);
    setHatchName("");
    setShowHatchModal(true);
    setHatchResult(null);
    setHatchPhase("idle");
  };

  const submitHatch = () => {
    if (!selectedEgg) return;
    setHatchPhase("cracking");
    setTimeout(() => setHatchPhase("burst"), 800);
    setTimeout(() => {
      hatchMutation.mutate(
        { id: selectedEgg, data: { playerId: pid, name: hatchName || "Mystery Pal" } },
        {
          onSuccess: (res) => {
            const rarity: string = (res as any)?.hatchling?.rarity ?? "Common";
            queryClient.invalidateQueries({ queryKey: allEggsKey });
            queryClient.invalidateQueries({ queryKey: getListHatchlingsQueryKey({ playerId: pid }) });

            if (LEGENDARY_RARITIES.has(rarity)) {
              const style = REALM_EGG_STYLES[selectedEggRealm] ?? REALM_EGG_STYLES["balance"];
              const realmColor = rarity === "Celestial" ? "#22d3ee" : rarity === "Ancient" ? "#14b8a6" : style.crackColor;
              const realmEmoji = rarity === "Celestial" ? "🌌" : rarity === "Ancient" ? "🏺" : style.emoji;
              setShowHatchModal(false);
              setTimeout(() => {
                setCinematicData({
                  species: (res as any)?.hatchling?.species ?? "Mystery Pal",
                  name: ((res as any)?.hatchling?.name ?? hatchName) || "Mystery Pal",
                  rarity: rarity as LegendaryRarity,
                  realmColor, realmEmoji,
                  steps: selectedEggSteps,
                  hatchlingId: (res as any)?.hatchling?.id ?? 0,
                });
              }, 350);
            } else {
              setHatchResult(res);
              setHatchPhase("reveal");
            }
          },
          onError: (err: unknown) => {
            setHatchPhase("idle");
            if (
              err instanceof ApiError &&
              err.status === 402 &&
              (err.data as { error?: string } | null)?.error === "hatchling_cap_reached"
            ) {
              const cap = (err.data as { cap?: number } | null)?.cap ?? 6;
              toast({
                title: "Roster full",
                description: `Free accounts hold up to ${cap} Hatchlings. Upgrade for unlimited storage.`,
                action: (
                  <ToastAction altText="Upgrade" onClick={() => setLocation("/subscription?from=hatchling_cap")}>
                    Upgrade
                  </ToastAction>
                ),
              });
              return;
            }
            toast({ title: "Failed to hatch", variant: "destructive" });
          },
        }
      );
    }, 1600);
  };

  const closeHatchModal = () => {
    setShowHatchModal(false);
    setTimeout(() => { setHatchResult(null); setHatchPhase("idle"); }, 300);
  };

  const resultStyle = REALM_EGG_STYLES[selectedEggRealm] ?? REALM_EGG_STYLES["balance"];
  const genetics = hatchResult?.hatchling?.genetics as Record<string, number> | undefined;

  const incubatorFull = incubatingEggs.length >= 3;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-12 pb-28">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="text-center max-w-2xl mx-auto py-8 relative">
          <motion.div
            className="absolute top-0 right-0 -mr-10 -mt-10 opacity-10 pointer-events-none text-primary"
            animate={{ rotate: 360 }}
            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="w-64 h-64" />
          </motion.div>
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <EggIcon className="w-10 h-10" /> Incubator
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            You get up to 10 fresh eggs every day. Tap one to start incubating — walk to hatch it!
          </p>
        </div>

        {/* ── Incubator slots (3 max) ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black">Incubator</h2>
            <span className="text-sm font-bold text-muted-foreground">
              {incubatingEggs.length} / 3 slots used
            </span>
          </div>

          {isErrorEggs && !allEggs ? (
            <ErrorCard title="Couldn't load your eggs" onRetry={() => refetchEggs()} />
          ) : isLoadingEggs ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-3xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Occupied slots */}
              {incubatingEggs.map((egg: any) => {
                const realm = getRealm(egg.eggType);
                const style = REALM_EGG_STYLES[realm] ?? REALM_EGG_STYLES["balance"];
                return (
                  <motion.div key={egg.id} whileHover={{ y: -6 }}>
                    <GlassCard
                      glow={egg.isReady ? "primary" : "none"}
                      className={`overflow-hidden h-full relative ${style.bg}`}
                    >
                      {egg.isReady && (
                        <motion.div
                          className={`absolute inset-0 bg-gradient-to-br ${style.auraClass} pointer-events-none`}
                          animate={{ opacity: [0.4, 0.8, 0.4] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                        />
                      )}
                      <div className="p-6 flex flex-col items-center text-center relative z-10">
                        <SourceBadge source={egg.source} />
                        <div className="flex gap-2 mt-2 mb-4 items-center">
                          <GlowBadge tone="primary">{egg.eggType}</GlowBadge>
                          <span className="text-xs font-black text-muted-foreground">{style.label}</span>
                        </div>
                        <EggSvg realm={realm} isReady={egg.isReady ?? false} progress={egg.progressPct ?? 0} />
                        <div className="w-full mt-4">
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span className="flex items-center text-muted-foreground gap-1">
                              <Footprints className="w-3 h-3" /> {egg.stepsProgress.toLocaleString()}
                            </span>
                            <span className="text-muted-foreground">{egg.stepsRequired.toLocaleString()} steps</span>
                          </div>
                          <div className="text-center">
                            <RarityBadge rarity={egg.rarity ?? "Common"} />
                          </div>
                        </div>
                        {egg.isReady ? (
                          <motion.div className="w-full mt-4" whileTap={{ scale: 0.97 }}>
                            <NeonButton
                              className="w-full text-lg h-12"
                              onClick={() => handleHatchClick(egg.id, egg.eggType, egg.stepsProgress)}
                            >
                              {style.emoji} HATCH NOW!
                            </NeonButton>
                          </motion.div>
                        ) : (
                          <NeonButton className="w-full mt-4 h-12" variant="secondary" disabled>
                            Incubating ({Math.round(egg.progressPct ?? 0)}%)
                          </NeonButton>
                        )}
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 3 - incubatingEggs.length) }).map((_, i) => (
                <motion.div key={`empty-${i}`} whileHover={{ y: -3 }}>
                  <GlassCard className="overflow-hidden h-full border-dashed border-white/10 bg-white/[0.02]">
                    <div className="p-6 flex flex-col items-center justify-center text-center min-h-[200px] gap-3">
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                        <EggIcon className="w-7 h-7 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground/60">Empty slot</p>
                      {availableEggs.length > 0 ? (
                        <p className="text-xs text-primary/70 font-medium">Tap an egg below to fill it</p>
                      ) : (
                        <p className="text-xs text-muted-foreground/40 font-medium">Check back tomorrow for more eggs</p>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* ── Daily Egg Bag ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-black flex items-center gap-2">
                <Package className="w-6 h-6 text-primary" /> Your Egg Bag
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tap any egg to place it in an open incubator slot
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-primary">{availableEggs.length}</span>
              <p className="text-xs text-muted-foreground font-bold">eggs waiting</p>
            </div>
          </div>

          {isLoadingEggs ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
            </div>
          ) : availableEggs.length > 0 ? (
            <>
              {incubatorFull && (
                <div className="mb-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-bold text-center">
                  Incubator is full — hatch an egg first to free up a slot!
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {availableEggs.map((egg: any) => (
                  <BagEggCard
                    key={egg.id}
                    egg={egg}
                    onPlace={handlePlaceEgg}
                    isPlacing={placeEggMutation.isPending}
                    incubatorFull={incubatorFull}
                  />
                ))}
              </div>
            </>
          ) : (
            <GlassCard className="text-center p-12">
              <div className="relative z-10">
                <div className="text-5xl mb-4">🥚</div>
                <p className="text-muted-foreground font-bold text-lg mb-2">Your egg bag is empty for today</p>
                <p className="text-sm text-muted-foreground">Come back tomorrow for 10 fresh eggs!</p>
                {!isLoadingEggs && dailyRefillMutation.isIdle && (
                  <p className="text-xs text-muted-foreground/60 mt-4">Loading today's eggs…</p>
                )}
              </div>
            </GlassCard>
          )}
        </div>

        {/* ── Your Pals mini-grid ────────────────────────────────────────────── */}
        <div>
          <h2 className="text-2xl font-black mb-6">Your Pals</h2>
          {isErrorHatchlings && !hatchlings ? (
            <ErrorCard title="Couldn't load your Pals" onRetry={() => refetchHatchlings()} />
          ) : isLoadingHatchlings ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
            </div>
          ) : hatchlings?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {hatchlings.map((h: any) => {
                const realm = h.realm ?? "balance";
                const style = REALM_EGG_STYLES[realm] ?? REALM_EGG_STYLES["balance"];
                return (
                  <Link key={h.id} href={`/hatchlings/${h.id}`}>
                    <GlassCard interactive className="p-4">
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-2 text-2xl border border-white/10"
                          style={{ background: `radial-gradient(circle, ${style.crackColor}20, transparent)` }}>
                          {style.emoji}
                        </div>
                        <h3 className="font-bold text-xs truncate w-full">{h.name}</h3>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mt-0.5">Lv {h.level}</p>
                      </div>
                    </GlassCard>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground font-medium">No Pals hatched yet — tap an egg to get started!</p>
          )}
        </div>
      </div>

      {/* ── Legendary Cinematic ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {cinematicData && (
          <LegendaryCinematic
            key="legendary-cinematic"
            species={cinematicData.species}
            name={cinematicData.name}
            rarity={cinematicData.rarity}
            realmColor={cinematicData.realmColor}
            realmEmoji={cinematicData.realmEmoji}
            steps={cinematicData.steps}
            onClose={() => { setCinematicData(null); setHatchResult(null); setHatchPhase("idle"); }}
            onViewPal={() => {
              setCinematicData(null); setHatchResult(null); setHatchPhase("idle");
              setLocation(`/hatchlings/${cinematicData.hatchlingId}`);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Hatch Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={showHatchModal} onOpenChange={setShowHatchModal}>
        <DialogContent className={`sm:max-w-md border-2 ${resultStyle.border} bg-background`}
          style={{ boxShadow: `0 0 60px ${resultStyle.crackColor}30` }}>
          <AnimatePresence mode="wait">

            {hatchPhase === "idle" && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DialogHeader>
                  <DialogTitle className="text-3xl font-black text-center mb-1" style={{ color: resultStyle.crackColor }}>
                    {resultStyle.emoji} The egg is cracking!
                  </DialogTitle>
                  <p className="text-center text-sm text-muted-foreground font-medium">{resultStyle.label}</p>
                </DialogHeader>
                <div className="py-6 flex flex-col items-center">
                  <motion.div
                    animate={{ rotate: [-8, 8, -8], scale: [1, 1.08, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6 }}
                    className="mb-6 text-6xl"
                  >
                    {resultStyle.emoji}
                  </motion.div>
                  <p className="text-center font-bold mb-4 text-lg">Give your new Pal a name:</p>
                  <Input
                    value={hatchName}
                    onChange={e => setHatchName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && submitHatch()}
                    placeholder="Enter name..."
                    className="text-center text-xl h-14 font-bold border-2 focus-visible:ring-primary"
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <NeonButton className="w-full h-14 text-xl" onClick={submitHatch}>
                    Confirm & Hatch!
                  </NeonButton>
                </DialogFooter>
              </motion.div>
            )}

            {hatchPhase === "cracking" && (
              <motion.div key="cracking" className="py-16 flex flex-col items-center text-center"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  className="text-7xl mb-6"
                  animate={{ rotate: [-15, 15, -15], scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.4 }}
                >
                  {resultStyle.emoji}
                </motion.div>
                <p className="font-black text-2xl" style={{ color: resultStyle.crackColor }}>Cracking...</p>
                <div className="flex gap-2 mt-4">
                  {[...Array(3)].map((_, i) => (
                    <motion.div key={i} className="w-2 h-2 rounded-full"
                      style={{ background: resultStyle.crackColor }}
                      animate={{ scale: [0, 1, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {hatchPhase === "burst" && (
              <motion.div key="burst" className="py-16 flex flex-col items-center text-center"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  className="text-7xl mb-6"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: [0.5, 1.4, 1], opacity: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  ✨
                </motion.div>
                <p className="font-black text-2xl" style={{ color: resultStyle.crackColor }}>Hatching!</p>
              </motion.div>
            )}

            {hatchPhase === "reveal" && hatchResult && (
              <motion.div key="reveal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <DialogHeader>
                  <DialogTitle className="text-3xl font-black text-center" style={{ color: resultStyle.crackColor }}>
                    {resultStyle.emoji} A new Pal!
                  </DialogTitle>
                </DialogHeader>
                <div className="py-6 text-center space-y-3">
                  <motion.div
                    className="text-6xl"
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  >
                    {resultStyle.emoji}
                  </motion.div>
                  <div>
                    <p className="text-2xl font-black">{hatchResult?.hatchling?.name}</p>
                    <p className="text-sm text-muted-foreground font-medium">{hatchResult?.hatchling?.species}</p>
                  </div>
                  <RarityBadge rarity={hatchResult?.hatchling?.rarity ?? "Common"} />
                  {hatchResult?.hatchling?.personality && (
                    <p className="text-xs font-bold text-muted-foreground">
                      {hatchResult.hatchling.personality} personality
                    </p>
                  )}
                  {genetics && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {Object.entries(genetics).map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-white/5 p-2">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-black">{k}</p>
                          <p className="font-black text-sm" style={{ color: resultStyle.crackColor }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <NeonButton variant="secondary" onClick={closeHatchModal} className="flex-1">
                    Close
                  </NeonButton>
                  <NeonButton
                    onClick={() => {
                      closeHatchModal();
                      setLocation(`/hatchlings/${hatchResult?.hatchling?.id}`);
                    }}
                    className="flex-1"
                  >
                    View Pal
                  </NeonButton>
                </DialogFooter>
              </motion.div>
            )}

          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
