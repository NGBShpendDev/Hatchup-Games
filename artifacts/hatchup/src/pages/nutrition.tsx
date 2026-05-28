import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { useToast } from "@/hooks/use-toast";
import { Heart, MessageCircle, Zap, ChefHat, Plus, X, Sparkles, Droplets, Flame, Dumbbell, MoreHorizontal, Compass, Trophy, Camera, Loader2, Target } from "lucide-react";
import { ReportBlockMenu } from "@/components/report-block-menu";
import { ErrorCard } from "@/components/error-card";
import { errorMessage } from "@/lib/errorMessage";
import { HatchlingReaction, type HatchlingReactionData } from "@/components/hatchling-reaction";
import { RewardSummaryModal, type RewardEntry } from "@/components/reward-summary-modal";
import {
  useGetNutritionSummary,
  useListNutritionPosts,
  useCreateMealPost,
  useToggleMealPostLike,
  useListMealPostComments,
  useAddMealPostComment,
  useAnalyzeMealDescription,
  useAnalyzeMealImage,
  useListNutritionChallenges,
  useIncrementNutritionChallengeProgress,
  useGetNutritionMacroTarget,
  useGetNutritionStreak,
  useUpdatePhysiqueGoal,
  getListNutritionPostsQueryKey,
  getListNutritionChallengesQueryKey,
  getGetNutritionMacroTargetQueryKey,
  getGetNutritionStreakQueryKey,
  getGetNutritionSummaryQueryKey,
  getListMealPostCommentsQueryKey,
  type NutritionWeeklySummary,
  type NutritionWeeklySummaryHatchlingMood,
  type MealPost,
  type NutritionChallenge,
  type NutritionMacroTarget,
  type NutritionStreak,
  type NutritionAnalyzeResult,
  type NutritionAnalyzeImageResult,
} from "@workspace/api-client-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const MEAL_TAGS = [
  { key: "weight-loss",    label: "Weight Loss",   color: "bg-green-500/20 text-green-400 border-green-500/40" },
  { key: "lean-bulk",      label: "Lean Bulk",     color: "bg-blue-500/20 text-blue-400 border-blue-500/40"   },
  { key: "muscle-gain",    label: "Muscle Gain",   color: "bg-red-500/20 text-red-400 border-red-500/40"     },
  { key: "keto",           label: "Keto",           color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  { key: "high-protein",   label: "High Protein",  color: "bg-orange-500/20 text-orange-400 border-orange-500/40" },
  { key: "vegan",          label: "Vegan",          color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  { key: "pre-workout",    label: "Pre-Workout",   color: "bg-purple-500/20 text-purple-400 border-purple-500/40" },
  { key: "post-workout",   label: "Post-Workout",  color: "bg-pink-500/20 text-pink-400 border-pink-500/40"  },
  { key: "cheat-meal",     label: "Cheat Meal",    color: "bg-rose-500/20 text-rose-400 border-rose-500/40"  },
  { key: "healthy-snack",  label: "Healthy Snack", color: "bg-teal-500/20 text-teal-400 border-teal-500/40"  },
];

const TAG_MAP = Object.fromEntries(MEAL_TAGS.map(t => [t.key, t]));

const PHYSIQUE_GOALS = [
  { key: "shredded",         label: "Shredded",         icon: "🔥" },
  { key: "lean_athlete",     label: "Lean Athlete",     icon: "⚡" },
  { key: "muscle_gain",      label: "Muscle Gain",      icon: "💪" },
  { key: "slim_thick",       label: "Slim Thick",       icon: "✨" },
  { key: "endurance_runner", label: "Endurance Runner", icon: "🏃" },
  { key: "weight_loss",      label: "Weight Loss",      icon: "📉" },
];

const MEAL_EMOJIS = ["🍽️","🥗","🍗","🥩","🥑","🍳","🥛","🍱","🥙","🌮","🥦","🍠","🫐","🥜","🍚","🐟","🥚","🧇","🍎","🫚"];

const MOOD_STYLES: Record<NutritionWeeklySummaryHatchlingMood, { ring: string; bg: string; label: string; tint: string }> = {
  thriving: { ring: "ring-green-500/60",  bg: "from-green-500/15 to-emerald-500/5",   label: "Thriving",    tint: "text-green-300"  },
  happy:    { ring: "ring-cyan-500/60",   bg: "from-cyan-500/15 to-blue-500/5",       label: "Happy",       tint: "text-cyan-300"   },
  okay:     { ring: "ring-yellow-500/60", bg: "from-yellow-500/15 to-amber-500/5",    label: "Doing okay",  tint: "text-yellow-300" },
  hungry:   { ring: "ring-orange-500/60", bg: "from-orange-500/15 to-red-500/5",      label: "Hungry",      tint: "text-orange-300" },
  sad:      { ring: "ring-rose-500/60",   bg: "from-rose-500/15 to-pink-500/5",       label: "Underfed",    tint: "text-rose-300"   },
};


export default function Nutrition() {
  const { playerId, player } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const pid = playerId ?? 0;

  const [activeTab, setActiveTab] = useState<"feed" | "discover" | "challenges">("feed");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [reaction, setReaction] = useState<HatchlingReactionData | null>(null);
  const [rewardSummary, setRewardSummary] = useState<{ open: boolean; entries: RewardEntry[]; title?: string }>({ open: false, entries: [] });

  // Create form state
  const [form, setForm] = useState({
    name: "",
    emoji: "🍽️",
    tag: "healthy-snack",
    description: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [aiResult, setAiResult] = useState<NutritionAnalyzeResult | null>(null);
  const [imageAiResult, setImageAiResult] = useState<NutritionAnalyzeImageResult | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadToken, setUploadToken] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: "Unsupported image", description: "Use JPG, PNG, WebP, or GIF.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image too large", description: "Max size is 8 MB.", variant: "destructive" });
      return;
    }
    setUploadingImage(true);
    const localPreview = URL.createObjectURL(file);
    setImagePreview(localPreview);
    try {
      const res = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath, uploadToken: token } = await res.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Upload failed");
      setImageUrl(objectPath);
      setUploadToken(token ?? null);
      toast({ title: "Photo added!", description: "Looking tasty." });
    } catch (err) {
      setImagePreview(null);
      setImageUrl(null);
      setUploadToken(null);
      toast({ title: "Upload failed", description: "Try a different photo.", variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearImage = () => {
    setImageUrl(null);
    setUploadToken(null);
    setImagePreview(null);
    setImageAiResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Queries ─────────────────────────────────────────────────────────────────
  const feedMode: "feed" | "discover" = activeTab === "discover" ? "discover" : "feed";
  const {
    data: feedData,
    isLoading: postsLoading,
    isError: postsError,
    refetch: refetchPosts,
  } = useListNutritionPosts(
    { limit: 30, mode: feedMode },
    { query: { enabled: !!pid && activeTab !== "challenges", queryKey: getListNutritionPostsQueryKey({ limit: 30, mode: feedMode }) } },
  );
  const posts: MealPost[] = feedData?.posts ?? [];
  const fellBackToDiscover = feedData?.fellBackToDiscover ?? false;

  const {
    data: challenges = [],
    isLoading: challengesLoading,
    isError: challengesError,
    refetch: refetchChallenges,
  } = useListNutritionChallenges({
    query: { enabled: !!pid, queryKey: getListNutritionChallengesQueryKey() },
  });

  const {
    data: macroTarget,
    isError: macroTargetError,
    refetch: refetchMacroTarget,
  } = useGetNutritionMacroTarget({
    query: { enabled: !!pid, queryKey: getGetNutritionMacroTargetQueryKey() },
  });

  const { data: weekly, isLoading: weeklyLoading } = useGetNutritionSummary({
    query: { enabled: !!pid, queryKey: getGetNutritionSummaryQueryKey() },
  });

  const {
    data: streak,
    isError: streakError,
    refetch: refetchStreak,
  } = useGetNutritionStreak({
    query: { enabled: !!pid, queryKey: getGetNutritionStreakQueryKey() },
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const likeMutation = useToggleMealPostLike({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getListNutritionPostsQueryKey({ limit: 30, mode: feedMode }) }),
      onError: (err) =>
        toast({ title: "Couldn't update like", description: errorMessage(err, "Check your connection and try again."), variant: "destructive" }),
    },
  });

  const challengeMutation = useIncrementNutritionChallengeProgress({
    mutation: {
      onError: (err) =>
        toast({ title: "Couldn't log progress", description: errorMessage(err, "Try again in a moment."), variant: "destructive" }),
      onSuccess: (data, variables) => {
        qc.invalidateQueries({ queryKey: getListNutritionChallengesQueryKey() });
        const entries: RewardEntry[] = [
          {
            kind: "challenge",
            label: "Challenge progress",
            value: `${data.currentValue}/${data.target}`,
            detail: `${variables.key.replace(/_/g, " ")}`,
          },
        ];
        if (data.isComplete) {
          entries.push({ kind: "challenge", label: "Badge unlocked!", detail: "Check your collection." });
        }
        setRewardSummary({ open: true, entries, title: data.isComplete ? "Challenge Complete!" : "Progress Logged" });
      },
    },
  });

  const goalMutation = useUpdatePhysiqueGoal({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetNutritionMacroTargetQueryKey() });
        setShowGoalPicker(false);
        toast({ title: "Goal updated!", description: "Your macro targets have been updated." });
      },
      onError: (err) =>
        toast({ title: "Couldn't update goal", description: errorMessage(err, "Try again in a moment."), variant: "destructive" }),
    },
  });

  const postMutation = useCreateMealPost({
    mutation: {
      onError: (err) =>
        toast({ title: "Couldn't post meal", description: errorMessage(err, "Check your connection and try again."), variant: "destructive" }),
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListNutritionPostsQueryKey({ limit: 30, mode: feedMode }) });
        qc.invalidateQueries({ queryKey: getGetNutritionSummaryQueryKey() });
        qc.invalidateQueries({ queryKey: getGetNutritionStreakQueryKey() });
      // Refresh hatchling stats since nutrition can buff/debuff the active Hatchling.
      // Generated query keys are arrays starting with "/api/hatchlings" (list) or
      // "/api/hatchlings/:id" (detail) — match either by prefix.
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/hatchlings"),
      });
      setShowCreateSheet(false);
      setForm({ name: "", emoji: "🍽️", tag: "healthy-snack", description: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
      setAiResult(null);
      setImageAiResult(null);
      setImageUrl(null);
      setUploadToken(null);
      setImagePreview(null);
      const c = data.hatchlingStatChange;
      if (c && ((c.happinessDelta ?? 0) !== 0 || (c.energyDelta ?? 0) !== 0)) {
        setReaction({
          hatchlingName: c.hatchlingName,
          happinessDelta: c.happinessDelta ?? 0,
          energyDelta: c.energyDelta ?? 0,
        });
      }

      // Build a unified reward summary so meal logging visibly reinforces the
      // same celebratory loop used by Home (activity) and Battle (wins).
      const entries: RewardEntry[] = [];
      entries.push({
        kind: "xp",
        label: "Meal logged",
        detail: data.name ? `"${data.name}" added to your feed.` : "Added to your feed.",
      });
      if (c) {
        if ((c.happinessDelta ?? 0) !== 0) {
          entries.push({
            kind: "hatchling",
            label: `${c.hatchlingName} happiness`,
            value: (c.happinessDelta > 0 ? "+" : "") + c.happinessDelta,
            detail: c.happinessDelta > 0 ? "Quality fuel — your Pal is thriving." : "Lower-quality fuel hurt your Pal.",
          });
        }
        if ((c.energyDelta ?? 0) !== 0) {
          entries.push({
            kind: "hatchling",
            label: `${c.hatchlingName} energy`,
            value: (c.energyDelta > 0 ? "+" : "") + c.energyDelta,
          });
        }
      }
      for (const badgeKey of (data.newBadges ?? []) as string[]) {
        entries.push({ kind: "challenge", label: `Badge: ${badgeKey}`, detail: "Nutrition milestone unlocked." });
      }
      if (data.dailyMacroReward) {
        const dmr = data.dailyMacroReward;
        entries.push({
          kind: "streak",
          label: `Daily macros hit — ${dmr.currentStreak}-day streak`,
          value: dmr.currentStreak,
          detail: "Macros target met for the day.",
        });
        if (dmr.playerXpDelta) entries.push({ kind: "xp", label: "Macro bonus XP", value: dmr.playerXpDelta });
        if (dmr.playerCoinsDelta) entries.push({ kind: "artifact", label: "Macro bonus coins", value: dmr.playerCoinsDelta });
        if (dmr.hatchlingReward) {
          entries.push({
            kind: "hatchling",
            label: `${dmr.hatchlingReward.hatchlingName} bond`,
            value: `+${dmr.hatchlingReward.bondDelta}`,
          });
        }
      }
      setRewardSummary({ open: true, entries, title: "Meal Rewards" });
      },
    },
  });

  const analyzeMutation = useAnalyzeMealDescription();
  const analyzeImageMutation = useAnalyzeMealImage();

  const handleAnalyzeImage = async () => {
    if (!imageUrl || !uploadToken) return;
    setAnalyzingImage(true);
    try {
      const data = await analyzeImageMutation.mutateAsync({ data: { imageUrl, uploadToken } });
      setImageAiResult(data);
      if (!data.recognized) {
        toast({
          title: "Couldn't identify the meal",
          description: data.description ?? "Try a clearer photo or fill in the macros manually.",
          variant: "destructive",
        });
        return;
      }
      setForm(f => ({
        ...f,
        name:        f.name || (data.food_name ?? f.name),
        description: f.description || (data.description ?? f.description),
        calories: data.calories != null ? String(data.calories) : f.calories,
        proteinG: data.protein_g != null ? String(data.protein_g) : f.proteinG,
        carbsG:   data.carbs_g   != null ? String(data.carbs_g)   : f.carbsG,
        fatG:     data.fat_g     != null ? String(data.fat_g)     : f.fatG,
      }));
      toast({
        title: "Photo analyzed!",
        description: data.food_name
          ? `${data.food_name} · ${data.quality_score ?? "?"}/10 quality`
          : `Quality score: ${data.quality_score ?? "?"}/10`,
      });
    } catch (err) {
      toast({ title: "Photo analysis failed", description: errorMessage(err, "Try again in a moment."), variant: "destructive" });
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handleAnalyze = async () => {
    if (!form.description) return;
    setAnalyzing(true);
    try {
      const data = await analyzeMutation.mutateAsync({ data: { description: form.description } });
      setForm(f => ({
        ...f,
        calories: data.calories != null ? String(data.calories) : f.calories,
        proteinG: data.protein_g != null ? String(data.protein_g) : f.proteinG,
        carbsG:   data.carbs_g   != null ? String(data.carbs_g)   : f.carbsG,
        fatG:     data.fat_g     != null ? String(data.fat_g)     : f.fatG,
      }));
      setAiResult(data);
      toast({ title: "AI Analysis complete!", description: `Quality score: ${data.quality_score ?? "?"}/10` });
    } catch (err) {
      toast({ title: "Analysis failed", description: errorMessage(err, "Try again in a moment."), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const goalLabel = PHYSIQUE_GOALS.find(g => g.key === macroTarget?.goal)?.label ?? macroTarget?.goal ?? "Lean Athlete";
  const goalIcon  = PHYSIQUE_GOALS.find(g => g.key === macroTarget?.goal)?.icon ?? "⚡";

  return (
    <Layout>
      <div className="max-w-lg mx-auto pb-24">
        {/* Header */}
        <div className="pt-4 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <ChefHat className="w-6 h-6 text-primary" /> Nutrition Feed
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Share meals · Track macros · Earn badges</p>
          </div>
          <button
            onClick={() => setShowCreateSheet(true)}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40 active:scale-95 transition-transform"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Macro Target Banner */}
        {macroTargetError && !macroTarget && (
          <ErrorCard
            title="Couldn't load your macro targets"
            onRetry={() => refetchMacroTarget()}
            className="mb-4"
          />
        )}
        {macroTarget && (
          <GlassCard glow="primary" className="p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{goalIcon}</span>
                <div>
                  <p className="font-black text-sm">Daily Target · {goalLabel}</p>
                  <p className="text-[11px] text-muted-foreground">{macroTarget.tip}</p>
                </div>
              </div>
              <button onClick={() => setShowGoalPicker(true)} className="text-xs text-primary font-bold hover:underline">
                Change
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                { label: "Cals", val: macroTarget.calories, actual: streak?.today.totals.calories ?? 0, target: macroTarget.calories, icon: <Flame className="w-3 h-3" />, color: "text-orange-400" },
                { label: "Protein", val: `${macroTarget.protein}g`, actual: streak?.today.totals.protein ?? 0, target: macroTarget.protein, icon: <Dumbbell className="w-3 h-3" />, color: "text-red-400" },
                { label: "Carbs",   val: `${macroTarget.carbs}g`,   actual: streak?.today.totals.carbs ?? 0, target: macroTarget.carbs, icon: <Zap className="w-3 h-3" />,      color: "text-yellow-400" },
                { label: "Fat",     val: `${macroTarget.fat}g`,     actual: streak?.today.totals.fat ?? 0, target: macroTarget.fat, icon: <Droplets className="w-3 h-3" />, color: "text-blue-400" },
              ].map(m => {
                const tol = streak?.today.tolerance ?? 0.10;
                const ratio = m.target > 0 ? m.actual / m.target : 0;
                const onTarget = ratio >= 1 - tol && ratio <= 1 + tol;
                return (
                  <div key={m.label} className={`rounded-xl p-2 text-center ${onTarget ? "bg-green-500/15 ring-1 ring-green-500/40" : "bg-muted/30"}`}>
                    <div className={`flex justify-center mb-1 ${m.color}`}>{m.icon}</div>
                    <p className="font-black text-sm">{Math.round(m.actual)}<span className="text-[9px] text-muted-foreground">/{m.val}</span></p>
                    <p className="text-[9px] text-muted-foreground font-bold uppercase">{m.label}</p>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Weekly Summary Card */}
        {weeklyLoading ? (
          <Skeleton className="h-40 rounded-2xl mb-4" />
        ) : weekly ? (
          <WeeklySummaryCard summary={weekly} />
        ) : null}

        {/* Today progress strip — how today specifically is shaping up */}
        {streakError && !streak && (
          <ErrorCard
            title="Couldn't load today's progress"
            onRetry={() => refetchStreak()}
            className="mb-4"
          />
        )}
        {streak && <TodayProgressStrip today={streak.today} />}

        {/* Daily macro-target streak */}
        {streak && (
          <div className={`rounded-2xl border p-3 mb-4 flex items-center justify-between ${
            streak.hitToday
              ? "border-green-500/40 bg-gradient-to-r from-green-500/15 to-emerald-500/10"
              : streak.currentStreak > 0
                ? "border-orange-500/40 bg-gradient-to-r from-orange-500/15 to-amber-500/10"
                : "border-border bg-card"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${streak.hitToday ? "bg-green-500/30" : streak.currentStreak > 0 ? "bg-orange-500/30" : "bg-muted/40"}`}>
                <Target className={`w-5 h-5 ${streak.hitToday ? "text-green-300" : streak.currentStreak > 0 ? "text-orange-300" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="font-black text-sm flex items-center gap-1.5">
                  {streak.currentStreak > 0 ? `🔥 ${streak.currentStreak}-Day Macro Streak` : "Macro Streak"}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium">
                  {streak.hitToday
                    ? "All four macros hit today — Hatchling bonus claimed."
                    : streak.currentStreak > 0
                      ? "Hit all four macros today to keep your streak alive."
                      : "Hit all four macros within ±10% to start a streak."}
                </p>
              </div>
            </div>
            {streak.longestStreak > 0 && (
              <div className="text-right">
                <p className="text-[9px] uppercase font-bold text-muted-foreground">Best</p>
                <p className="font-black text-sm">{streak.longestStreak}d</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/30 rounded-xl p-1 mb-4">
          {([
            { key: "feed",       label: "Feed",      icon: <ChefHat className="w-3.5 h-3.5" /> },
            { key: "discover",   label: "Discover",  icon: <Compass className="w-3.5 h-3.5" /> },
            { key: "challenges", label: "Challenges", icon: <Trophy className="w-3.5 h-3.5" /> },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.key ? "bg-primary text-white shadow" : "text-muted-foreground"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Discover-mode banner */}
        {activeTab === "discover" && (
          <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-3 py-2 mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <p className="text-[11px] font-bold text-purple-300">Trending meals from the community — sorted by likes.</p>
          </div>
        )}

        {/* Auto-fallback banner: feed empty → showing discover */}
        {activeTab === "feed" && fellBackToDiscover && (
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 px-3 py-2 mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <p className="text-[11px] font-bold text-cyan-300">No follows yet — showing trending meals from the community.</p>
          </div>
        )}

        {/* ── FEED + DISCOVER TABS ── */}
        {(activeTab === "feed" || activeTab === "discover") && (
          <div className="space-y-4">
            {postsError && posts.length === 0 ? (
              <ErrorCard
                title="Couldn't load the nutrition feed"
                onRetry={() => refetchPosts()}
              />
            ) : postsLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)
              : posts.length === 0
                ? (
                  <div className="text-center py-16">
                    <div className="text-5xl mb-4">🍽️</div>
                    <p className="font-black text-lg mb-1">No meals yet</p>
                    <p className="text-muted-foreground text-sm">Be the first to post a meal!</p>
                    <NeonButton onClick={() => setShowCreateSheet(true)} variant="primary" size="md" className="mt-4">
                      Post a Meal
                    </NeonButton>
                  </div>
                )
                : posts.map((post, i) => (
                  <MealCard key={post.id} post={post} index={i} onLike={() => likeMutation.mutate({ id: post.id })} />
                ))
            }
          </div>
        )}

        {/* ── CHALLENGES TAB ── */}
        {activeTab === "challenges" && (
          <div className="space-y-4">
            {challengesError && challenges.length === 0 ? (
              <ErrorCard
                title="Couldn't load challenges"
                onRetry={() => refetchChallenges()}
              />
            ) : challengesLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
              : challenges.map((c, i) => {
                const progress = Math.min(100, Math.round((c.currentValue / c.target) * 100));
                const done = c.completedAt != null;
                return (
                  <motion.div
                    key={c.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`rounded-2xl border p-4 ${done ? "border-green-500/40 bg-green-500/5" : "border-border bg-card"}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{c.icon}</span>
                        <div>
                          <p className="font-black text-sm">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.description}</p>
                        </div>
                      </div>
                      {done
                        ? <span className="text-green-400 text-xs font-black">✓ Done!</span>
                        : <span className="text-xs text-primary font-black">+{c.xpReward} XP</span>
                      }
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-muted-foreground">
                        <span>{c.currentValue} / {c.target} {c.unit}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${done ? "bg-green-500" : "bg-gradient-to-r from-primary to-purple-600"}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.6 }}
                        />
                      </div>
                    </div>
                    {!done && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full text-xs font-black"
                        onClick={() => challengeMutation.mutate({ key: c.key, data: { playerId: pid, increment: 1 } })}
                        disabled={challengeMutation.isPending}
                      >
                        Log Progress +1
                      </Button>
                    )}
                  </motion.div>
                );
              })
            }
          </div>
        )}
      </div>

      {/* Hatchling reaction overlay — plays when a posted meal buffs/debuffs the active Pal */}
      <HatchlingReaction reaction={reaction} onDismiss={() => setReaction(null)} />

      {/* Unified reward summary — every meal log and challenge step funnels through here */}
      <RewardSummaryModal
        open={rewardSummary.open}
        onClose={() => setRewardSummary({ open: false, entries: [] })}
        title={rewardSummary.title ?? "Reward Summary"}
        rewards={rewardSummary.entries}
      />

      {/* ── CREATE POST SHEET ── */}
      <AnimatePresence>
        {showCreateSheet && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateSheet(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border-t border-border max-h-[90vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <div className="p-5 space-y-4 pb-safe-bottom pb-8">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg">Post a Meal</h2>
                  <button onClick={() => setShowCreateSheet(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Emoji picker */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-2">Pick an emoji</p>
                  <div className="flex flex-wrap gap-2">
                    {MEAL_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => setForm(f => ({ ...f, emoji: e }))}
                        className={`text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-all ${form.emoji === e ? "bg-primary/30 ring-2 ring-primary" : "bg-muted/40 hover:bg-muted"}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Meal name */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-1">Meal name *</p>
                  <input
                    type="text"
                    placeholder="e.g. Grilled chicken rice bowl"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-muted/40 border border-border rounded-xl px-4 py-2.5 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Photo upload */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-2">Photo</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImagePick}
                    className="hidden"
                  />
                  {imagePreview ? (
                    <div className="space-y-2">
                      <div className="relative rounded-2xl overflow-hidden border border-border bg-muted/40">
                        <img src={imagePreview} alt="Meal preview" className="w-full h-48 object-cover" />
                        {(uploadingImage || analyzingImage) && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                            {analyzingImage && <span className="text-xs font-bold text-white">Analyzing photo...</span>}
                          </div>
                        )}
                        <button
                          onClick={clearImage}
                          disabled={uploadingImage || analyzingImage}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 disabled:opacity-50"
                          aria-label="Remove photo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {imageUrl && !uploadingImage && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-purple-400 border-purple-500/40 hover:bg-purple-500/10 text-xs font-black"
                          onClick={handleAnalyzeImage}
                          disabled={analyzingImage}
                        >
                          {analyzingImage ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing photo...</>
                          ) : (
                            <><Sparkles className="w-3 h-3 mr-1" /> {imageAiResult ? "Re-analyze photo" : "Analyze photo with AI"}</>
                          )}
                        </Button>
                      )}
                      {imageAiResult && (
                        <div className={`rounded-xl border px-3 py-2 text-[11px] ${
                          imageAiResult.recognized
                            ? "border-purple-500/30 bg-purple-500/5 text-purple-200"
                            : "border-yellow-500/30 bg-yellow-500/5 text-yellow-200"
                        }`}>
                          {imageAiResult.recognized ? (
                            <>
                              <span className="font-black">{imageAiResult.food_name ?? "Meal"}</span>
                              {imageAiResult.quality_score != null && (
                                <span className="ml-1 opacity-80">· {imageAiResult.quality_score}/10 quality</span>
                              )}
                              {imageAiResult.suggestions?.length ? (
                                <p className="mt-1 opacity-80">{imageAiResult.suggestions.join(" · ")}</p>
                              ) : null}
                            </>
                          ) : (
                            <span>{imageAiResult.description ?? "Couldn't identify the meal — fill the macros in manually."}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="w-full h-32 rounded-2xl border-2 border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground"
                    >
                      {uploadingImage ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span className="text-xs font-bold">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-6 h-6" />
                          <span className="text-xs font-bold">Add a real food photo</span>
                          <span className="text-[10px]">JPG, PNG, WebP, GIF · max 8 MB</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Tag selector */}
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-2">Tag</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {MEAL_TAGS.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setForm(f => ({ ...f, tag: t.key }))}
                        className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                          form.tag === t.key ? t.color + " ring-1 ring-current" : "bg-muted/30 border-border text-muted-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Analyze */}
                <div className="bg-muted/20 rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <p className="text-xs font-black text-purple-400">AI Macro Analysis</p>
                  </div>
                  <textarea
                    placeholder='Describe your meal: e.g. "200g chicken breast, 150g rice, broccoli, olive oil"'
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-purple-400 border-purple-500/40 hover:bg-purple-500/10 text-xs font-black"
                    onClick={handleAnalyze}
                    disabled={analyzing || !form.description}
                  >
                    {analyzing ? "Analyzing..." : "✨ AI Analyze"}
                  </Button>
                  {aiResult?.quality_score != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-bold">Quality score:</span>
                      <span className={`text-sm font-black ${aiResult.quality_score >= 7 ? "text-green-400" : aiResult.quality_score >= 5 ? "text-yellow-400" : "text-red-400"}`}>
                        {aiResult.quality_score}/10
                      </span>
                      {aiResult.suggestions?.map((s, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground">· {s}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Macro fields */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "calories", label: "Calories", placeholder: "kcal" },
                    { key: "proteinG", label: "Protein (g)", placeholder: "g" },
                    { key: "carbsG",   label: "Carbs (g)",   placeholder: "g" },
                    { key: "fatG",     label: "Fat (g)",     placeholder: "g" },
                  ].map(f => (
                    <div key={f.key}>
                      <p className="text-[10px] font-bold text-muted-foreground mb-1">{f.label}</p>
                      <input
                        type="number"
                        placeholder={f.placeholder}
                        value={form[f.key as keyof typeof form]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full font-black bg-primary h-12"
                  onClick={() => postMutation.mutate({ data: {
                    playerId: pid,
                    name: form.name,
                    emoji: form.emoji,
                    tag: form.tag,
                    description: form.description || undefined,
                    imageUrl: imageUrl ?? undefined,
                    uploadToken: uploadToken ?? undefined,
                    calories: form.calories ? Number(form.calories) : undefined,
                    proteinG: form.proteinG ? Number(form.proteinG) : undefined,
                    carbsG: form.carbsG ? Number(form.carbsG) : undefined,
                    fatG: form.fatG ? Number(form.fatG) : undefined,
                    aiAnalyzed: !!aiResult,
                    qualityScore: aiResult?.quality_score,
                  } })}
                  disabled={!form.name || postMutation.isPending}
                >
                  {postMutation.isPending ? "Posting..." : "Post Meal 🍽️"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── GOAL PICKER ── */}
      <AnimatePresence>
        {showGoalPicker && (
          <>
            <motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGoalPicker(false)} />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border-t border-border p-5 pb-10"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-lg">Your Physique Goal</h2>
                <button onClick={() => setShowGoalPicker(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Choose your goal to get a daily macro target tailored for you.</p>
              <div className="grid grid-cols-2 gap-3">
                {PHYSIQUE_GOALS.map(g => (
                  <button
                    key={g.key}
                    onClick={() => goalMutation.mutate({ data: { playerId: pid, physiqueGoal: g.key } })}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      macroTarget?.goal === g.key ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-2xl mb-1">{g.icon}</div>
                    <p className="font-black text-sm">{g.label}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}

function TodayProgressStrip({ today }: { today: NutritionStreak["today"] }) {
  const macros = [
    { key: "calories", label: "Cals",    actual: today.totals.calories, target: today.target.calories, color: "from-orange-500 to-red-500",   text: "text-orange-300", suffix: "" },
    { key: "protein",  label: "Protein", actual: today.totals.protein,  target: today.target.protein,  color: "from-red-500 to-pink-500",     text: "text-red-300",    suffix: "g" },
    { key: "carbs",    label: "Carbs",   actual: today.totals.carbs,    target: today.target.carbs,    color: "from-yellow-500 to-amber-500", text: "text-yellow-300", suffix: "g" },
    { key: "fat",      label: "Fat",     actual: today.totals.fat,      target: today.target.fat,      color: "from-blue-500 to-indigo-500",  text: "text-blue-300",   suffix: "g" },
  ];

  const tol = today.tolerance;
  const statuses = macros.map(m => {
    if (m.target <= 0) return "pending" as const;
    const ratio = m.actual / m.target;
    if (ratio >= 1 - tol && ratio <= 1 + tol) return "on" as const;
    if (ratio > 1 + tol) return "over" as const;
    if (ratio >= 0.5) return "close" as const;
    return "low" as const;
  });

  const totalCals = today.totals.calories;
  const onCount = statuses.filter(s => s === "on").length;
  const overCount = statuses.filter(s => s === "over").length;

  let headlineEmoji = "🌱";
  let headlineLabel = "Just getting started";
  let headlineTint = "text-muted-foreground";
  let ringClass = "ring-border";
  let bgClass = "from-muted/20 to-muted/5";

  if (totalCals <= 0) {
    headlineEmoji = "🌱";
    headlineLabel = "No meals logged yet today";
  } else if (onCount === 4) {
    headlineEmoji = "🔥";
    headlineLabel = "All four macros on target";
    headlineTint = "text-green-300";
    ringClass = "ring-green-500/40";
    bgClass = "from-green-500/15 to-emerald-500/5";
  } else if (onCount >= 2) {
    headlineEmoji = "💪";
    headlineLabel = `${onCount}/4 macros on track`;
    headlineTint = "text-cyan-300";
    ringClass = "ring-cyan-500/40";
    bgClass = "from-cyan-500/15 to-blue-500/5";
  } else if (overCount > 0) {
    headlineEmoji = "⚠️";
    headlineLabel = "Easing off — some macros over target";
    headlineTint = "text-orange-300";
    ringClass = "ring-orange-500/40";
    bgClass = "from-orange-500/15 to-amber-500/5";
  } else {
    headlineEmoji = "🍽️";
    headlineLabel = "Keep eating to hit your targets";
    headlineTint = "text-yellow-300";
    ringClass = "ring-yellow-500/40";
    bgClass = "from-yellow-500/15 to-amber-500/5";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-border bg-gradient-to-br ${bgClass} ring-1 ${ringClass} p-4 mb-4`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Today</p>
          <p className={`font-black text-sm ${headlineTint}`}>{headlineEmoji} {headlineLabel}</p>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground">
          {Math.round(totalCals)} / {today.target.calories} kcal
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {macros.map((m, i) => {
          const status = statuses[i]!;
          const pct = m.target > 0 ? Math.min(100, Math.round((m.actual / m.target) * 100)) : 0;
          const statusEmoji = status === "on" ? "✅" : status === "over" ? "⚠️" : status === "close" ? "🟡" : status === "low" ? "·" : "·";
          const cellBg =
            status === "on"    ? "bg-green-500/15 ring-1 ring-green-500/40" :
            status === "over"  ? "bg-orange-500/15 ring-1 ring-orange-500/40" :
            "bg-black/20";
          return (
            <div key={m.key} className={`rounded-xl p-2 ${cellBg}`}>
              <div className="flex items-baseline justify-between">
                <p className={`font-black text-sm ${m.text}`}>{Math.round(m.actual)}{m.suffix}</p>
                <p className="text-[9px] text-muted-foreground font-bold">/{m.target}{m.suffix}</p>
              </div>
              <div className="h-1.5 bg-muted/40 rounded-full mt-1 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${m.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground font-bold uppercase mt-1 flex items-center justify-between">
                <span>{m.label}</span>
                <span aria-hidden="true">{statusEmoji}</span>
              </p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function WeeklySummaryCard({ summary }: { summary: NutritionWeeklySummary }) {
  const mood = MOOD_STYLES[summary.hatchlingMood];
  const macros = [
    { key: "calories", label: "Cals",    actual: summary.averages.calories, target: summary.targets.calories, color: "from-orange-500 to-red-500",  text: "text-orange-300", suffix: "" },
    { key: "protein",  label: "Protein", actual: summary.averages.protein,  target: summary.targets.protein,  color: "from-red-500 to-pink-500",    text: "text-red-300",    suffix: "g" },
    { key: "carbs",    label: "Carbs",   actual: summary.averages.carbs,    target: summary.targets.carbs,    color: "from-yellow-500 to-amber-500", text: "text-yellow-300", suffix: "g" },
    { key: "fat",      label: "Fat",     actual: summary.averages.fat,      target: summary.targets.fat,      color: "from-blue-500 to-indigo-500", text: "text-blue-300",   suffix: "g" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-border bg-gradient-to-br ${mood.bg} ring-1 ${mood.ring} p-4 mb-4`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">This Week</p>
          <p className="font-black text-base">{summary.daysLogged}/7 days logged · {summary.mealsLogged} meals</p>
        </div>
        <div className="flex flex-col items-center">
          <motion.div
            key={summary.hatchlingEmoji}
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="text-4xl"
          >
            {summary.hatchlingEmoji}
          </motion.div>
          <p className={`text-[10px] font-black uppercase mt-0.5 ${mood.tint}`}>{mood.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {macros.map(m => {
          const pct = m.target > 0 ? Math.min(100, Math.round((m.actual / m.target) * 100)) : 0;
          return (
            <div key={m.key} className="bg-black/20 rounded-xl p-2">
              <div className="flex items-baseline justify-between">
                <p className={`font-black text-sm ${m.text}`}>{m.actual}{m.suffix}</p>
                <p className="text-[9px] text-muted-foreground font-bold">/{m.target}{m.suffix}</p>
              </div>
              <div className="h-1.5 bg-muted/40 rounded-full mt-1 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${m.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground font-bold uppercase mt-1">{m.label}</p>
            </div>
          );
        })}
      </div>

      {summary.topFoods.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Top foods</p>
          <div className="flex gap-1.5 flex-wrap">
            {summary.topFoods.map(f => (
              <span key={f.name} className="inline-flex items-center gap-1 text-[11px] font-bold bg-muted/40 rounded-full px-2 py-0.5">
                <span>{f.emoji}</span>
                <span className="truncate max-w-[100px]">{f.name}</span>
                {f.count > 1 && <span className="text-muted-foreground">×{f.count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-black/30 border border-purple-500/30 px-3 py-2 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-300">
            {summary.aiSource === "ai" ? "AI Coach Tip" : "Coach Tip"}
          </p>
          <p className="text-xs font-medium text-foreground/90 mt-0.5">{summary.aiTip}</p>
        </div>
      </div>
    </motion.div>
  );
}

function MealCard({ post, index, onLike }: { post: MealPost; index: number; onLike: () => void }) {
  const tag = TAG_MAP[post.tag];
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const { playerId } = usePlayer();
  const { toast } = useToast();
  const pid = playerId ?? 0;

  const {
    data: comments = [],
    refetch,
    isError: commentsError,
    isLoading: commentsLoading,
  } = useListMealPostComments(post.id, {
    query: { enabled: showComments, queryKey: getListMealPostCommentsQueryKey(post.id) },
  });

  const addCommentMutation = useAddMealPostComment();

  const addComment = async () => {
    if (!newComment.trim()) return;
    try {
      await addCommentMutation.mutateAsync({ id: post.id, data: { content: newComment } });
      setNewComment("");
      refetch();
    } catch (err) {
      toast({ title: "Couldn't post comment", description: errorMessage(err, "Try again in a moment."), variant: "destructive" });
    }
  };

  const isOwnPost = post.playerId === pid;
  const authorName = post.author.displayName ?? post.author.username;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Post header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-black text-primary">
          {authorName?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm truncate">{authorName}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(post.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {tag && (
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tag.color}`}>{tag.label}</span>
        )}
        {!isOwnPost && (
          <ReportBlockMenu
            targetPlayerId={post.playerId}
            targetName={authorName}
            contentType="meal_post"
            contentId={post.id}
            trigger={
              <button className="text-muted-foreground hover:text-foreground p-1 -mr-1" aria-label="Report or block">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
          />
        )}
      </div>

      {/* Real food photo (if uploaded) */}
      {post.imageUrl && (
        <div className="px-4 pb-3">
          <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-muted/40">
            <img
              src={`${BASE}/api/storage${post.imageUrl}`}
              alt={post.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Emoji + meal info */}
      <div className="px-4 pb-3 flex items-center gap-4">
        {!post.imageUrl && (
          <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center text-4xl shrink-0">
            {post.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-black text-base truncate">{post.name}</p>
          {(post.proteinG || post.carbsG || post.fatG) && (
            <div className="flex gap-3 mt-1 flex-wrap">
              {post.proteinG   != null && <span className="text-[11px] font-bold text-red-400">P {post.proteinG}g</span>}
              {post.carbsG     != null && <span className="text-[11px] font-bold text-yellow-400">C {post.carbsG}g</span>}
              {post.fatG       != null && <span className="text-[11px] font-bold text-blue-400">F {post.fatG}g</span>}
              {post.calories   != null && <span className="text-[11px] font-bold text-muted-foreground">{post.calories} kcal</span>}
            </div>
          )}
          {post.aiAnalyzed && (
            <span className="text-[10px] text-purple-400 font-bold flex items-center gap-1 mt-1">
              <Sparkles className="w-2.5 h-2.5" /> AI analyzed
            </span>
          )}
        </div>
      </div>

      {/* Like / comment */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border">
        <button onClick={onLike} className="flex items-center gap-1.5 text-sm font-bold group">
          <Heart className={`w-4 h-4 transition-all ${post.liked ? "fill-red-500 text-red-500" : "text-muted-foreground group-hover:text-red-400"}`} />
          <span className={post.liked ? "text-red-400" : "text-muted-foreground"}>{post.likesCount}</span>
        </button>
        <button onClick={() => setShowComments(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
          <MessageCircle className="w-4 h-4" />
          <span>{post.commentsCount}</span>
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
              {commentsError && comments.length === 0 ? (
                <ErrorCard
                  title="Couldn't load comments"
                  onRetry={() => refetch()}
                />
              ) : commentsLoading && comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Loading comments…</p>
              ) : comments.length === 0
                ? <p className="text-xs text-muted-foreground">No comments yet. Be first!</p>
                : comments.map((c: any) => (
                  <div key={c.id} className="flex gap-2 text-xs">
                    <span className="font-black text-primary shrink-0">{c.author?.displayName ?? c.author?.username}</span>
                    <span className="text-muted-foreground">{c.content}</span>
                  </div>
                ))
              }
            </div>
            <div className="flex gap-2 px-4 pb-3">
              <input
                type="text"
                placeholder="Add a comment..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addComment()}
                className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={addComment} className="text-primary font-black text-xs px-2">Post</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
