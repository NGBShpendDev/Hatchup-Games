import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useListHatchlings,
  getListHatchlingsQueryKey,
  useCreateCompetition,
  useSubmitCompetitionResult,
  getGetHatchlingQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { NeonButton } from "@/components/ui/neon-button";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { HatchlingCard } from "@/components/hatchling-card";
import { ErrorCard } from "@/components/error-card";
import { HatchlingReaction, type HatchlingReactionData } from "@/components/hatchling-reaction";
import { Zap, TrendingUp } from "lucide-react";
import { useEvolutionShare } from "@/components/evolution-share-provider";

const XP_PER_LEVEL = 100;

export default function Race() {
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const modeName = searchParams.get('mode') || 'Race';
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [selectedHatchlingId, setSelectedHatchlingId] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'select' | 'racing' | 'result'>('select');
  const [result, setResult] = useState<{
    rank: number;
    xp: number;
    coins: number;
    hatchlingXpDelta: number | null;
    hatchlingPrevLevel: number | null;
    hatchlingNewLevel: number | null;
    hatchlingNewXp: number | null;
    hatchlingEvolutionSharePrompt: boolean | null;
  } | null>(null);
  const [reaction, setReaction] = useState<HatchlingReactionData | null>(null);

  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { promptLevelMilestoneShare } = useEvolutionShare();
  const { data: hatchlings, isError: isHatchlingsError, refetch: refetchHatchlings } = useListHatchlings(
    { playerId: pid },
    { query: { enabled: !!playerId, queryKey: getListHatchlingsQueryKey({ playerId: pid }) } }
  );

  const startMutation = useCreateCompetition();
  const resultMutation = useSubmitCompetitionResult();
  const queryClient = useQueryClient();

  const startRace = () => {
    if (!selectedHatchlingId) return;
    setGameState('racing');

    setTimeout(() => {
      startMutation.mutate(
        { data: { mode: modeName, playerId: pid, hatchlingId: selectedHatchlingId } },
        {
          onSuccess: (comp) => {
            const rank = Math.floor(Math.random() * 8) + 1;
            const score = Math.floor(Math.random() * 500) + 100;
            const duration = Math.floor(Math.random() * 300) + 60;

            resultMutation.mutate(
              { id: comp.id, data: { score, duration, rank } },
              {
                onSuccess: (finalComp) => {
                  setResult({
                    rank: finalComp.rank ?? rank,
                    xp: finalComp.xpEarned ?? 150,
                    coins: finalComp.coinsEarned ?? 15,
                    hatchlingXpDelta: finalComp.hatchlingXpDelta ?? null,
                    hatchlingPrevLevel: finalComp.hatchlingPrevLevel ?? null,
                    hatchlingNewLevel: finalComp.hatchlingNewLevel ?? null,
                    hatchlingNewXp: finalComp.hatchlingNewXp ?? null,
                    hatchlingEvolutionSharePrompt: finalComp.hatchlingEvolutionSharePrompt ?? null,
                  });
                  if (finalComp.hatchlingEvolutionSharePrompt && finalComp.hatchlingNewLevel != null) {
                    const racer = hatchlings?.find((h) => h.id === comp.hatchlingId);
                    if (racer) {
                      promptLevelMilestoneShare({
                        hatchlingId: comp.hatchlingId,
                        hatchlingName: racer.name,
                        newLevel: finalComp.hatchlingNewLevel,
                      });
                    }
                  }
                  setGameState('result');
                  const racer = hatchlings?.find((h) => h.id === selectedHatchlingId);
                  if (racer) {
                    const happinessDelta = rank === 1 ? 20 : rank <= 3 ? 10 : -5;
                    const energyDelta = rank <= 3 ? -10 : -15;
                    setReaction({
                      hatchlingName: racer.name,
                      happinessDelta,
                      energyDelta,
                    });
                  }
                  if (selectedHatchlingId) {
                    queryClient.invalidateQueries({
                      queryKey: getGetHatchlingQueryKey(selectedHatchlingId),
                    });
                  }
                  queryClient.invalidateQueries({
                    queryKey: getListHatchlingsQueryKey({ playerId: pid }),
                  });
                },
                onError: () => {
                  setResult({
                    rank,
                    xp: comp.xpEarned ?? 150,
                    coins: comp.coinsEarned ?? 15,
                    hatchlingXpDelta: null,
                    hatchlingPrevLevel: null,
                    hatchlingNewLevel: null,
                    hatchlingNewXp: null,
                    hatchlingEvolutionSharePrompt: null,
                  });
                  setGameState('result');
                  toast({ title: "Note", description: "Could not record result, XP may be delayed." });
                },
              }
            );
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to complete race.", variant: "destructive" });
            setGameState('select');
          }
        }
      );
    }, 4000);
  };

  const leveledUp = result?.hatchlingNewLevel != null &&
    result?.hatchlingPrevLevel != null &&
    result.hatchlingNewLevel > result.hatchlingPrevLevel;

  const palXpProgress = result?.hatchlingNewXp != null
    ? ((result.hatchlingNewXp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100
    : null;

  return (
    <Layout>
      <HatchlingReaction reaction={reaction} onDismiss={() => setReaction(null)} />
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[80vh]">
        <AnimatePresence mode="wait">

          {gameState === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full"
            >
              <div className="text-center mb-10">
                <h1 className="text-5xl font-black mb-4">Join {modeName}</h1>
                <p className="text-xl text-muted-foreground font-medium">Select your champion for this event.</p>
              </div>

              {isHatchlingsError && !hatchlings && (
                <div className="mb-6">
                  <ErrorCard title="Couldn't load your Pals" onRetry={() => refetchHatchlings()} />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                {hatchlings?.map(h => (
                  <div
                    key={h.id}
                    data-testid={`race-hatchling-select-${h.id}`}
                    className={`rounded-3xl border-4 transition-all cursor-pointer ${selectedHatchlingId === h.id ? 'border-primary scale-105 shadow-2xl shadow-primary/20' : 'border-transparent hover:border-border'}`}
                    onClick={() => setSelectedHatchlingId(h.id)}
                  >
                    <div className="pointer-events-none">
                      <HatchlingCard hatchling={h} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <NeonButton
                  size="lg"
                  className="text-2xl px-16 py-8 rounded-full"
                  disabled={!selectedHatchlingId}
                  onClick={startRace}
                >
                  START RACE
                </NeonButton>
              </div>
            </motion.div>
          )}

          {gameState === 'racing' && (
            <motion.div
              key="racing"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-32 h-32 border-8 border-primary border-t-transparent rounded-full mx-auto mb-8"
              />
              <h2 className="text-4xl font-black animate-pulse">RACING...</h2>
              <p className="text-xl text-muted-foreground mt-4 font-bold">Your Pal is giving it their all!</p>
            </motion.div>
          )}

          {gameState === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-lg"
            >
              <GlassCard glow="primary" className="text-center p-12">
                <div className="relative z-10">
                  <h2 className="text-3xl font-black mb-2 uppercase text-muted-foreground">Race Finished</h2>
                  <div className="text-8xl font-black text-primary my-8 drop-shadow-lg">
                    #{result.rank}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                      <p className="text-sm font-bold text-muted-foreground uppercase">XP Earned</p>
                      <p className="text-3xl font-black text-green-500">+{result.xp}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                      <p className="text-sm font-bold text-muted-foreground uppercase">Coins Earned</p>
                      <p className="text-3xl font-black text-yellow-500">+{result.coins}</p>
                    </div>
                  </div>

                  {/* Pal XP + level-up block */}
                  {result.hatchlingXpDelta != null && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4 text-left"
                    >
                      {leveledUp && (
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", delay: 0.4 }}
                          className="flex items-center gap-2 justify-center mb-3 px-3 py-2 bg-yellow-400/15 border border-yellow-400/30 rounded-xl"
                          data-testid="race-level-up-banner"
                        >
                          <TrendingUp className="w-4 h-4 text-yellow-400 shrink-0" />
                          <span className="font-black text-yellow-300 text-sm">
                            LEVEL UP! Lv.{result.hatchlingPrevLevel} → Lv.{result.hatchlingNewLevel}
                          </span>
                        </motion.div>
                      )}

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-green-400" /> Pal XP
                        </span>
                        <span className="text-xs font-black text-green-400">
                          +{result.hatchlingXpDelta} XP
                        </span>
                      </div>

                      {result.hatchlingNewLevel != null && palXpProgress != null && (
                        <>
                          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                            <span>Lv.{result.hatchlingNewLevel}</span>
                            <span>{result.hatchlingNewXp != null ? result.hatchlingNewXp % XP_PER_LEVEL : 0}/{XP_PER_LEVEL} XP</span>
                          </div>
                          <Progress
                            value={palXpProgress}
                            className="h-2 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-green-500 [&>div]:to-emerald-400"
                            data-testid="race-pal-xp-bar"
                          />
                        </>
                      )}
                    </motion.div>
                  )}

                  <div className="flex gap-4">
                    <NeonButton size="lg" className="flex-1" onClick={() => setGameState('select')}>Race Again</NeonButton>
                    <NeonButton size="lg" variant="secondary" className="flex-1" onClick={() => setLocation('/compete')}>Back to Modes</NeonButton>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </Layout>
  );
}
