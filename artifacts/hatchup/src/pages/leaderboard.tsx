import { useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  useGetGlobalLeaderboard, getGetGlobalLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RankBadge } from "@/components/rank-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SafetyBanner } from "@/components/safety-banner";
import {
  Trophy, Zap, Footprints, Timer, Swords, Crown, MapPin,
  Globe, Target, Map, ChevronDown, AlertCircle, Flame, Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type TabKey = "rankings" | "fitness" | "battle" | "local";
type ScopeKey = "world" | "country" | "state" | "county" | "city";
type MetricKey = "xp" | "steps" | "workouts" | "battle_wins" | "streaks";

const SCOPES: { key: ScopeKey; label: string; icon: string }[] = [
  { key: "world",   label: "World",   icon: "🌍" },
  { key: "country", label: "Country", icon: "🏳️" },
  { key: "state",   label: "State",   icon: "🗺️" },
  { key: "county",  label: "County",  icon: "📍" },
  { key: "city",    label: "City",    icon: "🏙️" },
];

const METRICS: { key: MetricKey; label: string; icon: React.ReactNode }[] = [
  { key: "xp",          label: "Total XP",     icon: <Star className="w-3.5 h-3.5" /> },
  { key: "steps",       label: "Steps",        icon: <Footprints className="w-3.5 h-3.5" /> },
  { key: "workouts",    label: "Workouts",     icon: <Zap className="w-3.5 h-3.5" /> },
  { key: "battle_wins", label: "Battle Wins",  icon: <Swords className="w-3.5 h-3.5" /> },
  { key: "streaks",     label: "Streaks",      icon: <Flame className="w-3.5 h-3.5" /> },
];

interface ScopedEntry {
  position: number;
  playerId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  rank: string;
  metricValue: number;
  metricLabel: string;
  isMe: boolean;
  currentStreak: number;
}

interface ScopedBoard {
  entries: ScopedEntry[];
  myEntry: ScopedEntry | null;
  scope: string;
  metric: string;
  totalInScope: number;
  locationRequired: boolean;
  locationContext: { city: string | null; state: string | null; country: string | null } | null;
}

interface LocalChallenge {
  id: number;
  title: string;
  description: string | null;
  scope: string;
  scopeValue: string;
  metric: string;
  targetValue: number;
  startAt: string;
  endAt: string;
  rewardXp: number;
  rewardCoins: number;
  participantCount: number;
  isJoined: boolean;
  isRelevant: boolean;
}

export default function Leaderboard() {
  const { playerId } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("rankings");
  const [scope, setScope]   = useState<ScopeKey>("world");
  const [metric, setMetric] = useState<MetricKey>("xp");
  const [metricOpen, setMetricOpen] = useState(false);
  const [requestingLoc, setRequestingLoc] = useState(false);

  // ── Global ranking ───────────────────────────────────────────────────────
  const { data: leaderboard, isLoading: globalLoading } = useGetGlobalLeaderboard(
    { limit: 50 },
    { query: { queryKey: getGetGlobalLeaderboardQueryKey({ limit: 50 }), enabled: activeTab === "rankings" && scope === "world" && metric === "xp" } }
  );

  // ── Scoped leaderboard ───────────────────────────────────────────────────
  const { data: scopedBoard, isLoading: scopedLoading } = useQuery<ScopedBoard>({
    queryKey: ["leaderboard-scoped", scope, metric],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/leaderboards/scoped?scope=${scope}&metric=${metric}&limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeTab === "rankings",
  });

  // ── Battle ELO ───────────────────────────────────────────────────────────
  interface BattleEloEntry { rank: number; playerId: number; username: string; displayName: string | null; battleElo: number; totalBattleWins: number; level: number; isMe: boolean }
  const { data: eloBoard, isLoading: eloLoading } = useQuery<BattleEloEntry[]>({
    queryKey: ["leaderboard-battle-elo"],
    queryFn: () => fetch(`${BASE}/api/leaderboards/battle-elo?limit=100`, { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "battle",
  });

  // ── Fitness / Speed ──────────────────────────────────────────────────────
  interface SpeedEntry { position: number; playerId: number; username: string; displayName: string | null; avatarUrl: string | null; rank: string; metricValue: number; metricLabel: string; currentStreak: number }
  const [speedMode, setSpeedMode] = useState<"steps" | "pace">("steps");
  const { data: speedBoard, isLoading: speedLoading } = useQuery<SpeedEntry[]>({
    queryKey: ["leaderboard-speed", speedMode],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/leaderboards/speed?mode=${speedMode}&limit=25`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeTab === "fitness",
  });

  // ── Local challenges ─────────────────────────────────────────────────────
  const { data: localChallenges, isLoading: localLoading } = useQuery<LocalChallenge[]>({
    queryKey: ["local-challenges"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/local-challenges`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeTab === "local",
  });

  const joinMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/local-challenges/${id}/join`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to join");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Joined challenge!" });
      qc.invalidateQueries({ queryKey: ["local-challenges"] });
    },
    onError: () => toast({ title: "Couldn't join challenge", variant: "destructive" }),
  });

  // ── Request GPS location ─────────────────────────────────────────────────
  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    setRequestingLoc(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`${BASE}/api/players/me/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          });
          if (res.ok) {
            toast({ title: "Location updated! Local boards are now visible." });
            qc.invalidateQueries({ queryKey: ["leaderboard-scoped"] });
          } else {
            toast({ title: "Couldn't save location", variant: "destructive" });
          }
        } finally {
          setRequestingLoc(false);
        }
      },
      () => {
        toast({ title: "Location permission denied", variant: "destructive" });
        setRequestingLoc(false);
      }
    );
  }, [toast, qc]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "rankings", label: "Rankings", icon: <Trophy className="w-4 h-4" /> },
    { key: "fitness",  label: "Fitness",  icon: <Zap className="w-4 h-4" /> },
    { key: "battle",   label: "Battle",   icon: <Swords className="w-4 h-4" /> },
    { key: "local",    label: "Local",    icon: <MapPin className="w-4 h-4" /> },
  ];

  const selectedMetricLabel = METRICS.find(m => m.key === metric)?.label ?? "XP";

  // Decide what to show in Rankings tab
  const useScoped = !(scope === "world" && metric === "xp");

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4 pb-28 px-4">
        {/* Header */}
        <div className="text-center py-5">
          <h1 className="text-3xl font-black tracking-tight text-yellow-400 flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7" /> Leaderboards
          </h1>
          <p className="text-sm text-white/50 mt-1">Compete with players around the world and in your area.</p>
        </div>

        {/* Safety notice */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white/50">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          Your exact location is never shared with other players.
        </div>

        {/* Tab bar */}
        <div className="flex gap-1.5 bg-white/5 border border-white/10 p-1 rounded-2xl overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-[70px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white shadow-sm"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── Rankings Tab ──────────────────────────────────────────────── */}
          {activeTab === "rankings" && (
            <motion.div key="rankings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Scope selector */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {SCOPES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setScope(s.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border whitespace-nowrap transition-all flex-shrink-0 ${
                      scope === s.key
                        ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-400"
                        : "bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/30"
                    }`}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>

              {/* Metric dropdown */}
              <div className="relative">
                <button
                  onClick={() => setMetricOpen(o => !o)}
                  className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white hover:bg-white/8 transition-colors"
                >
                  <Target className="w-4 h-4 text-pink-400" />
                  Ranked by: {selectedMetricLabel}
                  <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${metricOpen ? "rotate-180" : ""}`} />
                </button>
                {metricOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-[#0d0d14] border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl min-w-[200px]">
                    {METRICS.map(m => (
                      <button
                        key={m.key}
                        onClick={() => { setMetric(m.key); setMetricOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-left transition-colors ${
                          metric === m.key ? "bg-pink-600/20 text-pink-400" : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location context label */}
              {scopedBoard?.locationContext && scope !== "world" && (
                <p className="text-xs text-white/40 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Showing: {[scopedBoard.locationContext.city, scopedBoard.locationContext.state, scopedBoard.locationContext.country].filter(Boolean).join(", ")}
                  {scopedBoard.totalInScope != null && <span className="ml-1">· {scopedBoard.totalInScope} players</span>}
                </p>
              )}

              {/* Location required prompt */}
              {scopedBoard?.locationRequired && (
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-5 text-center space-y-3">
                  <Map className="w-8 h-8 text-blue-400 mx-auto" />
                  <div>
                    <p className="font-bold text-sm">Enable Location for Local Boards</p>
                    <p className="text-xs text-white/50 mt-1">Your exact location is never shown to other players.</p>
                  </div>
                  <Button
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold"
                    onClick={requestLocation}
                    disabled={requestingLoc}
                  >
                    {requestingLoc ? "Getting location…" : "Allow Location"}
                  </Button>
                </div>
              )}

              {/* Rankings list */}
              {scopedLoading ? (
                <div className="space-y-2">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl bg-white/5" />)}
                </div>
              ) : (
                <RankedList
                  entries={scopedBoard?.entries ?? []}
                  myEntry={scopedBoard?.myEntry ?? null}
                  metric={metric}
                />
              )}
            </motion.div>
          )}

          {/* ── Fitness Tab ───────────────────────────────────────────────── */}
          {activeTab === "fitness" && (
            <motion.div key="fitness" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex gap-2">
                {(["steps", "pace"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setSpeedMode(m)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm border transition-all ${
                      speedMode === m
                        ? "bg-pink-600/20 border-pink-500/60 text-pink-400"
                        : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                    }`}
                  >
                    {m === "steps" ? <><Footprints className="w-3.5 h-3.5" /> Daily Steps</> : <><Timer className="w-3.5 h-3.5" /> Best Pace</>}
                  </button>
                ))}
              </div>
              {speedLoading ? (
                <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl bg-white/5" />)}</div>
              ) : (
                <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/5">
                  {(speedBoard ?? []).map((entry, i) => (
                    <div key={entry.playerId} className={`flex items-center gap-3 p-3 ${i < 3 ? "bg-yellow-500/5" : ""}`}>
                      <span className="w-8 text-center font-black text-base text-white/40">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </span>
                      <Avatar className="h-9 w-9 border border-white/10 flex-shrink-0">
                        <AvatarImage src={entry.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs font-bold">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{entry.displayName ?? entry.username}</p>
                        <p className="text-[10px] text-white/40 uppercase font-bold">{entry.rank}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-sm text-blue-400">{entry.metricLabel}</p>
                        <p className="text-[10px] text-orange-400">{entry.currentStreak}🔥</p>
                      </div>
                    </div>
                  ))}
                  {(speedBoard?.length ?? 0) === 0 && (
                    <div className="py-10 text-center text-white/30">
                      <Footprints className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-bold">No data yet — start logging!</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Battle Tab ────────────────────────────────────────────────── */}
          {activeTab === "battle" && (
            <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <p className="text-xs text-white/40 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
                Top players ranked by Battle ELO. Ranked mode unlocks at Level 10.
              </p>
              {eloLoading ? (
                <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl bg-white/5" />)}</div>
              ) : (
                <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/5">
                  {(eloBoard ?? []).map((entry, i) => (
                    <div key={entry.playerId} className={`flex items-center gap-3 p-3 ${entry.isMe ? "bg-yellow-500/10 border-l-2 border-yellow-400" : i < 3 ? "bg-yellow-500/5" : ""}`}>
                      <span className="w-8 text-center font-black text-base text-white/40">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${entry.rank}`}
                      </span>
                      <Avatar className="h-9 w-9 border border-white/10 flex-shrink-0">
                        <AvatarFallback className="text-xs font-bold">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="font-bold text-sm truncate">{entry.displayName ?? entry.username}</p>
                          {entry.isMe && <Badge className="text-[10px] px-1 py-0 bg-pink-600 text-white">You</Badge>}
                        </div>
                        <p className="text-[10px] text-white/40">Lv.{entry.level}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-sm text-yellow-400">{entry.battleElo}</p>
                        <p className="text-[10px] text-green-400">{entry.totalBattleWins}W</p>
                      </div>
                    </div>
                  ))}
                  {(eloBoard?.length ?? 0) === 0 && (
                    <div className="py-10 text-center text-white/30">
                      <Swords className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-bold">No ranked battles yet</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Local Competitions Tab ────────────────────────────────────── */}
          {activeTab === "local" && (
            <motion.div key="local" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <SafetyBanner />
              <p className="text-xs text-white/40">
                Area-based fitness challenges. Win to earn XP, coins, and exclusive rewards.
              </p>
              {localLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl bg-white/5" />)}</div>
              ) : (
                <div className="space-y-3">
                  {(localChallenges ?? []).length === 0 && (
                    <div className="py-10 text-center text-white/30">
                      <MapPin className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-bold">No active local challenges</p>
                    </div>
                  )}
                  {(localChallenges ?? []).map(c => {
                    const end = new Date(c.endAt);
                    const now = new Date();
                    const hoursLeft = Math.max(0, Math.round((end.getTime() - now.getTime()) / 3600000));
                    const daysLeft = Math.floor(hoursLeft / 24);
                    const countdownLabel = daysLeft > 1 ? `${daysLeft}d left` : hoursLeft > 0 ? `${hoursLeft}h left` : "Ending soon";

                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white/5 border rounded-2xl p-4 space-y-3 ${c.isJoined ? "border-pink-500/40" : "border-white/10"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-black text-sm">{c.title}</h3>
                              <Badge className={`text-[10px] px-1.5 py-0 ${
                                c.scope === "world" ? "bg-blue-600/30 text-blue-300" :
                                c.scope === "city"  ? "bg-green-600/30 text-green-300" :
                                "bg-purple-600/30 text-purple-300"
                              }`}>
                                {c.scope === "world" ? "🌍 Global" : `📍 ${c.scope}`}
                              </Badge>
                            </div>
                            {c.description && <p className="text-xs text-white/50 mt-0.5">{c.description}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-white/40">{countdownLabel}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-white/40">
                          <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {c.targetValue.toLocaleString()} {c.metric}</span>
                          <span className="flex items-center gap-1">👥 {c.participantCount}</span>
                          <span className="flex items-center gap-1 text-yellow-400">⚡ {c.rewardXp} XP</span>
                          <span className="flex items-center gap-1 text-amber-400">🪙 {c.rewardCoins}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {c.isJoined ? (
                            <Badge className="bg-pink-600/20 text-pink-400 border border-pink-500/30 text-xs">
                              ✓ Joined
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white text-xs font-bold h-7"
                              onClick={() => joinMutation.mutate(c.id)}
                              disabled={joinMutation.isPending}
                            >
                              Join Challenge
                            </Button>
                          )}
                          <button className="text-xs text-white/30 hover:text-white/60 transition-colors">
                            Spectate
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

// ── Shared ranked list component ──────────────────────────────────────────────
function RankedList({
  entries,
  myEntry,
  metric,
}: {
  entries: ScopedEntry[];
  myEntry: ScopedEntry | null;
  metric: MetricKey;
}) {
  const myRankOutside = myEntry && !entries.some(e => e.isMe);

  return (
    <div className="space-y-1">
      {entries.length === 0 && (
        <div className="py-12 text-center text-white/30">
          <Globe className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm font-bold">No players in this scope yet</p>
        </div>
      )}
      <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/5">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.playerId}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 p-3 transition-colors ${
              entry.isMe
                ? "bg-pink-600/10 border-l-2 border-pink-500"
                : i < 3 ? "bg-yellow-500/5" : "hover:bg-white/5"
            }`}
          >
            <span className="w-8 text-center font-black text-sm text-white/40 flex-shrink-0">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${entry.position}`}
            </span>
            <Avatar className="h-9 w-9 border border-white/10 flex-shrink-0">
              <AvatarImage src={entry.avatarUrl ?? undefined} />
              <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-violet-600 to-pink-600">
                {entry.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-sm truncate">{entry.displayName ?? entry.username}</p>
                {entry.isMe && <Badge className="text-[10px] px-1 py-0 bg-pink-600 text-white flex-shrink-0">You</Badge>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <RankBadge rank={entry.rank} size="sm" />
                <span className="text-[10px] text-white/40 uppercase font-bold">{entry.rank}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-black text-sm text-pink-400">{entry.metricLabel}</p>
              {metric === "steps" || metric === "streaks"
                ? <p className="text-[10px] text-orange-400">{entry.currentStreak}🔥</p>
                : null}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Your rank — pinned card if outside top N */}
      {myRankOutside && myEntry && (
        <div className="bg-pink-600/10 border border-pink-500/40 rounded-2xl p-3 flex items-center gap-3">
          <span className="text-xs text-white/50 font-bold flex-shrink-0">Your rank</span>
          <span className="font-black text-lg text-pink-400">#{myEntry.position}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{myEntry.displayName ?? myEntry.username}</p>
            <p className="text-xs text-white/40">{myEntry.metricLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}
