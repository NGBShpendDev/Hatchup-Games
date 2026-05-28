import { useState } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useGetWorkoutPlan, getGetWorkoutPlanQueryKey,
  useGenerateWorkoutPlan,
  useGetActiveQuests, getGetActiveQuestsQueryKey,
  useGetMealPlan, getGetMealPlanQueryKey,
  useGenerateMealPlan,
  useListWorkoutSessions, getListWorkoutSessionsQueryKey,
  useLogWorkoutSession,
  useListHatchlings, getListHatchlingsQueryKey,
} from "@workspace/api-client-react";
import { HatchlingReaction, type HatchlingReactionData } from "@/components/hatchling-reaction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell, Target, Utensils, History, Zap, CheckCircle2, Trophy, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Training() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playerId, player } = usePlayer();
  const pid = playerId ?? 0;
  const [reaction, setReaction] = useState<HatchlingReactionData | null>(null);

  const { data: ownedHatchlings } = useListHatchlings(
    { playerId: pid },
    { query: { queryKey: getListHatchlingsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

  const { data: workoutPlan, isLoading: isLoadingWorkout, error: workoutError } = useGetWorkoutPlan(
    { playerId: pid },
    { query: { queryKey: getGetWorkoutPlanQueryKey({ playerId: pid }), retry: false, enabled: !!playerId } }
  );

  const { data: quests, isLoading: isLoadingQuests } = useGetActiveQuests(
    pid,
    { query: { queryKey: getGetActiveQuestsQueryKey(pid), enabled: !!playerId } }
  );

  const { data: mealPlan, isLoading: isLoadingMeals, error: mealError } = useGetMealPlan(
    { playerId: pid },
    { query: { queryKey: getGetMealPlanQueryKey({ playerId: pid }), retry: false, enabled: !!playerId } }
  );

  const { data: sessions, isLoading: isLoadingSessions } = useListWorkoutSessions(
    { playerId: pid, limit: 10 },
    { query: { queryKey: getListWorkoutSessionsQueryKey({ playerId: pid, limit: 10 }), enabled: !!playerId } }
  );

  const generateWorkout = useGenerateWorkoutPlan();
  const generateMeal = useGenerateMealPlan();
  const logSession = useLogWorkoutSession();

  const [workoutGoal, setWorkoutGoal] = useState("gain_muscle");
  const [mealGoal, setMealGoal] = useState("gain_muscle");

  const handleGenerateWorkout = () => {
    generateWorkout.mutate(
      { data: { playerId: pid, goal: workoutGoal, fitnessLevel: "intermediate", equipment: "dumbbells,bodyweight" } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWorkoutPlanQueryKey({ playerId: pid }) }) }
    );
  };

  const handleGenerateMeal = () => {
    generateMeal.mutate(
      { data: { playerId: pid, goal: mealGoal } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMealPlanQueryKey({ playerId: pid }) }) }
    );
  };

  const handleLogSession = (type: string, duration: number) => {
    logSession.mutate(
      { data: { playerId: pid, workoutType: type, durationMinutes: duration, exercisesCompleted: 5 } },
      {
        onSuccess: () => {
          toast({ title: "Workout logged!", description: "XP and coins earned." });
          queryClient.invalidateQueries({ queryKey: getListWorkoutSessionsQueryKey({ playerId: pid, limit: 10 }) });
          const activeId = player?.activeHatchlingId;
          const partner =
            (activeId && ownedHatchlings?.find((h) => h.id === activeId)) ||
            ownedHatchlings?.[0];
          if (partner) {
            setReaction({
              hatchlingName: partner.name,
              happinessDelta: 10,
              energyDelta: -5,
            });
          }
        }
      }
    );
  };

  return (
    <Layout>
      <HatchlingReaction reaction={reaction} onDismiss={() => setReaction(null)} />
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <Dumbbell className="w-10 h-10" /> AI Coach
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Your personalized training hub. Complete workouts and quests to evolve your Pals faster.
          </p>
        </div>

        <Tabs defaultValue="workout" className="w-full">
          <TabsList className="w-full grid grid-cols-4 bg-muted/50 p-1 rounded-2xl mb-8">
            <TabsTrigger value="workout" className="rounded-xl font-bold flex items-center gap-2"><Dumbbell className="w-4 h-4 hidden sm:block"/> Workout</TabsTrigger>
            <TabsTrigger value="quests" className="rounded-xl font-bold flex items-center gap-2"><Target className="w-4 h-4 hidden sm:block"/> Quests</TabsTrigger>
            <TabsTrigger value="nutrition" className="rounded-xl font-bold flex items-center gap-2"><Utensils className="w-4 h-4 hidden sm:block"/> Nutrition</TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl font-bold flex items-center gap-2"><History className="w-4 h-4 hidden sm:block"/> History</TabsTrigger>
          </TabsList>

          <TabsContent value="workout" className="space-y-6">
            {isLoadingWorkout || generateWorkout.isPending ? (
              <Skeleton className="h-96 w-full rounded-3xl" />
            ) : workoutError || !workoutPlan ? (
              <GlassCard className="text-center py-12 px-6">
                <div className="relative z-10">
                  <Dumbbell className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-2xl font-black mb-2">No Active Plan</h3>
                  <p className="text-muted-foreground mb-6">Generate a personalized workout plan to start training.</p>
                  <div className="flex justify-center gap-4 mb-6 flex-wrap">
                    {["lose_weight", "gain_muscle", "improve_endurance"].map(goal => (
                      <Button
                        key={goal}
                        variant={workoutGoal === goal ? "default" : "outline"}
                        onClick={() => setWorkoutGoal(goal)}
                        className="font-bold capitalize"
                      >
                        {goal.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>
                  <NeonButton size="lg" onClick={handleGenerateWorkout} disabled={generateWorkout.isPending}>
                    Generate AI Plan
                  </NeonButton>
                </div>
              </GlassCard>
            ) : (
              <div className="space-y-6">
                <GlassCard glow="primary" className="p-6">
                  <div className="relative z-10 space-y-6">
                    <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-black">Today's Workout</h2>
                      <GlowBadge tone="primary">Day {workoutPlan.days[0]?.name}</GlowBadge>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <GlowBadge tone="primary"><Clock className="w-3 h-3" /> {workoutPlan.days[0]?.durationMinutes} min</GlowBadge>
                      <GlowBadge tone="yellow"><Zap className="w-3 h-3" /> {workoutPlan.days[0]?.xpReward} XP</GlowBadge>
                    </div>
                    <div className="space-y-4">
                      {workoutPlan.days[0]?.exercises.map((ex, i) => (
                        <div key={i} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
                          <div>
                            <h4 className="font-bold text-lg">{ex.name}</h4>
                            <p className="text-sm text-muted-foreground font-medium">{ex.sets} sets × {ex.reps} • rest {ex.rest}</p>
                          </div>
                          <CheckCircle2 className="w-6 h-6 text-muted-foreground opacity-30" />
                        </div>
                      ))}
                    </div>
                    <NeonButton size="lg" className="w-full" onClick={() => handleLogSession(workoutPlan.days[0]?.name || "workout", workoutPlan.days[0]?.durationMinutes || 30)}>
                      Log Workout Session
                    </NeonButton>
                  </div>
                </GlassCard>
              </div>
            )}
          </TabsContent>

          <TabsContent value="quests" className="space-y-4">
            {isLoadingQuests ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
            ) : quests?.length ? (
              quests.map(quest => (
                <motion.div key={quest.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <GlassCard interactive className="p-6">
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-black text-xl mb-1">{quest.title}</h3>
                          <p className="text-sm text-muted-foreground font-medium">{quest.description}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <GlowBadge tone="yellow">+{quest.coinReward} Coins</GlowBadge>
                          <div className="text-xs font-bold text-primary">+{quest.xpReward} XP</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                          <span>{quest.currentValue} / {quest.targetValue}</span>
                          <span>{Math.round(quest.progressPct ?? 0)}%</span>
                        </div>
                        <Progress value={quest.progressPct} className="h-3 bg-muted [&>div]:bg-primary" />
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground font-bold">No active quests.</div>
            )}
          </TabsContent>

          <TabsContent value="nutrition">
            {isLoadingMeals || generateMeal.isPending ? (
              <Skeleton className="h-96 w-full rounded-3xl" />
            ) : mealError || !mealPlan ? (
              <GlassCard className="text-center py-12 px-6">
                <div className="relative z-10">
                  <Utensils className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-2xl font-black mb-2">No Meal Plan</h3>
                  <p className="text-muted-foreground mb-6">Generate a nutrition plan to fuel your evolutions.</p>
                  <NeonButton size="lg" onClick={handleGenerateMeal} disabled={generateMeal.isPending}>
                    Generate Meal Plan
                  </NeonButton>
                </div>
              </GlassCard>
            ) : (
              <div className="space-y-6">
                <GlassCard glow="accent" className="p-6">
                  <div className="relative z-10 space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h2 className="text-2xl font-black">Today's Nutrition</h2>
                      <div className="flex gap-2">
                        <GlowBadge tone="green">{mealPlan.days[0]?.totalCalories} kcal</GlowBadge>
                        <GlowBadge tone="cyan">{mealPlan.days[0]?.totalProtein}g protein</GlowBadge>
                      </div>
                    </div>
                    {['breakfast', 'lunch', 'dinner'].map(meal => (
                      <div key={meal} className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2">{meal}</h4>
                        <p className="font-medium text-lg">{(mealPlan.days[0] as any)[meal]}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {isLoadingSessions ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
            ) : sessions?.length ? (
              <div className="space-y-4">
                {sessions.map(session => (
                  <GlassCard key={session.id} className="p-4">
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <Dumbbell className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold capitalize">{session.workoutType}</h4>
                          <p className="text-xs text-muted-foreground font-medium">{session.durationMinutes} min • {new Date(session.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-primary">+{session.xpEarned} XP</div>
                        <div className="text-xs font-bold text-yellow-500">+{session.coinsEarned} Coins</div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground font-bold">No recent sessions.</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
