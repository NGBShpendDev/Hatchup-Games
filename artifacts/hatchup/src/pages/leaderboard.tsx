import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  useGetGlobalLeaderboard, getGetGlobalLeaderboardQueryKey,
  useGetArtifactsLeaderboard,
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
  Gift, Medal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type TabKey    = "rankings" | "fitness" | "battle" | "artifacts" | "local";
type ScopeKey  = "world" | "country" | "state" | "county" | "city" | "nearby";
type MetricKey = "xp" | "steps" | "workouts" | "battle_wins" | "streaks" | "artifacts";

const SCOPES: { key: ScopeKey; label: string; icon: string }[] = [
  { key: "world",   label: "World",   icon: "🌍" },
  { key: "country", label: "Country", icon: "🏳️" },
  { key: "state",   label: "State",   icon: "🗺️" },
  { key: "county",  label: "County",  icon: "📍" },
  { key: "city",    label: "City",    icon: "🏙️" },
  { key: "nearby",  label: "Nearby",  icon: "📡" },
];

const METRICS: { key: MetricKey; label: string; icon: React.ReactNode }[] = [
  { key: "xp",          label: "Total XP",     icon: <Star className="w-3.5 h-3.5" /> },
  { key: "steps",       label: "Steps",        icon: <Footprints className="w-3.5 h-3.5" /> },
  { key: "workouts",    label: "Workouts",     icon: <Zap className="w-3.5 h-3.5" /> },
  { key: "battle_wins", label: "Battle Wins",  icon: <Swords className="w-3.5 h-3.5" /> },
  { key: "streaks",     label: "Streaks",      icon: <Flame className="w-3.5 h-3.5" /> },
  { key: "artifacts",   label: "Artifacts",    icon: <Gift className="w-3.5 h-3.5" /> },
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
  pagination?: {
    page: number;
    limit: number;
    totalPages: number;
    totalEntries: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
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

interface ChallengeWinner {
  rank: number;
  playerId: number;
  username: string;
  displayName: string | null;
  currentValue: number;
  isMe: boolean;
  rewardsAwarded?: boolean;
  rewardEarned?: { xp: number; coins: number; artifactId?: number | null } | null;
}

interface ChallengeLeaderboard {
  challenge: LocalChallenge & { isEnded?: boolean };
  entries: ChallengeWinner[];
  myEntry: ChallengeWinner | null;
  winners: ChallengeWinner[];
}

type MyLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
} | null;

export default function Leaderboard() {
  const { playerId } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab]     = useState<TabKey>("rankings");
  const [scope, setScope]             = useState<ScopeKey>("world");
  const [metric, setMetric]           = useState<MetricKey>("xp");
  const [metricOpen, setMetricOpen]   = useState(false);
  const [requestingLoc, setRequestingLoc] = useState(false);
  const [expandedChallenge, setExpandedChallenge] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  // Reset to page 1 whenever scope or metric changes
  useEffect(() => { setPage(1); }, [scope, metric]);
  const [firstVisitDismissed, setFirstVisitDismissed] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage?.getItem("hatchup_loc_prompted") === "1"
  );

  // ── My location (first-visit detection) ──────────────────────────────────
  const { data: myLocation, isLoading: myLocLoading } = useQuery<MyLocation>({
    queryKey: ["my-location"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/players/me/location`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
  const needsFirstVisitPrompt = !myLocLoading && myLocation == null && !firstVisitDismissed;

  const dismissFirstVisit = useCallback(() => {
    try { window.localStorage?.setItem("hatchup_loc_prompted", "1"); } catch { /* ignore */ }
    setFirstVisitDismissed(true);
  }, []);

  useEffect(() => {
    // When location is saved successfully, ensure first-visit prompt is dismissed
    if (myLocation && !firstVisitDismissed) dismissFirstVisit();
  }, [myLocation, firstVisitDismissed, dismissFirstVisit]);

  // ── Scoped leaderboard ───────────────────────────────────────────────────
  const { data: scopedBoard, isLoading: scopedLoading } = useQuery<ScopedBoard>({
    queryKey: ["leaderboard-scoped", scope, metric, page],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/leaderboards/scoped?scope=${scope}&metric=${metric}&limit=20&page=${page}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeTab === "rankings",
  });

  // ── Battle ELO ───────────────────────────────────────────────────────────
  interface BattleEloEntry { rank: number; playerId: number; username: string; displayName: string | null; avatarUrl: string | null; battleElo: number; totalBattleWins: number; level: number; isMe: boolean }
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

  // Challenge leaderboard (lazy — only when expanded)
  const { data: challengeBoard } = useQuery<ChallengeLeaderboard>({
    queryKey: ["challenge-leaderboard", expandedChallenge],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/local-challenges/${expandedChallenge}/leaderboard`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: expandedChallenge !== null && activeTab === "local",
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
            toast({ title: "Location saved! Local boards are now visible." });
            dismissFirstVisit();
            qc.invalidateQueries({ queryKey: ["my-location"] });
            qc.invalidateQueries({ queryKey: ["leaderboard-scoped"] });
            qc.invalidateQueries({ queryKey: ["local-challenges"] });
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
    { key: "battle",    label: "Battle",    icon: <Swords className="w-4 h-4" /> },
    { key: "artifacts", label: "Artifacts", icon: <Gift className="w-4 h-4" /> },
    { key: "local",     label: "Local",     icon: <MapPin className="w-4 h-4" /> },
  ];

  const selectedMetric = METRICS.find(m => m.key === metric)!;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4 pb-28 px-4">
        {/* Header */}
        <div className="text-center py-5">
          <h1 className="text-3xl font-black tracking-tight text-yellow-400 flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7" /> Leaderboards
          </h1>
          <p className="text-sm text-white/50 mt-1">Compete with trainers around the world and in your area.</p>
        </div>

        {/* Privacy notice */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white/50">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          Your exact location is never shared with other players. Only city-level data is used for local boards.
        </div>

        {/* First-visit location prompt — appears before any scope choice */}
        {needsFirstVisitPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-900/40 to-violet-900/30 border border-blue-500/40 rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-start gap-3">
              <Map className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-sm">Enable Local Leaderboards</p>
                <p className="text-xs text-white/60 mt-1">
                  Compete with trainers in your city, county, and country. We only store city-level data — your exact GPS is encrypted and never shared.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex-1"
                onClick={requestLocation}
                disabled={requestingLoc}
              >
                {requestingLoc ? "Getting location…" : "Allow Location"}
              </Button>
              <Button
                variant="outline"
                className="bg-white/5 border-white/10 text-white/60 hover:text-white text-sm"
                onClick={dismissFirstVisit}
              >
                Not now
              </Button>
            </div>
          </motion.div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1.5 bg-white/5 border border-white/10 p-1 rounded-2xl">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs transition-all ${
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
                  Ranked by: {selectedMetric.label}
                  <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${metricOpen ? "rotate-180" : ""}`} />
                </button>
                {metricOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-[#0d0d14] border border-white/10 rounded-2xl overflow-hidden z-20 shadow-2xl min-w-[200px]">
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
                  {[
                    scope === "nearby" || scope === "city" ? scopedBoard.locationContext.city :
                    scope === "county" ? null :
                    scope === "state" ? scopedBoard.locationContext.state :
                    scopedBoard.locationContext.country
                  ].filter(Boolean).join(", ")}
                  {scopedBoard.totalInScope != null && (
                    <span className="ml-1 text-white/30">· {scopedBoard.totalInScope} players</span>
                  )}
                </p>
              )}

              {/* Location permission prompt */}
              {scopedBoard?.locationRequired && (
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-5 text-center space-y-3">
                  <Map className="w-8 h-8 text-blue-400 mx-auto" />
                  <div>
                    <p className="font-bold text-sm">Enable Location for Local Boards</p>
                    <p className="text-xs text-white/50 mt-1">
                      Only city-level data is used. Your exact GPS coordinates are never stored.
                    </p>
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
                <RankedList entries={scopedBoard?.entries ?? []} myEntry={scopedBoard?.myEntry ?? null} metric={metric} />
              )}

              {/* Pagination controls */}
              {scopedBoard?.pagination && scopedBoard.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white/5 border-white/10 text-xs font-bold disabled:opacity-30"
                    disabled={!scopedBoard.pagination.hasPrev || scopedLoading}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </Button>
                  <span className="text-xs font-bold text-white/50">
                    Page {scopedBoard.pagination.page} / {scopedBoard.pagination.totalPages}
                    <span className="ml-2 text-white/30">· {scopedBoard.pagination.totalEntries} players</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white/5 border-white/10 text-xs font-bold disabled:opacity-30"
                    disabled={!scopedBoard.pagination.hasNext || scopedLoading}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next →
                  </Button>
                </div>
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
                    {m === "steps"
                      ? <><Footprints className="w-3.5 h-3.5" /> Daily Steps</>
                      : <><Timer className="w-3.5 h-3.5" /> Best Pace</>}
                  </button>
                ))}
              </div>
              {speedLoading ? (
                <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl bg-white/5" />)}</div>
              ) : (
                <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/5">
                  {(speedBoard ?? []).map((entry, i) => (
                    <div key={entry.playerId} className={`flex items-center gap-3 p-3 ${i < 3 ? "bg-yellow-500/5" : ""}`}>
                      <span className="w-8 text-center font-black text-base text-white/40 flex-shrink-0">
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
                    <div
                      key={entry.playerId}
                      className={`flex items-center gap-3 p-3 ${
                        entry.isMe ? "bg-yellow-500/10 border-l-2 border-yellow-400" : i < 3 ? "bg-yellow-500/5" : ""
                      }`}
                    >
                      <span className="w-8 text-center font-black text-base text-white/40 flex-shrink-0">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${entry.rank}`}
                      </span>
                      <Avatar className="h-9 w-9 border border-white/10 flex-shrink-0">
                        <AvatarImage src={entry.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs font-bold">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="font-bold text-sm truncate">{entry.displayName ?? entry.username}</p>
                          {entry.isMe && <Badge className="text-[10px] px-1 py-0 bg-pink-600 text-white flex-shrink-0">You</Badge>}
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

          {/* ── Artifacts Tab ──────────────────────────────────────────────── */}
          {activeTab === "artifacts" && (
            <ArtifactsLeaderboardPanel myPlayerId={playerId ?? null} />
          )}

          {/* ── Local Competitions Tab ────────────────────────────────────── */}
          {activeTab === "local" && (
            <motion.div key="local" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <SafetyBanner />

              <p className="text-xs text-white/40">
                Time-limited fitness challenges. Earn XP, coins, and exclusive rewards by finishing at the top.
              </p>

              {localLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl bg-white/5" />)}</div>
              ) : (localChallenges?.length ?? 0) === 0 ? (
                <div className="py-10 text-center text-white/30">
                  <MapPin className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm font-bold">No active local challenges</p>
                  <p className="text-xs mt-1">Enable location to see area challenges</p>
                  <Button size="sm" className="mt-3 bg-blue-600 hover:bg-blue-500 text-white" onClick={requestLocation} disabled={requestingLoc}>
                    {requestingLoc ? "Getting location…" : "Enable Location"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(localChallenges ?? []).map(c => {
                    const end  = new Date(c.endAt);
                    const now  = new Date();
                    const isEnded = now > end;
                    const hoursLeft = Math.max(0, Math.round((end.getTime() - now.getTime()) / 3600000));
                    const daysLeft  = Math.floor(hoursLeft / 24);
                    const countdown = isEnded ? "Ended" : daysLeft > 1 ? `${daysLeft}d left` : hoursLeft > 0 ? `${hoursLeft}h left` : "Ending soon";
                    const isExpanded = expandedChallenge === c.id;

                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white/5 border rounded-2xl overflow-hidden ${
                          c.isJoined ? "border-pink-500/40" : isEnded ? "border-white/5" : "border-white/10"
                        }`}
                      >
                        <div className="p-4 space-y-3">
                          {/* Title row */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`font-black text-sm ${isEnded ? "text-white/40" : ""}`}>{c.title}</h3>
                                <Badge className={`text-[10px] px-1.5 py-0 ${
                                  c.scope === "world" ? "bg-blue-600/30 text-blue-300" :
                                  c.scope === "city"  ? "bg-green-600/30 text-green-300" :
                                  "bg-purple-600/30 text-purple-300"
                                }`}>
                                  {c.scope === "world" ? "🌍 Global" : `📍 ${c.scope}`}
                                </Badge>
                                {isEnded && <Badge className="text-[10px] px-1.5 py-0 bg-white/10 text-white/40">Ended</Badge>}
                              </div>
                              {c.description && <p className="text-xs text-white/50 mt-0.5">{c.description}</p>}
                            </div>
                            <span className={`text-[10px] font-bold flex-shrink-0 ${isEnded ? "text-white/30" : hoursLeft < 24 ? "text-red-400" : "text-white/40"}`}>
                              {countdown}
                            </span>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-3 text-xs text-white/40 flex-wrap">
                            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {c.targetValue.toLocaleString()} {c.metric}</span>
                            <span className="flex items-center gap-1">👥 {c.participantCount}</span>
                            <span className="flex items-center gap-1 text-yellow-400">⚡ {c.rewardXp} XP</span>
                            <span className="flex items-center gap-1 text-amber-400">🪙 {c.rewardCoins}</span>
                          </div>

                          {/* Rewards display — top 3 */}
                          {!isEnded && (
                            <div className="flex gap-2 text-[10px]">
                              {[
                                { label: "🥇 1st", xp: c.rewardXp, coins: c.rewardCoins },
                                { label: "🥈 2nd", xp: Math.round(c.rewardXp * 0.6), coins: Math.round(c.rewardCoins * 0.6) },
                                { label: "🥉 3rd", xp: Math.round(c.rewardXp * 0.3), coins: Math.round(c.rewardCoins * 0.3) },
                              ].map(r => (
                                <div key={r.label} className="bg-white/5 rounded-lg px-2 py-1 flex flex-col items-center gap-0.5">
                                  <span className="font-bold text-white/60">{r.label}</span>
                                  <span className="text-yellow-400">⚡{r.xp}</span>
                                  <span className="text-amber-400">🪙{r.coins}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Action row */}
                          <div className="flex items-center gap-2">
                            {c.isJoined ? (
                              <Badge className="bg-pink-600/20 text-pink-400 border border-pink-500/30 text-xs">✓ Joined</Badge>
                            ) : !isEnded ? (
                              <Button
                                size="sm"
                                className="bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white text-xs font-bold h-7"
                                onClick={() => joinMutation.mutate(c.id)}
                                disabled={joinMutation.isPending}
                              >
                                Join Challenge
                              </Button>
                            ) : null}
                            <button
                              onClick={() => setExpandedChallenge(isExpanded ? null : c.id)}
                              className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
                            >
                              <Medal className="w-3 h-3" />
                              {isExpanded ? "Hide" : "Leaderboard"}
                            </button>
                          </div>
                        </div>

                        {/* Inline leaderboard */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-white/10 overflow-hidden"
                            >
                              {challengeBoard?.challenge.id === c.id ? (
                                <div>
                                  {/* Result screen — shown when challenge has ended */}
                                  {(challengeBoard.challenge.isEnded || isEnded) && challengeBoard.winners.length > 0 && (
                                    <div className="bg-gradient-to-br from-yellow-900/30 via-amber-900/20 to-orange-900/20 border-b border-yellow-500/20 px-4 py-4 space-y-3">
                                      <div className="flex items-center gap-2">
                                        <Trophy className="w-4 h-4 text-yellow-400" />
                                        <span className="font-black text-xs uppercase tracking-wider text-yellow-400">Final Results</span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2">
                                        {challengeBoard.winners.map((w, wi) => {
                                          const medal = wi === 0 ? "🥇" : wi === 1 ? "🥈" : "🥉";
                                          return (
                                            <div
                                              key={w.playerId}
                                              className={`rounded-xl p-2 text-center space-y-1 ${
                                                w.isMe ? "bg-pink-600/20 border border-pink-500/40" : "bg-white/5 border border-white/10"
                                              }`}
                                            >
                                              <div className="text-xl">{medal}</div>
                                              <div className="font-bold text-[11px] truncate">{w.displayName ?? w.username}</div>
                                              {w.rewardEarned && (
                                                <div className="text-[9px] space-y-0.5 pt-1 border-t border-white/10">
                                                  <div className="text-yellow-400 font-bold">⚡ {w.rewardEarned.xp}</div>
                                                  <div className="text-amber-400 font-bold">🪙 {w.rewardEarned.coins}</div>
                                                  {w.rewardEarned.artifactId != null && (
                                                    <div className="text-violet-400 font-bold">🎁 Artifact</div>
                                                  )}
                                                </div>
                                              )}
                                              {w.isMe && w.rewardsAwarded && (
                                                <Badge className="text-[9px] px-1 py-0 bg-pink-600 text-white">Awarded!</Badge>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {challengeBoard.myEntry && !challengeBoard.winners.some(w => w.isMe) && (
                                        <p className="text-[10px] text-center text-white/40">
                                          You finished #{challengeBoard.myEntry.rank} of {challengeBoard.entries.length}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  <div className="divide-y divide-white/5">
                                  {challengeBoard.entries.length === 0 ? (
                                    <div className="py-6 text-center text-white/30 text-xs">No participants yet</div>
                                  ) : (
                                    challengeBoard.entries.slice(0, 10).map((e, ei) => (
                                      <div key={e.playerId} className={`flex items-center gap-3 px-4 py-2.5 ${e.isMe ? "bg-pink-600/10" : ""}`}>
                                        <span className="w-6 text-center font-black text-xs text-white/40">
                                          {ei === 0 ? "🥇" : ei === 1 ? "🥈" : ei === 2 ? "🥉" : `#${e.rank}`}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1">
                                            <span className="font-bold text-xs truncate">{e.displayName ?? e.username}</span>
                                            {e.isMe && <Badge className="text-[9px] px-1 py-0 bg-pink-600 text-white">You</Badge>}
                                          </div>
                                        </div>
                                        <span className="font-black text-xs text-pink-400">{e.currentValue.toLocaleString()}</span>
                                      </div>
                                    ))
                                  )}
                                  {challengeBoard.myEntry && !challengeBoard.entries.slice(0, 10).some(e => e.isMe) && (
                                    <div className="flex items-center gap-3 px-4 py-2.5 bg-pink-600/10 border-t border-pink-500/20">
                                      <span className="font-black text-xs text-white/40">#{challengeBoard.myEntry.rank}</span>
                                      <span className="flex-1 font-bold text-xs">You</span>
                                      <span className="font-black text-xs text-pink-400">{challengeBoard.myEntry.currentValue.toLocaleString()}</span>
                                    </div>
                                  )}
                                  </div>
                                </div>
                              ) : (
                                <div className="py-4 text-center text-xs text-white/30">Loading…</div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
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

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-white/30">
        <Globe className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm font-bold">No players in this scope yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
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
              {(metric === "steps" || metric === "streaks") && (
                <p className="text-[10px] text-orange-400">{entry.currentStreak}🔥</p>
              )}
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

// ── Artifacts collector leaderboard panel ──────────────────────────────────
const RARITY_COLORS: Record<string, string> = {
  Common:    "text-white/60",
  Rare:      "text-blue-400",
  Epic:      "text-violet-400",
  Legendary: "text-orange-400",
  Mythic:    "text-pink-400",
  Ancient:   "text-amber-400",
  Celestial: "text-cyan-300",
};

function ArtifactsLeaderboardPanel({ myPlayerId: _myPlayerId }: { myPlayerId: number | null }) {
  const { data, isLoading } = useGetArtifactsLeaderboard({ limit: 50 });

  return (
    <motion.div key="artifacts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
      <p className="text-xs text-white/40 flex items-center gap-1">
        <Gift className="w-3.5 h-3.5 text-cyan-300" />
        Top collectors ranked by weighted rarity score. Celestial=7, Ancient=6, Mythic=5, Legendary=4, Epic=3, Rare=2, Common=1.
      </p>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl bg-white/5" />)}</div>
      ) : (
        <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/5">
          {(data ?? []).map((entry, i) => (
            <motion.div
              key={entry.playerId}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`flex items-center gap-3 p-3 ${
                entry.isMe ? "bg-cyan-500/10 border-l-2 border-cyan-400" : i < 3 ? "bg-yellow-500/5" : "hover:bg-white/5"
              }`}
            >
              <span className="w-8 text-center font-black text-sm text-white/40 flex-shrink-0">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${entry.position}`}
              </span>
              <Avatar className="h-9 w-9 border border-white/10 flex-shrink-0">
                <AvatarImage src={entry.avatarUrl ?? undefined} />
                <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-cyan-600 to-violet-700">
                  {entry.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-sm truncate">{entry.displayName ?? entry.username}</p>
                  {entry.isMe && <Badge className="text-[10px] px-1 py-0 bg-cyan-600 text-white flex-shrink-0">You</Badge>}
                </div>
                {entry.rarestRarity && (
                  <p className="text-[10px] text-white/40 truncate">
                    Rarest: <span className={`font-bold ${RARITY_COLORS[entry.rarestRarity] ?? "text-white/70"}`}>{entry.rarestRarity}</span>
                    {entry.rarestName ? ` · ${entry.rarestName}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-sm text-cyan-300 flex items-center justify-end gap-1">
                  <Medal className="w-3.5 h-3.5" />{entry.rarityScore}
                </p>
                <p className="text-[10px] text-white/40">{entry.artifactCount} artifact{entry.artifactCount === 1 ? "" : "s"}</p>
              </div>
            </motion.div>
          ))}
          {(data?.length ?? 0) === 0 && (
            <div className="py-10 text-center text-white/30">
              <Gift className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm font-bold">No artifact collectors yet</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
