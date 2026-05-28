import { useState } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useListEggs, getListEggsQueryKey,
  useHatchEgg,
  useAddEgg,
  useListHatchlings, getListHatchlingsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Egg as EggIcon, Sparkles, Plus, Footprints, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Link, useLocation } from "wouter";
import { ApiError } from "@workspace/api-client-react";
import { ErrorCard } from "@/components/error-card";
import { useEpicMomentQueue } from "@/components/epic-moment-overlay";

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
    label: "Strength Realm",
    emoji: "🔥",
    auraClass: "from-red-500/30 to-orange-500/10",
  },
  cardio: {
    bg: "bg-gradient-to-br from-cyan-950 via-blue-950 to-slate-950",
    border: "border-cyan-400",
    glow: "shadow-cyan-500/40",
    crackColor: "#06b6d4",
    label: "Cardio Realm",
    emoji: "⚡",
    auraClass: "from-cyan-500/30 to-blue-500/10",
  },
  balance: {
    bg: "bg-gradient-to-br from-purple-950 via-violet-950 to-indigo-950",
    border: "border-purple-400",
    glow: "shadow-purple-500/40",
    crackColor: "#a855f7",
    label: "Balance Realm",
    emoji: "✨",
    auraClass: "from-purple-500/30 to-fuchsia-500/10",
  },
  beast: {
    bg: "bg-gradient-to-br from-green-950 via-emerald-950 to-stone-950",
    border: "border-green-500",
    glow: "shadow-green-500/40",
    crackColor: "#22c55e",
    label: "Beast Realm",
    emoji: "🌿",
    auraClass: "from-green-500/30 to-emerald-500/10",
  },
  mythic: {
    bg: "bg-gradient-to-br from-pink-950 via-violet-950 to-indigo-950",
    border: "border-pink-400",
    glow: "shadow-pink-500/40",
    crackColor: "#ec4899",
    label: "Mythic Realm",
    emoji: "🌌",
    auraClass: "from-pink-500/30 to-violet-500/10",
  },
};

const PERSONALITY_FLAVOR: Record<string, string> = {
  Sleepy: "Slow to wake, but unstoppable once it gets going.",
  Hyper: "Bursting with energy — it never stops moving.",
  Loyal: "Devoted to its Trainer above all else.",
  Competitive: "Born to win. It trains hardest when challenged.",
  Calm: "Measured and steady — wise beyond its years.",
};

const EGG_TYPE_TO_REALM: Record<string, string> = {
  strength: "strength", cardio: "cardio", balance: "balance",
  beast: "beast", balanced: "balance", legendary: "mythic", mythic: "mythic",
};

function getRealm(eggType: string): string {
  return EGG_TYPE_TO_REALM[eggType] ?? "balance";
}

// ── SVG Egg Shape ──────────────────────────────────────────────────────────────
function EggSvg({ realm, isReady, progress }: { realm: string; isReady: boolean; progress: number }) {
  const style = REALM_EGG_STYLES[realm] ?? REALM_EGG_STYLES["balance"];
  const crackColor = style.crackColor;
  const circumference = 351.86;

  return (
    <div className="relative w-32 h-32">
      {/* Progress ring */}
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <motion.circle
          cx="64" cy="64" r="56" fill="none"
          stroke={crackColor} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * (progress / 100))}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (circumference * (progress / 100)) }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: isReady ? `drop-shadow(0 0 6px ${crackColor})` : "none" }}
        />
      </svg>

      {/* Egg center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative"
          animate={isReady
            ? { scale: [1, 1.15, 1], rotate: [0, -6, 6, -6, 0] }
            : {}}
          transition={isReady ? { repeat: Infinity, duration: 0.7 } : {}}
        >
          {/* Crack effect when ready */}
          {isReady && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: `radial-gradient(circle, ${crackColor}40 0%, transparent 70%)` }}
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
          )}
          <span className="text-4xl">{style.emoji}</span>
        </motion.div>
      </div>
    </div>
  );
}

// ── Hatch animation phases ─────────────────────────────────────────────────────
type HatchPhase = "idle" | "cracking" | "burst" | "reveal";

export default function Hatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const [, setLocation] = useLocation();

  const { data: eggs, isLoading: isLoadingEggs, isError: isErrorEggs, refetch: refetchEggs } = useListEggs(
    { playerId: pid, hatched: false },
    { query: { queryKey: getListEggsQueryKey({ playerId: pid, hatched: false }), enabled: !!playerId } }
  );

  const { data: hatchlings, isLoading: isLoadingHatchlings, isError: isErrorHatchlings, refetch: refetchHatchlings } = useListHatchlings(
    { playerId: pid },
    { query: { queryKey: getListHatchlingsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

  const hatchMutation = useHatchEgg();
  const addEggMutation = useAddEgg();
  const { enqueue: enqueueEpicMoment } = useEpicMomentQueue();

  const [selectedEgg, setSelectedEgg] = useState<number | null>(null);
  const [selectedEggRealm, setSelectedEggRealm] = useState<string>("balance");
  const [hatchName, setHatchName] = useState("");
  const [showHatchModal, setShowHatchModal] = useState(false);
  const [hatchResult, setHatchResult] = useState<any>(null);
  const [hatchPhase, setHatchPhase] = useState<HatchPhase>("idle");

  const handleHatchClick = (eggId: number, eggType: string) => {
    setSelectedEgg(eggId);
    setSelectedEggRealm(getRealm(eggType));
    setHatchName("");
    setShowHatchModal(true);
    setHatchResult(null);
    setHatchPhase("idle");
  };

  const submitHatch = () => {
    if (!selectedEgg) return;
    setHatchPhase("cracking");

    // Animate through phases
    setTimeout(() => setHatchPhase("burst"), 800);
    setTimeout(() => {
      hatchMutation.mutate(
        { id: selectedEgg, data: { playerId: pid, name: hatchName || "Mystery Pal" } },
        {
          onSuccess: (res) => {
            setHatchResult(res);
            setHatchPhase("reveal");
            queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: pid, hatched: false }) });
            queryClient.invalidateQueries({ queryKey: getListHatchlingsQueryKey({ playerId: pid }) });

            // Mythic+ hatches get the full-screen epic moment. We let the
            // reveal modal play first so the two celebrations don't fight.
            const rarity = (res as any)?.hatchling?.rarity;
            if (rarity === "Mythic" || rarity === "Legendary") {
              const style = REALM_EGG_STYLES[selectedEggRealm] ?? REALM_EGG_STYLES["balance"];
              setTimeout(() => {
                enqueueEpicMoment({
                  kind: "hatch",
                  species: (res as any)?.hatchling?.species ?? "Mystery Pal",
                  rarity: rarity as "Mythic" | "Legendary",
                  realmColor: style.crackColor,
                  realmEmoji: style.emoji,
                });
              }, 2000);
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
                  <ToastAction
                    altText="Upgrade to Premium"
                    onClick={() => setLocation("/subscription?from=hatchling_cap")}
                  >
                    Upgrade
                  </ToastAction>
                ),
              });
              return;
            }
            toast({ title: "Failed to hatch", variant: "destructive" });
          }
        }
      );
    }, 1600);
  };

  const handleAddEgg = () => {
    addEggMutation.mutate(
      { data: { playerId: pid, eggType: "balanced" } },
      {
        onSuccess: () => {
          toast({ title: "🥚 New egg found!" });
          queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: pid, hatched: false }) });
        },
        onError: () => {
          toast({ title: "Couldn't find a new egg", description: "Try again in a moment.", variant: "destructive" });
        }
      }
    );
  };

  const closeHatchModal = () => {
    setShowHatchModal(false);
    setTimeout(() => { setHatchResult(null); setHatchPhase("idle"); }, 300);
  };

  const resultStyle = REALM_EGG_STYLES[selectedEggRealm] ?? REALM_EGG_STYLES["balance"];
  const genetics = hatchResult?.hatchling?.genetics as Record<string, number> | undefined;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-12 pb-12">
        {/* Header */}
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
            Train across five Realms to hatch your Pals. Every step, rep, and stretch counts!
          </p>
          <NeonButton onClick={handleAddEgg} disabled={addEggMutation.isPending} variant="secondary" className="mt-6">
            <Plus className="w-4 h-4 mr-2" /> Find New Egg
          </NeonButton>
        </div>

        {/* Active Eggs */}
        <div>
          <h2 className="text-2xl font-black mb-6">Active Eggs</h2>
          {isErrorEggs && !eggs ? (
            <ErrorCard title="Couldn't load your eggs" onRetry={() => refetchEggs()} />
          ) : isLoadingEggs ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-3xl" />)}
            </div>
          ) : eggs?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {eggs.map(egg => {
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
                        {/* Realm badge */}
                        <div className="flex gap-2 mb-4 items-center">
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
                            <GlowBadge tone="violet">{egg.rarity}</GlowBadge>
                          </div>
                        </div>

                        {egg.isReady ? (
                          <motion.div className="w-full mt-4" whileTap={{ scale: 0.97 }}>
                            <NeonButton
                              className="w-full text-lg h-12"
                              onClick={() => handleHatchClick(egg.id, egg.eggType)}
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
            </div>
          ) : (
            <GlassCard className="text-center p-12">
              <div className="relative z-10">
                <p className="text-muted-foreground font-bold text-lg mb-4">Your incubator is empty — time to train!</p>
                <NeonButton onClick={handleAddEgg} disabled={addEggMutation.isPending}>Find an Egg</NeonButton>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Your Pals mini-grid */}
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
              {hatchlings.map(h => {
                const realm = (h.realm as string | undefined) ?? "balance";
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
            <p className="text-muted-foreground font-medium">No Pals hatched yet. Train to fill your incubator!</p>
          )}
        </div>
      </div>

      {/* ── Hatch Modal ─────────────────────────────────────────────────────────── */}
      <Dialog open={showHatchModal} onOpenChange={setShowHatchModal}>
        <DialogContent className={`sm:max-w-md border-2 ${resultStyle.border} bg-background`}
          style={{ boxShadow: `0 0 60px ${resultStyle.crackColor}30` }}>
          <AnimatePresence mode="wait">

            {/* Phase: naming input */}
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

            {/* Phase: cracking */}
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

            {/* Phase: energy burst */}
            {hatchPhase === "burst" && (
              <motion.div key="burst" className="py-16 flex flex-col items-center text-center"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 8 }}>
                <motion.div
                  className="text-8xl mb-4"
                  animate={{ scale: [1, 1.5, 0.8, 1.2, 1], rotate: [0, 20, -20, 10, 0] }}
                  transition={{ duration: 0.8 }}
                >
                  💥
                </motion.div>
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: `radial-gradient(circle, ${resultStyle.crackColor}40 0%, transparent 70%)` }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8 }}
                />
                <p className="font-black text-3xl" style={{ color: resultStyle.crackColor }}>It's hatching!</p>
              </motion.div>
            )}

            {/* Phase: creature reveal */}
            {hatchPhase === "reveal" && hatchResult && (
              <motion.div key="reveal" className="text-center py-6 relative"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 10 }}>

                {/* Aura bg */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${resultStyle.auraClass} pointer-events-none`} />

                <motion.h2
                  className="text-3xl font-black mb-1 relative z-10"
                  style={{ color: resultStyle.crackColor }}
                  animate={{ scale: [0.8, 1.05, 1] }}
                  transition={{ duration: 0.5 }}>
                  It's a {hatchResult.hatchling.species}!
                </motion.h2>

                <p className="text-sm text-muted-foreground mb-4 font-bold relative z-10">{resultStyle.label}</p>

                {/* Creature visual */}
                <div className="w-36 h-36 mx-auto rounded-full flex items-center justify-center mb-4 relative z-10 border-4 text-7xl"
                  style={{ borderColor: resultStyle.crackColor, boxShadow: `0 0 30px ${resultStyle.crackColor}60`, background: `radial-gradient(circle, ${resultStyle.crackColor}20, transparent)` }}>
                  <motion.span
                    animate={{ scale: [0.5, 1.1, 1], rotate: [0, 10, -5, 0] }}
                    transition={{ duration: 0.6 }}
                  >
                    {resultStyle.emoji}
                  </motion.span>
                </div>

                <p className="text-2xl font-black text-foreground mb-1 relative z-10">{hatchResult.hatchling.name}</p>

                {/* Badges */}
                <div className="flex gap-2 justify-center mb-4 relative z-10 flex-wrap">
                  <GlowBadge tone="primary">{resultStyle.label}</GlowBadge>
                  <GlowBadge tone="violet">{hatchResult.hatchling.rarity}</GlowBadge>
                  {hatchResult.hatchling.isShiny && <GlowBadge tone="yellow">✦ SHINY</GlowBadge>}
                </div>

                {/* Personality */}
                <div className="bg-black/20 rounded-xl p-3 mb-4 relative z-10 mx-2">
                  <p className="text-xs font-black uppercase text-muted-foreground mb-0.5">Personality</p>
                  <p className="font-black text-lg capitalize" style={{ color: resultStyle.crackColor }}>
                    {hatchResult.hatchling.personality}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {PERSONALITY_FLAVOR[hatchResult.hatchling.personality] ?? "A mysterious and unique spirit."}
                  </p>
                </div>

                {/* Genetics preview */}
                {genetics && (
                  <div className="bg-black/20 rounded-xl p-3 mb-4 relative z-10 mx-2">
                    <p className="text-xs font-black uppercase text-muted-foreground mb-2">Genetics Preview</p>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      {Object.entries(genetics).slice(0, 6).map(([key, val]) => (
                        <div key={key} className="text-center">
                          <div className="h-1 bg-white/10 rounded-full mb-0.5">
                            <div className="h-full rounded-full" style={{ width: `${val}%`, background: resultStyle.crackColor }} />
                          </div>
                          <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 relative z-10">
                  <NeonButton variant="secondary" className="flex-1 h-11" onClick={closeHatchModal}>Close</NeonButton>
                  <Link href={`/hatchlings/${hatchResult.hatchling.id}`} className="flex-1">
                    <NeonButton className="w-full h-11">
                      <Zap className="w-4 h-4 mr-1" /> View Pal
                    </NeonButton>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
