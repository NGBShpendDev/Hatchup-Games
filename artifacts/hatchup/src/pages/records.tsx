import { usePlayer } from "@/lib/playerContext";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Dumbbell, Zap, TrendingUp, Award } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface PersonalRecord {
  id: number;
  playerId: number;
  activityType: string;
  metric: string;
  value: number;
  achievedAt: string;
  isNew?: boolean;
}

interface StrengthTotals {
  totalReps: number;
  lifetimePushups: number;
  lifetimeSquats: number;
  lifetimeBurpees: number;
  lifetimePullups: number;
  lifetimePlanks: number;
  lifetimeSitups: number;
}

interface PlayerRecordsResult {
  personalRecords: PersonalRecord[];
  strengthTotals: StrengthTotals;
  monthlyRunMiles: number;
}

const REP_MILESTONES = [
  { label: "Rep Starter",  threshold: 1_000,   icon: "💪", tier: "Common"    },
  { label: "Rep Machine",  threshold: 10_000,  icon: "🦾", tier: "Rare"      },
  { label: "Iron Body",    threshold: 50_000,  icon: "🏗️", tier: "Epic"      },
  { label: "Rep God",      threshold: 100_000, icon: "🗿", tier: "Legendary" },
];

const EXERCISE_LABELS: Record<string, { label: string; icon: string; unit: string }> = {
  pushups: { label: "Pushups",   icon: "💥", unit: "reps" },
  squats:  { label: "Squats",    icon: "🏋️", unit: "reps" },
  burpees: { label: "Burpees",   icon: "🔥", unit: "reps" },
  pullups: { label: "Pull-ups",  icon: "⚙️", unit: "reps" },
  planks:  { label: "Planks",    icon: "🧱", unit: "reps" },
  situps:  { label: "Sit-ups",   icon: "🌀", unit: "reps" },
  running: { label: "Best Run",  icon: "🚀", unit: "reps" },
};

const TIER_COLORS: Record<string, string> = {
  Common:    "bg-muted text-muted-foreground",
  Rare:      "bg-blue-500/20 text-blue-400",
  Epic:      "bg-purple-500/20 text-purple-400",
  Legendary: "bg-yellow-500/20 text-yellow-400",
};

function formatRelativeDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Records() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;

  const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const { data, isLoading } = useQuery<PlayerRecordsResult>({
    queryKey: ["player-records", pid],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/records/${pid}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load records");
      return res.json();
    },
    enabled: !!playerId,
  });

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  const records = data?.personalRecords ?? [];
  const totals = data?.strengthTotals;
  const totalReps = totals?.totalReps ?? 0;

  // Group PRs by activity type
  const prMap: Record<string, PersonalRecord> = {};
  for (const r of records) {
    prMap[r.activityType] = r;
  }

  // Determine next milestone
  const nextMilestone = REP_MILESTONES.find(m => totalReps < m.threshold);
  const currentMilestone = [...REP_MILESTONES].reverse().find(m => totalReps >= m.threshold);
  const milestoneProgress = nextMilestone
    ? Math.min(100, Math.round((totalReps / nextMilestone.threshold) * 100))
    : 100;

  const exerciseRows = [
    { key: "pushups",  lifetime: totals?.lifetimePushups ?? 0 },
    { key: "squats",   lifetime: totals?.lifetimeSquats  ?? 0 },
    { key: "burpees",  lifetime: totals?.lifetimeBurpees ?? 0 },
    { key: "pullups",  lifetime: totals?.lifetimePullups ?? 0 },
    { key: "planks",   lifetime: totals?.lifetimePlanks  ?? 0 },
    { key: "situps",   lifetime: totals?.lifetimeSitups  ?? 0 },
  ];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 pb-16">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Trophy className="w-7 h-7 text-yellow-500" /> Personal Records
          </h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Your all-time best performance stats</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Total Reps Milestone Progress */}
            <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-lg flex items-center gap-2">
                  <Dumbbell className="w-5 h-5 text-primary" /> Rep Milestones
                </h2>
                <span className="text-2xl font-black text-primary">{totalReps.toLocaleString()}</span>
              </div>

              {/* Milestone chips */}
              <div className="flex gap-2 flex-wrap">
                {REP_MILESTONES.map(m => {
                  const unlocked = totalReps >= m.threshold;
                  return (
                    <div key={m.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                      unlocked
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-muted/50 border-border text-muted-foreground"
                    }`}>
                      <span>{m.icon}</span>
                      {m.label}
                      {unlocked && <span className="text-green-400">✓</span>}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar to next milestone */}
              {nextMilestone && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-muted-foreground">
                    <span>Progress to {nextMilestone.label}</span>
                    <span>{totalReps.toLocaleString()} / {nextMilestone.threshold.toLocaleString()}</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-purple-600 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${milestoneProgress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Per-Exercise PRs */}
            <section className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-black text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" /> Session PRs
                </h2>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">Best single-session rep count per exercise</p>
              </div>
              <div className="divide-y divide-border">
                {exerciseRows.map(({ key, lifetime }, i) => {
                  const info = EXERCISE_LABELS[key];
                  const pr = prMap[key];
                  const isRecent = pr && (Date.now() - new Date(pr.achievedAt).getTime()) < TWENTY_FOUR_HOURS_MS;

                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-4 px-5 py-3.5"
                    >
                      <span className="text-xl w-8 text-center">{info?.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{info?.label}</span>
                          {isRecent && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-yellow-500/20 text-yellow-400 border-yellow-500/40 font-black animate-pulse">
                              NEW PR! 🏆
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground font-medium">
                          Lifetime: {lifetime.toLocaleString()} reps
                        </span>
                      </div>
                      <div className="text-right">
                        {pr ? (
                          <>
                            <p className="font-black text-xl text-primary">{pr.value.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">{formatRelativeDate(pr.achievedAt)}</p>
                          </>
                        ) : (
                          <p className="text-muted-foreground text-sm font-medium">—</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* Lifetime Totals Summary */}
            <section className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-black text-lg flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-green-500" /> Lifetime Totals
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {exerciseRows.filter(r => r.lifetime > 0).map(({ key, lifetime }) => {
                  const info = EXERCISE_LABELS[key];
                  return (
                    <div key={key} className="bg-muted/30 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="text-xl">{info?.icon}</span>
                      <div>
                        <p className="font-black text-base leading-none">{lifetime.toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{info?.label}</p>
                      </div>
                    </div>
                  );
                })}
                {exerciseRows.filter(r => r.lifetime > 0).length === 0 && (
                  <div className="col-span-2 text-center py-6 text-muted-foreground">
                    <Award className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No rep data yet</p>
                    <p className="text-xs">Log pushups, squats, or other strength exercises to start!</p>
                  </div>
                )}
              </div>
            </section>

            {/* Monthly Run Miles */}
            {(data?.monthlyRunMiles ?? 0) > 0 && (
              <section className="bg-card border border-border rounded-2xl p-5">
                <h2 className="font-black text-lg flex items-center gap-2 mb-3">
                  🏃 Running This Month
                </h2>
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-black text-primary">{data?.monthlyRunMiles}</span>
                  <span className="text-muted-foreground font-bold pb-1">miles</span>
                </div>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  {(data?.monthlyRunMiles ?? 0) >= 50
                    ? "🏆 Endurance King unlocked!"
                    : `${(50 - (data?.monthlyRunMiles ?? 0)).toFixed(1)} miles to Endurance King badge`}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
