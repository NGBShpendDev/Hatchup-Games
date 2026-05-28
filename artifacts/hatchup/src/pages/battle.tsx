import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import {
  Swords, Zap, Shield, Sparkles, Trophy, RotateCcw, ChevronLeft,
  Share2, Bookmark, Trash2, Star, Plus, X,
} from "lucide-react";
import { RewardSummaryModal, type RewardEntry } from "@/components/reward-summary-modal";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Type defs ─────────────────────────────────────────────────────────────────
interface EquippedArtifactSlot {
  id: number;
  name: string;
  rarity: string;
  imageSlug: string;
  slot: "major" | "minor";
  isPowered: boolean;
  evolutionStage: number;
}

interface FighterState {
  playerId: number;
  playerUsername: string | null;
  playerDisplayName: string | null;
  hatchlingId: number;
  hatchlingName: string;
  hatchlingLevel: number;
  realm: string;
  maxHp: number;
  currentHp: number;
  maxEnergy: number;
  energy: number;
  speed: number;
  defenseBonus: number;
  specialCooldown: number;
  itemUsed: boolean;
  isBot: boolean;
  equippedArtifacts: EquippedArtifactSlot[];
  artifactPowerScore: number;
}

interface TurnResult {
  turnNumber: number;
  actingSlot: 1 | 2;
  move: string;
  damage: number;
  healing: number;
  isCrit: boolean;
  isSuper: boolean;
  p1HpAfter: number;
  p2HpAfter: number;
}

interface BattleState {
  battleId: number;
  mode: "casual" | "ranked";
  fighter1: FighterState;
  fighter2: FighterState;
  currentSlot: 1 | 2;
  turnNumber: number;
  phase: "lobby" | "active" | "ended";
  winner: 0 | 1 | 2 | null;
  turns: TurnResult[];
}

interface Hatchling {
  id: number;
  name: string;
  level: number;
  realm: string;
  species: string;
  rarity: string;
  color?: string;
}

interface OwnedArtifact {
  id: number;        // artifact catalog id
  name: string;
  rarity: string;
  imageSlug: string;
}

interface LoadoutSlots {
  major: OwnedArtifact | null;
  minor1: OwnedArtifact | null;
  minor2: OwnedArtifact | null;
}

interface ArtifactBattleXpEntry {
  playerArtifactId: number;
  artifactId: number;
  artifactName: string;
  rarity: string;
  imageSlug: string;
  battleXp: number;
  evolutionStage: number;
}

interface ArtifactXpGain {
  artifactId: number;
  xpGained: number;
  newStage: number;
}

interface SavedBuild {
  id: number;
  hatchlingId: number;
  buildName: string;
  majorArtifactId: number | null;
  minorArtifact1Id: number | null;
  minorArtifact2Id: number | null;
  powerScore: number;
}

type MoveType = "basic_attack" | "special_move" | "defend" | "use_item";
type Phase = "select" | "loadout" | "queue" | "battle" | "result";

// ── Rarity styling ────────────────────────────────────────────────────────────
const RARITY_BORDER: Record<string, string> = {
  Common:    "border-gray-500",
  Rare:      "border-blue-400",
  Epic:      "border-purple-400",
  Legendary: "border-yellow-400",
  Mythic:    "border-pink-400",
  Ancient:   "border-orange-400",
  Celestial: "border-cyan-400",
};

const RARITY_GLOW: Record<string, string> = {
  Common:    "",
  Rare:      "shadow-blue-500/40 shadow-md",
  Epic:      "shadow-purple-500/50 shadow-lg",
  Legendary: "shadow-yellow-500/50 shadow-xl",
  Mythic:    "shadow-pink-500/60 shadow-xl",
  Ancient:   "shadow-orange-500/60 shadow-2xl",
  Celestial: "shadow-cyan-500/70 shadow-2xl",
};

const RARITY_TEXT: Record<string, string> = {
  Common:    "text-gray-400",
  Rare:      "text-blue-400",
  Epic:      "text-purple-400",
  Legendary: "text-yellow-400",
  Mythic:    "text-pink-400",
  Ancient:   "text-orange-400",
  Celestial: "text-cyan-400",
};

const RARITY_BG: Record<string, string> = {
  Common:    "bg-gray-500/20",
  Rare:      "bg-blue-500/20",
  Epic:      "bg-purple-500/20",
  Legendary: "bg-yellow-500/20",
  Mythic:    "bg-pink-500/20",
  Ancient:   "bg-orange-500/20",
  Celestial: "bg-cyan-500/20",
};

const RARITY_POWER: Record<string, number> = {
  Common: 5, Rare: 15, Epic: 30, Legendary: 50,
  Mythic: 80, Ancient: 120, Celestial: 200,
};

function computePowerScore(slots: LoadoutSlots): number {
  const maj  = RARITY_POWER[slots.major?.rarity  ?? ""] ?? 0;
  const min1 = RARITY_POWER[slots.minor1?.rarity ?? ""] ?? 0;
  const min2 = RARITY_POWER[slots.minor2?.rarity ?? ""] ?? 0;
  return maj + min1 * 0.5 + min2 * 0.5;
}

const REALM_EMOJI: Record<string, string> = {
  strength: "💪", cardio: "🏃", balance: "🧘", beast: "🐉", mythic: "✨",
};

const REALM_COLOR: Record<string, string> = {
  strength: "from-red-600 to-orange-500",
  cardio:   "from-cyan-600 to-blue-500",
  balance:  "from-green-600 to-teal-500",
  beast:    "from-purple-600 to-violet-500",
  mythic:   "from-yellow-500 to-pink-500",
};

const MOVES: { type: MoveType; label: string; icon: React.ReactNode; cost: number; desc: string; color: string }[] = [
  { type: "basic_attack", label: "Strike",  icon: <Swords className="w-4 h-4" />,   cost: 10, desc: "Reliable hit", color: "bg-blue-600 hover:bg-blue-500" },
  { type: "special_move", label: "Special", icon: <Sparkles className="w-4 h-4" />, cost: 25, desc: "2× power, 3-turn cooldown", color: "bg-purple-600 hover:bg-purple-500" },
  { type: "defend",       label: "Defend",  icon: <Shield className="w-4 h-4" />,   cost: 12, desc: "Reduce incoming damage", color: "bg-green-600 hover:bg-green-500" },
  { type: "use_item",     label: "Heal",    icon: <Zap className="w-4 h-4" />,      cost: 20, desc: "Restore 30% HP (once)",  color: "bg-yellow-600 hover:bg-yellow-500" },
];

// ── Damage number pop-up ──────────────────────────────────────────────────────
function DamagePopup({ value, isCrit, isHeal, isSuper }: { value: number; isCrit: boolean; isHeal: boolean; isSuper: boolean }) {
  return (
    <motion.div
      initial={{ y: 0, opacity: 1, scale: 0.8 }}
      animate={{ y: -60, opacity: 0, scale: 1.3 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 font-black text-2xl pointer-events-none z-30 drop-shadow-lg select-none
        ${isHeal ? "text-green-400" : isCrit ? "text-yellow-300" : isSuper ? "text-purple-300" : "text-white"}`}
    >
      {isHeal ? `+${value}` : `-${value}`}
      {isCrit && <span className="text-xs ml-1 text-yellow-200">CRIT!</span>}
      {isSuper && !isCrit && <span className="text-xs ml-1 text-purple-200">SUPER!</span>}
    </motion.div>
  );
}

// ── Artifact dot indicator ────────────────────────────────────────────────────
function ArtifactDot({ artifact }: { artifact: EquippedArtifactSlot }) {
  const borderColor = RARITY_BORDER[artifact.rarity] ?? "border-gray-500";
  const glowClass   = artifact.isPowered ? (RARITY_GLOW[artifact.rarity] ?? "") : "";
  return (
    <div
      title={`${artifact.name}${artifact.isPowered ? " (Powered)" : " (Dormant)"} · Stage ${artifact.evolutionStage}`}
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px]
        ${borderColor} ${glowClass}
        ${artifact.isPowered ? "" : "opacity-30"}
        ${artifact.slot === "major" ? "w-6 h-6" : ""}`}
    >
      {artifact.slot === "major" ? "★" : "◆"}
    </div>
  );
}

// ── Fighter Panel ─────────────────────────────────────────────────────────────
function FighterPanel({
  fighter, isActive, isPlayer, lastTurn, yourSlot, slot,
}: {
  fighter: FighterState;
  isActive: boolean;
  isPlayer: boolean;
  lastTurn: TurnResult | null;
  yourSlot: 1 | 2;
  slot: 1 | 2;
}) {
  const hpPct      = Math.max(0, (fighter.currentHp / fighter.maxHp) * 100);
  const energyPct  = Math.max(0, (fighter.energy / fighter.maxEnergy) * 100);
  const realmKey   = fighter.realm ?? "balance";
  const gradient   = REALM_COLOR[realmKey] ?? REALM_COLOR["balance"]!;
  const showDamage = lastTurn && lastTurn.actingSlot !== slot && lastTurn.damage > 0;
  const showHeal   = lastTurn && lastTurn.actingSlot === slot && lastTurn.healing > 0;
  const hasMajor   = fighter.equippedArtifacts.some(a => a.slot === "major");

  return (
    <motion.div
      animate={isActive ? { boxShadow: ["0 0 0px #fff0", "0 0 18px #fff8", "0 0 0px #fff0"] } : {}}
      transition={{ repeat: Infinity, duration: 1.5 }}
      className={`relative flex-1 rounded-2xl border-2 p-4 transition-all
        ${isActive ? "border-primary" : "border-white/10"} bg-black/40`}
    >
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          {isPlayer ? "Your turn" : "Opponent"}
        </div>
      )}

      <div className={`w-full h-24 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 relative overflow-hidden
        ${hasMajor ? "ring-1 ring-yellow-400/40" : ""}`}>
        <span className="text-5xl select-none">{REALM_EMOJI[realmKey] ?? "🐣"}</span>
        {fighter.defenseBonus > 0 && (
          <div className="absolute bottom-1 right-1 bg-green-500/80 rounded px-1 text-[10px] font-bold text-white">🛡 DEF</div>
        )}
        <AnimatePresence>
          {showDamage && <DamagePopup key={`dmg-${lastTurn!.turnNumber}`} value={lastTurn!.damage} isCrit={lastTurn!.isCrit} isHeal={false} isSuper={lastTurn!.isSuper} />}
          {showHeal && <DamagePopup key={`heal-${lastTurn!.turnNumber}`} value={lastTurn!.healing} isCrit={false} isHeal={true} isSuper={false} />}
        </AnimatePresence>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="font-black text-sm truncate">{fighter.hatchlingName}</p>
          <Badge variant="secondary" className="text-[10px] px-1.5">Lv.{fighter.hatchlingLevel}</Badge>
        </div>
        {!isPlayer && (
          <p className="text-[10px] text-muted-foreground truncate" data-testid="text-opponent-trainer">
            {fighter.isBot ? (
              <>Trainer: <span className="font-medium text-white/70">Bot 🤖</span></>
            ) : fighter.playerId > 0 ? (
              <>
                Trainer:{" "}
                <Link
                  href={`/players/${fighter.playerId}`}
                  className="font-medium text-primary hover:underline"
                  data-testid={`link-opponent-profile-${fighter.playerId}`}
                >
                  {fighter.playerDisplayName ?? fighter.playerUsername ?? `Player #${fighter.playerId}`}
                </Link>
              </>
            ) : null}
          </p>
        )}

        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>HP</span><span>{fighter.currentHp}/{fighter.maxHp}</span>
          </div>
          <motion.div animate={{ width: `${hpPct}%` }} transition={{ duration: 0.5 }}>
            <Progress value={hpPct} className="h-2.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-green-400 [&>div]:to-emerald-500" />
          </motion.div>
        </div>

        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>⚡ Energy</span><span>{fighter.energy}/{fighter.maxEnergy}</span>
          </div>
          <Progress value={energyPct} className="h-1.5 bg-white/10 [&>div]:bg-blue-400" />
        </div>

        <div className="flex gap-1 flex-wrap">
          <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground capitalize">{realmKey}</span>
          {fighter.specialCooldown > 0 && (
            <span className="text-[10px] bg-purple-500/20 px-1.5 py-0.5 rounded text-purple-300">Special cd:{fighter.specialCooldown}</span>
          )}
        </div>

        {/* Artifact slots row */}
        {fighter.equippedArtifacts.length > 0 && (
          <div className="flex gap-1 pt-1">
            {fighter.equippedArtifacts.map((a, i) => (
              <ArtifactDot key={i} artifact={a} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Loadout Slot Card ─────────────────────────────────────────────────────────
function LoadoutSlotCard({
  label, slotType, artifact, isSelecting, onSelect, onClear,
}: {
  label: string;
  slotType: "major" | "minor1" | "minor2";
  artifact: OwnedArtifact | null;
  isSelecting: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  const border = artifact ? (RARITY_BORDER[artifact.rarity] ?? "border-white/20") : (isSelecting ? "border-primary" : "border-white/10");
  const glow   = artifact ? (RARITY_GLOW[artifact.rarity] ?? "") : "";
  const isMajor = slotType === "major";

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all ${border} ${glow}
        ${isSelecting ? "bg-primary/10" : "bg-white/3 hover:bg-white/5"}
        ${isMajor ? "col-span-2" : "col-span-1"}`}
    >
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isMajor ? "text-yellow-400" : "text-muted-foreground"}`}>
        {isMajor ? "★ " : "◆ "}{label}
      </p>
      {artifact ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs truncate">{artifact.name}</p>
            <p className={`text-[10px] ${RARITY_TEXT[artifact.rarity] ?? "text-muted-foreground"}`}>
              {artifact.rarity} · +{Math.round(RARITY_POWER[artifact.rarity] ?? 0) * (isMajor ? 1 : 0.5)} pts
            </p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <p className={`text-xs ${isSelecting ? "text-primary" : "text-muted-foreground"}`}>
          {isSelecting ? "Select from collection below ↓" : "Tap to equip"}
        </p>
      )}
    </div>
  );
}

// ── Main Battle Page ──────────────────────────────────────────────────────────
export default function BattlePage() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>("select");
  const [selectedHatchling, setSelectedHatchling] = useState<Hatchling | null>(null);
  const [mode, setMode] = useState<"casual" | "ranked">("casual");
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [yourSlot, setYourSlot] = useState<1 | 2>(1);
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(null);
  const [rewards, setRewards] = useState<{ xp: number; coins: number; eloChange: number } | null>(null);
  const [artifactXpGains, setArtifactXpGains] = useState<ArtifactXpGain[]>([]);
  const [queueSecs, setQueueSecs] = useState(0);
  const [rewardSummary, setRewardSummary] = useState<{ open: boolean; entries: RewardEntry[]; title?: string }>({ open: false, entries: [] });

  // Loadout state
  const [loadoutSlots, setLoadoutSlots] = useState<LoadoutSlots>({ major: null, minor1: null, minor2: null });
  const [selectingSlot, setSelectingSlot] = useState<"major" | "minor1" | "minor2" | null>(null);
  const [showBuildsSheet, setShowBuildsSheet] = useState(false);
  const [buildNameInput, setBuildNameInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const queueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: hatchlings = [] } = useQuery<Hatchling[]>({
    queryKey: ["hatchlings-battle", pid],
    queryFn: () => fetch(`${BASE}/api/hatchlings?playerId=${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const { data: player } = useQuery<{ level: number; battleElo: number }>({
    queryKey: ["player-battle", pid],
    queryFn: () => fetch(`${BASE}/api/players/${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const { data: history = [] } = useQuery<{ id: number; opponent: string; opponentPlayerId: number | null; opponentUsername: string | null; opponentDisplayName: string | null; viewerWon: boolean; myHatchling: string; createdAt: string; battleMode: string }[]>({
    queryKey: ["battle-history", pid],
    queryFn: () => fetch(`${BASE}/api/battles/history`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const { data: ownedArtifacts = [] } = useQuery<OwnedArtifact[]>({
    queryKey: ["owned-artifacts-loadout", pid],
    queryFn: () =>
      fetch(`${BASE}/api/players/me/artifacts`, { credentials: "include" })
        .then(r => r.json())
        .then((list: { id: number; name: string; rarity: string; imageSlug: string }[]) =>
          list.map(a => ({ id: a.id, name: a.name, rarity: a.rarity, imageSlug: a.imageSlug }))
        ),
    enabled: !!pid && phase === "loadout",
  });

  const { data: savedBuilds = [], refetch: refetchBuilds } = useQuery<SavedBuild[]>({
    queryKey: ["saved-builds", pid],
    queryFn: () => fetch(`${BASE}/api/artifacts/builds`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid && showBuildsSheet,
  });

  const { data: battleXpEntries = [] } = useQuery<ArtifactBattleXpEntry[]>({
    queryKey: ["artifact-battle-xp", pid],
    queryFn: () => fetch(`${BASE}/api/artifacts/battle-xp`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid && phase === "result",
  });

  // Load active loadout when entering loadout phase
  useEffect(() => {
    if (phase === "loadout" && selectedHatchling && pid) {
      fetch(`${BASE}/api/artifacts/loadout/${selectedHatchling.id}`, { credentials: "include" })
        .then(r => r.json())
        .then((data: { majorArtifactId?: number | null; minorArtifact1Id?: number | null; minorArtifact2Id?: number | null }) => {
          // Will resolve artifacts from owned list after those load
          const pending = { maj: data.majorArtifactId, min1: data.minorArtifact1Id, min2: data.minorArtifact2Id };
          if (pending.maj || pending.min1 || pending.min2) {
            // Store pending IDs to resolve when ownedArtifacts loads
            (window as unknown as { _pendingLoadout: typeof pending })._pendingLoadout = pending;
          }
        })
        .catch(() => {});
    }
  }, [phase, selectedHatchling, pid]);

  // Resolve pending loadout once owned artifacts are loaded
  useEffect(() => {
    const pending = (window as unknown as { _pendingLoadout?: { maj?: number | null; min1?: number | null; min2?: number | null } })._pendingLoadout;
    if (pending && ownedArtifacts.length > 0) {
      const find = (id?: number | null) => ownedArtifacts.find(a => a.id === id) ?? null;
      setLoadoutSlots({
        major:  find(pending.maj),
        minor1: find(pending.min1),
        minor2: find(pending.min2),
      });
      delete (window as unknown as { _pendingLoadout?: unknown })._pendingLoadout;
    }
  }, [ownedArtifacts]);

  // ── WS connection ─────────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!pid) return;
    fetch(`${BASE}/api/battles/ws-token`, { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then(({ token }: { token: string }) => {
        const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProto}//${window.location.host}${BASE}/api/ws/battle?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (selectedHatchling) {
            ws.send(JSON.stringify({ type: "join_queue", hatchlingId: selectedHatchling.id, mode }));
          }
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string) as { type: string; [k: string]: unknown };
            handleWsMessage(msg);
          } catch { /* ignore */ }
        };

        ws.onerror = () => {
          toast({ title: "Connection error", description: "Battle connection failed.", variant: "destructive" });
          setPhase("select");
        };

        ws.onclose = () => {
          if (queueTimerRef.current) clearInterval(queueTimerRef.current);
        };
      })
      .catch(() => {
        toast({ title: "Connection error", description: "Could not authenticate battle session.", variant: "destructive" });
        setPhase("select");
      });
  }, [pid, selectedHatchling, mode]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function handleWsMessage(msg: { type: string; [k: string]: unknown }) {
    if (msg.type === "battle_start") {
      if (queueTimerRef.current) clearInterval(queueTimerRef.current);
      const slot = Number(msg.yourSlot) as 1 | 2;
      setYourSlot(slot);
      setBattleState(msg.state as BattleState);
      setPhase("battle");
    }
    if (msg.type === "battle_state") {
      const newState = msg.state as BattleState;
      setBattleState(prev => {
        const prevTurns = prev?.turns.length ?? 0;
        const newTurns  = newState.turns;
        if (newTurns.length > prevTurns) setLastTurn(newTurns[newTurns.length - 1] ?? null);
        return newState;
      });
    }
    if (msg.type === "battle_end") {
      const endState = msg.state as BattleState;
      setBattleState(endState);
      const r = {
        xp:        (msg.rewards as { xp: number }).xp,
        coins:     (msg.rewards as { coins: number }).coins,
        eloChange: Number(msg.eloChange ?? 0),
      };
      setRewards(r);
      const gains = (msg.artifactXp as ArtifactXpGain[] | undefined) ?? [];
      setArtifactXpGains(gains);
      setLastTurn(null);
      setPhase("result");

      // Show the unified reward summary modal whenever the viewer wins, so
      // battle victories funnel through the same celebratory loop as
      // activity logs, meal logs, and challenge progress.
      const viewerWonBattle = endState.winner === yourSlot;
      if (viewerWonBattle) {
        const entries: RewardEntry[] = [];
        if (r.xp > 0)    entries.push({ kind: "xp",          label: "Battle XP",  value: r.xp,    detail: "Granted to your Hatchling." });
        if (r.coins > 0) entries.push({ kind: "artifact",    label: "Coins",      value: r.coins });
        if (endState.mode === "ranked" && r.eloChange !== 0) {
          entries.push({
            kind: "leaderboard",
            label: "ELO change",
            value: (r.eloChange > 0 ? "+" : "") + r.eloChange,
            detail: r.eloChange > 0 ? "Climbed the ranked ladder." : "Setback — bounce back next match.",
          });
        }
        let stageUps = 0;
        for (const g of gains) {
          if (g.xpGained > 0) entries.push({ kind: "artifact", label: `Artifact #${g.artifactId} XP`, value: g.xpGained });
          if (g.newStage > 1) stageUps += 1;
        }
        if (stageUps > 0) entries.push({ kind: "hatchling", label: `${stageUps} artifact stage-up${stageUps === 1 ? "" : "s"}`, detail: "Power scaled up." });
        if (entries.length === 0) entries.push({ kind: "xp", label: "Victory!", detail: "GG — keep the streak alive." });
        setRewardSummary({ open: true, entries, title: "Victory Rewards" });
      }
    }
    if (msg.type === "error") {
      toast({ title: "Battle error", description: String(msg.message), variant: "destructive" });
    }
  }

  // Queue timer
  useEffect(() => {
    if (phase === "queue") {
      setQueueSecs(0);
      queueTimerRef.current = setInterval(() => setQueueSecs(s => s + 1), 1000);
    } else {
      if (queueTimerRef.current) clearInterval(queueTimerRef.current);
    }
    return () => { if (queueTimerRef.current) clearInterval(queueTimerRef.current); };
  }, [phase]);

  useEffect(() => { return () => { wsRef.current?.close(); }; }, []);

  // ── Phase navigation ──────────────────────────────────────────────────────
  function goToLoadout() {
    if (!selectedHatchling || !pid) return;
    setPhase("loadout");
  }

  async function confirmLoadout() {
    if (!selectedHatchling || !pid) return;
    // Save loadout to API
    try {
      await fetch(`${BASE}/api/artifacts/loadout/${selectedHatchling.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          majorArtifactId:  loadoutSlots.major?.id  ?? null,
          minorArtifact1Id: loadoutSlots.minor1?.id ?? null,
          minorArtifact2Id: loadoutSlots.minor2?.id ?? null,
        }),
      });
    } catch {
      // Non-fatal: still allow joining queue
    }
    setPhase("queue");
    connectWs();
  }

  function skipLoadout() {
    setPhase("queue");
    connectWs();
  }

  function leaveQueue() {
    wsRef.current?.send(JSON.stringify({ type: "leave_queue" }));
    wsRef.current?.close();
    wsRef.current = null;
    setPhase("select");
  }

  function sendMove(move: MoveType) {
    if (!battleState) return;
    wsRef.current?.send(JSON.stringify({ type: "player_move", battleId: battleState.battleId, move }));
  }

  function resetBattle() {
    wsRef.current?.close();
    wsRef.current = null;
    setBattleState(null);
    setLastTurn(null);
    setRewards(null);
    setArtifactXpGains([]);
    setSelectedHatchling(null);
    setLoadoutSlots({ major: null, minor1: null, minor2: null });
    setSelectingSlot(null);
    setPhase("select");
  }

  // ── Loadout helpers ───────────────────────────────────────────────────────
  function assignArtifact(artifact: OwnedArtifact) {
    if (!selectingSlot) return;
    // Remove from any slot it might already occupy
    setLoadoutSlots(prev => {
      const next = { ...prev };
      if (next.major?.id  === artifact.id) next.major  = null;
      if (next.minor1?.id === artifact.id) next.minor1 = null;
      if (next.minor2?.id === artifact.id) next.minor2 = null;
      next[selectingSlot] = artifact;
      return next;
    });
    setSelectingSlot(null);
  }

  function clearSlot(slot: "major" | "minor1" | "minor2") {
    setLoadoutSlots(prev => ({ ...prev, [slot]: null }));
  }

  async function saveBuild() {
    if (!buildNameInput.trim() || !selectedHatchling) return;
    try {
      await fetch(`${BASE}/api/artifacts/builds`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hatchlingId:      selectedHatchling.id,
          buildName:        buildNameInput.trim(),
          majorArtifactId:  loadoutSlots.major?.id  ?? null,
          minorArtifact1Id: loadoutSlots.minor1?.id ?? null,
          minorArtifact2Id: loadoutSlots.minor2?.id ?? null,
        }),
      });
      setBuildNameInput("");
      refetchBuilds();
      toast({ title: "Build saved!", description: `"${buildNameInput.trim()}" saved.` });
    } catch {
      toast({ title: "Error", description: "Could not save build.", variant: "destructive" });
    }
  }

  async function deleteBuild(id: number, name: string) {
    try {
      await fetch(`${BASE}/api/artifacts/builds/${id}`, { method: "DELETE", credentials: "include" });
      refetchBuilds();
      toast({ title: "Deleted", description: `Build "${name}" removed.` });
    } catch {
      toast({ title: "Error", description: "Could not delete build.", variant: "destructive" });
    }
  }

  function loadBuild(build: SavedBuild) {
    const find = (id: number | null) => ownedArtifacts.find(a => a.id === id) ?? null;
    setLoadoutSlots({
      major:  find(build.majorArtifactId),
      minor1: find(build.minorArtifact1Id),
      minor2: find(build.minorArtifact2Id),
    });
    setShowBuildsSheet(false);
    toast({ title: "Build loaded", description: `"${build.buildName}" applied.` });
  }

  const powerScore    = computePowerScore(loadoutSlots);
  const myFighter     = battleState ? (yourSlot === 1 ? battleState.fighter1 : battleState.fighter2) : null;
  const opponentFighter = battleState ? (yourSlot === 1 ? battleState.fighter2 : battleState.fighter1) : null;
  const isMyTurn      = battleState?.currentSlot === yourSlot && battleState.phase === "active";
  const viewerWon     = battleState ? battleState.winner === yourSlot : false;

  // Artifacts in the slot that are "assigned" (for greying-out in the picker)
  const assignedIds = new Set([
    loadoutSlots.major?.id,
    loadoutSlots.minor1?.id,
    loadoutSlots.minor2?.id,
  ].filter(Boolean) as number[]);

  // Sort owned artifacts: higher rarity first
  const rarityOrder = ["Celestial", "Ancient", "Mythic", "Legendary", "Epic", "Rare", "Common"];
  const sortedArtifacts = [...ownedArtifacts].sort((a, b) =>
    rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity)
  );

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 px-2">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5 pt-4">
          <button
            onClick={() => {
              if (phase === "select") setLocation("/compete");
              else if (phase === "loadout") setPhase("select");
              else resetBattle();
            }}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-black text-2xl flex items-center gap-2">
              <Swords className="w-5 h-5 text-primary" /> Battle Arena
            </h1>
            {player && (
              <p className="text-xs text-muted-foreground">
                ELO: <span className="text-yellow-400 font-bold">{player.battleElo}</span>
              </p>
            )}
          </div>
          {phase === "loadout" && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Power:</span>
              <span className={`text-sm font-black ${powerScore > 80 ? "text-yellow-400" : powerScore > 30 ? "text-purple-400" : "text-muted-foreground"}`}>
                {powerScore.toFixed(0)}
              </span>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">

          {/* ── SELECT HATCHLING ── */}
          {phase === "select" && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="flex gap-2">
                {(["casual", "ranked"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={m === "ranked" && (player?.level ?? 0) < 10}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all capitalize border
                      ${mode === m ? "bg-primary border-primary text-white" : "border-white/10 text-muted-foreground hover:border-white/30"}
                      disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {m} {m === "ranked" && (player?.level ?? 0) < 10 && "(Lv.10+)"}
                  </button>
                ))}
              </div>

              <p className="text-sm text-muted-foreground font-medium">Choose your Hatchling:</p>

              <div className="grid grid-cols-2 gap-3">
                {hatchlings.map(h => {
                  const sel = selectedHatchling?.id === h.id;
                  const realmKey = h.realm ?? "balance";
                  const gradient = REALM_COLOR[realmKey] ?? REALM_COLOR["balance"]!;
                  return (
                    <motion.button
                      key={h.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedHatchling(h)}
                      className={`rounded-2xl border-2 p-4 text-left transition-all
                        ${sel ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
                    >
                      <div className={`w-full h-20 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3`}>
                        <span className="text-4xl">{REALM_EMOJI[realmKey] ?? "🐣"}</span>
                      </div>
                      <p className="font-black text-sm truncate">{h.name}</p>
                      <p className="text-xs text-muted-foreground">Lv.{h.level} · {h.rarity}</p>
                      <p className="text-[10px] mt-1 capitalize text-muted-foreground">{realmKey} realm</p>
                    </motion.button>
                  );
                })}
                {hatchlings.length === 0 && (
                  <div className="col-span-2 text-center py-10 text-muted-foreground">
                    <p className="text-4xl mb-3">🥚</p>
                    <p className="font-bold">No Hatchlings yet — hatch one first!</p>
                  </div>
                )}
              </div>

              {selectedHatchling && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Button onClick={goToLoadout} className="w-full h-14 font-black text-lg bg-gradient-to-r from-primary to-purple-600 rounded-2xl shadow-primary/30 shadow-lg">
                    <Swords className="w-5 h-5 mr-2" /> Equip Artifacts & Find Battle
                  </Button>
                </motion.div>
              )}

              {history.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Battles</p>
                  {history.slice(0, 5).map(b => (
                    <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${b.viewerWon ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                      <span className="text-lg">{b.viewerWon ? "🏆" : "💀"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">
                          {b.viewerWon ? "Victory" : "Defeat"} vs{" "}
                          {b.opponentPlayerId ? (
                            <Link
                              href={`/players/${b.opponentPlayerId}`}
                              className="hover:text-primary transition-colors"
                              data-testid={`link-profile-${b.opponentPlayerId}`}
                            >
                              {b.opponentDisplayName ?? b.opponentUsername ?? b.opponent}
                            </Link>
                          ) : (
                            b.opponent
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{b.myHatchling} · {b.battleMode}</p>
                      </div>
                      <span className={`text-xs font-bold ${b.viewerWon ? "text-green-400" : "text-red-400"}`}>
                        {b.viewerWon ? "WIN" : "LOSS"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── LOADOUT PHASE ── */}
          {phase === "loadout" && selectedHatchling && (
            <motion.div key="loadout" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-black text-lg">Equip Artifacts</h2>
                  <p className="text-xs text-muted-foreground">{selectedHatchling.name} · {mode} battle</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowBuildsSheet(true)}
                >
                  <Bookmark className="w-3.5 h-3.5" /> Saved Builds
                </Button>
              </div>

              {/* Slot selection grid */}
              <div className="grid grid-cols-2 gap-2">
                <LoadoutSlotCard
                  label="Major Artifact (full bonus)"
                  slotType="major"
                  artifact={loadoutSlots.major}
                  isSelecting={selectingSlot === "major"}
                  onSelect={() => setSelectingSlot(selectingSlot === "major" ? null : "major")}
                  onClear={() => clearSlot("major")}
                />
                <LoadoutSlotCard
                  label="Minor I (½ bonus)"
                  slotType="minor1"
                  artifact={loadoutSlots.minor1}
                  isSelecting={selectingSlot === "minor1"}
                  onSelect={() => setSelectingSlot(selectingSlot === "minor1" ? null : "minor1")}
                  onClear={() => clearSlot("minor1")}
                />
                <LoadoutSlotCard
                  label="Minor II (½ bonus)"
                  slotType="minor2"
                  artifact={loadoutSlots.minor2}
                  isSelecting={selectingSlot === "minor2"}
                  onSelect={() => setSelectingSlot(selectingSlot === "minor2" ? null : "minor2")}
                  onClear={() => clearSlot("minor2")}
                />
              </div>

              {/* Power score bar */}
              {powerScore > 0 && (
                <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                  <Star className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Loadout Power</span>
                      <span className={`font-bold ${powerScore >= 80 ? "text-yellow-400" : powerScore >= 30 ? "text-purple-400" : "text-white"}`}>
                        {powerScore.toFixed(0)} pts
                      </span>
                    </div>
                    <Progress value={Math.min(100, (powerScore / 200) * 100)} className="h-1.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-purple-500 [&>div]:to-yellow-400" />
                  </div>
                </div>
              )}

              {/* Artifact collection picker */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  {selectingSlot ? `Select artifact for ${selectingSlot === "major" ? "Major" : selectingSlot === "minor1" ? "Minor I" : "Minor II"} slot` : "Your Collection"}
                </p>

                {ownedArtifacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-3xl mb-2">🗃️</p>
                    <p className="text-sm">No artifacts yet — complete fitness milestones to earn them!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {sortedArtifacts.map(artifact => {
                      const isAssigned = assignedIds.has(artifact.id);
                      const border = RARITY_BORDER[artifact.rarity] ?? "border-white/10";
                      const glow   = RARITY_GLOW[artifact.rarity] ?? "";
                      const bg     = RARITY_BG[artifact.rarity] ?? "bg-white/5";
                      return (
                        <motion.button
                          key={artifact.id}
                          whileHover={!isAssigned && !!selectingSlot ? { scale: 1.02 } : {}}
                          whileTap={!isAssigned && !!selectingSlot ? { scale: 0.97 } : {}}
                          onClick={() => {
                            if (isAssigned) return;
                            if (selectingSlot) assignArtifact(artifact);
                            else {
                              // Auto-assign to next empty slot
                              if (!loadoutSlots.major) setLoadoutSlots(p => ({ ...p, major: artifact }));
                              else if (!loadoutSlots.minor1) setLoadoutSlots(p => ({ ...p, minor1: artifact }));
                              else if (!loadoutSlots.minor2) setLoadoutSlots(p => ({ ...p, minor2: artifact }));
                            }
                          }}
                          className={`text-left p-2.5 rounded-xl border-2 transition-all
                            ${border} ${bg}
                            ${isAssigned ? "opacity-40 cursor-not-allowed" : `${glow} hover:opacity-90 cursor-pointer`}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-bold uppercase ${RARITY_TEXT[artifact.rarity] ?? "text-muted-foreground"}`}>
                              {artifact.rarity}
                            </span>
                            {isAssigned && <span className="text-[10px] text-muted-foreground">✓ Equipped</span>}
                          </div>
                          <p className="font-bold text-xs leading-tight truncate">{artifact.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            +{RARITY_POWER[artifact.rarity] ?? 0} pts
                          </p>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={skipLoadout} className="flex-1 rounded-xl">
                  Skip (no artifacts)
                </Button>
                <Button onClick={confirmLoadout} className="flex-1 bg-gradient-to-r from-primary to-purple-600 rounded-xl font-black">
                  <Swords className="w-4 h-4 mr-1.5" /> Find Battle
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── QUEUE ── */}
          {phase === "queue" && (
            <motion.div key="queue" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-20 space-y-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full mx-auto"
              />
              <div>
                <p className="font-black text-2xl mb-1">Finding opponent…</p>
                <p className="text-muted-foreground text-sm">
                  {queueSecs < 30 ? `Searching… ${queueSecs}s` : "Matched with a bot opponent!"}
                </p>
                {powerScore > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Loadout power: <span className="text-purple-400 font-bold">{powerScore.toFixed(0)}</span>
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">You'll be matched with a bot if no one is found in 30 seconds.</p>
              <Button variant="outline" onClick={leaveQueue} className="rounded-full">Cancel</Button>
            </motion.div>
          )}

          {/* ── BATTLE ── */}
          {phase === "battle" && battleState && myFighter && opponentFighter && (
            <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Turn {battleState.turnNumber}</span>
                <span className={`font-bold ${isMyTurn ? "text-primary animate-pulse" : "text-muted-foreground"}`}>
                  {isMyTurn ? "⚔️ Your turn!" : "⏳ Waiting…"}
                </span>
                <span>{battleState.mode} battle</span>
              </div>

              <div className="flex gap-3">
                <FighterPanel
                  fighter={yourSlot === 1 ? battleState.fighter1 : battleState.fighter2}
                  isActive={isMyTurn}
                  isPlayer={true}
                  lastTurn={lastTurn}
                  yourSlot={yourSlot}
                  slot={yourSlot}
                />
                <div className="flex items-center justify-center text-2xl font-black text-muted-foreground px-1">VS</div>
                <FighterPanel
                  fighter={yourSlot === 1 ? battleState.fighter2 : battleState.fighter1}
                  isActive={!isMyTurn && battleState.phase === "active"}
                  isPlayer={false}
                  lastTurn={lastTurn}
                  yourSlot={yourSlot}
                  slot={yourSlot === 1 ? 2 : 1}
                />
              </div>

              <AnimatePresence>
                {isMyTurn && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="grid grid-cols-2 gap-2 mt-2"
                  >
                    {MOVES.map(mv => {
                      const isSpecialCd = mv.type === "special_move" && myFighter.specialCooldown > 0;
                      const isItemUsed  = mv.type === "use_item" && myFighter.itemUsed;
                      const noEnergy    = myFighter.energy < mv.cost;
                      const disabled    = isSpecialCd || isItemUsed || (noEnergy && mv.type !== "basic_attack");
                      return (
                        <motion.button
                          key={mv.type}
                          whileHover={disabled ? {} : { scale: 1.03 }}
                          whileTap={disabled ? {} : { scale: 0.96 }}
                          onClick={() => !disabled && sendMove(mv.type)}
                          disabled={disabled}
                          className={`${mv.color} disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-3 text-left transition-all shadow-sm`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {mv.icon}
                            <span className="font-black text-sm">{mv.label}</span>
                            <span className="ml-auto text-[10px] opacity-80">⚡{mv.cost}</span>
                          </div>
                          <p className="text-[10px] opacity-75">
                            {isSpecialCd ? `Cooldown: ${myFighter.specialCooldown}t` : isItemUsed ? "Used" : mv.desc}
                          </p>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {battleState.turns.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Battle Log</p>
                  {battleState.turns.slice(-3).reverse().map(t => (
                    <div key={t.turnNumber} className="text-[11px] text-muted-foreground flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5">
                      <span>{t.actingSlot === yourSlot ? "You" : "Opponent"}</span>
                      <span className="text-white/50">used</span>
                      <span className="capitalize font-medium text-white/70">{t.move.replace("_", " ")}</span>
                      {t.damage  > 0 && <span className="ml-auto text-red-400">-{t.damage} HP {t.isCrit ? "⚡" : ""}{t.isSuper ? "🔥" : ""}</span>}
                      {t.healing > 0 && <span className="ml-auto text-green-400">+{t.healing} HP</span>}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {phase === "result" && battleState && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.85, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="text-center py-8 space-y-6"
            >
              {viewerWon && Array.from({ length: 10 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{ backgroundColor: ["#ff2d55","#ffcc00","#7f00ff","#00e5ff"][i % 4], left: "50%", top: "40%" }}
                  initial={{ scale: 0, x: 0, y: 0 }}
                  animate={{ scale: [0, 1, 0], x: Math.cos(i / 10 * Math.PI * 2) * 140, y: Math.sin(i / 10 * Math.PI * 2) * 140 }}
                  transition={{ duration: 1, delay: 0.1 }}
                />
              ))}

              <motion.div
                animate={viewerWon ? { rotate: [0, -5, 5, -5, 5, 0] } : {}}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-8xl"
              >
                {viewerWon ? "🏆" : "💀"}
              </motion.div>

              <div>
                <motion.h2
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className={`font-black text-4xl ${viewerWon ? "text-yellow-400" : "text-red-400"}`}
                >
                  {viewerWon ? "Victory!" : battleState.winner === 0 ? "Draw!" : "Defeated!"}
                </motion.h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  vs{" "}
                  {opponentFighter?.isBot ? (
                    <span className="font-medium">Bot 🤖</span>
                  ) : opponentFighter && opponentFighter.playerId > 0 ? (
                    <>
                      <span className="font-medium">{opponentFighter.hatchlingName}</span>
                      {" · "}
                      <Link
                        href={`/players/${opponentFighter.playerId}`}
                        className="font-medium text-primary hover:underline"
                        data-testid={`link-result-opponent-profile-${opponentFighter.playerId}`}
                      >
                        @{opponentFighter.playerDisplayName ?? opponentFighter.playerUsername ?? `Player #${opponentFighter.playerId}`}
                      </Link>
                    </>
                  ) : (
                    <span className="font-medium">{opponentFighter?.hatchlingName ?? "Bot"}</span>
                  )}
                </p>
              </div>

              {rewards && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex gap-4 justify-center flex-wrap"
                >
                  <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">XP Earned</p>
                    <p className="font-black text-3xl text-green-400">+{rewards.xp}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Coins</p>
                    <p className="font-black text-3xl text-yellow-400">+{rewards.coins}</p>
                  </div>
                  {battleState.mode === "ranked" && rewards.eloChange !== 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">ELO</p>
                      <p className={`font-black text-3xl ${rewards.eloChange > 0 ? "text-cyan-400" : "text-red-400"}`}>
                        {rewards.eloChange > 0 ? "+" : ""}{rewards.eloChange}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Artifact XP gains */}
              {(artifactXpGains.length > 0 || battleXpEntries.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 text-left"
                >
                  <p className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-yellow-400" /> Artifact XP
                  </p>
                  <div className="space-y-2">
                    {artifactXpGains.map((gain, i) => {
                      const entry = battleXpEntries.find(e => e.artifactId === gain.artifactId);
                      const rarity = entry?.rarity ?? "";
                      const stageUp = gain.newStage > ((entry?.evolutionStage ?? gain.newStage) - 1) && gain.newStage > 0;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${RARITY_BG[rarity] ?? "bg-white/20"} border ${RARITY_BORDER[rarity] ?? "border-white/20"}`} />
                          <span className="text-xs flex-1 truncate">{entry?.artifactName ?? `Artifact #${gain.artifactId}`}</span>
                          <span className={`text-xs font-bold ${RARITY_TEXT[rarity] ?? "text-muted-foreground"}`}>
                            +{gain.xpGained} XP
                          </span>
                          {stageUp && (
                            <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold">
                              Stage {gain.newStage} ↑
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {artifactXpGains.length === 0 && battleXpEntries.length > 0 && (
                      <p className="text-xs text-muted-foreground">No artifacts were equipped this battle.</p>
                    )}
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4 text-left text-sm space-y-1"
              >
                <p className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">Battle Summary</p>
                <p>Turns played: <span className="font-bold">{battleState.turnNumber}</span></p>
                <p>My Hatchling: <span className="font-bold">{myFighter?.hatchlingName}</span></p>
                <p>
                  Opponent:{" "}
                  <span className="font-bold">{opponentFighter?.hatchlingName ?? "Bot"} {opponentFighter?.isBot ? "🤖" : ""}</span>
                  {opponentFighter && !opponentFighter.isBot && opponentFighter.playerId > 0 && (
                    <>
                      {" "}·{" "}
                      <Link
                        href={`/players/${opponentFighter.playerId}`}
                        className="font-bold text-primary hover:underline"
                        data-testid={`link-summary-opponent-profile-${opponentFighter.playerId}`}
                      >
                        @{opponentFighter.playerDisplayName ?? opponentFighter.playerUsername ?? `Player #${opponentFighter.playerId}`}
                      </Link>
                    </>
                  )}
                </p>
                <p>Result: <span className={`font-bold ${viewerWon ? "text-green-400" : "text-red-400"}`}>{viewerWon ? "WIN" : battleState.winner === 0 ? "DRAW" : "LOSS"}</span></p>
                {myFighter && myFighter.artifactPowerScore > 0 && (
                  <p>Artifact Power: <span className="font-bold text-purple-400">{myFighter.artifactPowerScore.toFixed(0)} pts</span></p>
                )}
              </motion.div>

              <div className="flex gap-3 flex-wrap">
                <Button onClick={resetBattle} className="flex-1 font-bold rounded-2xl" size="lg">
                  <RotateCcw className="w-4 h-4 mr-2" /> Battle Again
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 font-bold rounded-2xl"
                  size="lg"
                  onClick={() => {
                    const text = [
                      `⚔️ HatchUp Battle Result`,
                      `${viewerWon ? "🏆 VICTORY" : battleState?.winner === 0 ? "🤝 DRAW" : "💀 DEFEAT"}`,
                      `My Hatchling: ${myFighter?.hatchlingName ?? "?"}`,
                      `Opponent: ${opponentFighter?.hatchlingName ?? "Bot"}${
                        opponentFighter && !opponentFighter.isBot && opponentFighter.playerId > 0
                          ? ` (@${opponentFighter.playerDisplayName ?? opponentFighter.playerUsername ?? `Player #${opponentFighter.playerId}`})`
                          : opponentFighter?.isBot ? " 🤖" : ""
                      }`,
                      `Turns: ${battleState?.turnNumber ?? 0}`,
                      rewards ? `XP: +${rewards.xp}  Coins: +${rewards.coins}` : "",
                      battleState?.mode === "ranked" && rewards?.eloChange
                        ? `ELO: ${rewards.eloChange > 0 ? "+" : ""}${rewards.eloChange}`
                        : "",
                      `#HatchUp #BattleArena`,
                    ].filter(Boolean).join("\n");
                    if (navigator.share) {
                      navigator.share({ title: "HatchUp Battle", text }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(text).then(() => {
                        toast({ title: "Copied!", description: "Battle result copied to clipboard." });
                      });
                    }
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
                <Button onClick={() => setLocation("/compete")} variant="ghost" className="flex-1 font-bold rounded-2xl" size="lg">
                  <Trophy className="w-4 h-4 mr-2" /> Arena
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Unified reward summary — fires on every battle win */}
      <RewardSummaryModal
        open={rewardSummary.open}
        onClose={() => setRewardSummary({ open: false, entries: [] })}
        title={rewardSummary.title ?? "Victory Rewards"}
        rewards={rewardSummary.entries}
      />

      {/* ── Saved Builds Sheet ─────────────────────────────────────────────── */}
      <Sheet open={showBuildsSheet} onOpenChange={setShowBuildsSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-primary" /> Saved Builds
            </SheetTitle>
          </SheetHeader>

          {/* Save current build */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Save current loadout as a build:</p>
            <div className="flex gap-2">
              <Input
                placeholder="Build name…"
                value={buildNameInput}
                onChange={e => setBuildNameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveBuild()}
                className="flex-1 text-sm"
                maxLength={40}
              />
              <Button size="sm" onClick={saveBuild} disabled={!buildNameInput.trim() || !selectedHatchling}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Existing builds for this hatchling */}
          {savedBuilds.filter(b => b.hatchlingId === selectedHatchling?.id && b.buildName !== "Active").length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No saved builds yet.</p>
          ) : (
            <div className="space-y-2">
              {savedBuilds
                .filter(b => b.hatchlingId === selectedHatchling?.id && b.buildName !== "Active")
                .map(build => (
                  <div key={build.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{build.buildName}</p>
                      <p className="text-[11px] text-muted-foreground">Power: {build.powerScore.toFixed(0)} pts</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => loadBuild(build)} className="text-xs">
                      Load
                    </Button>
                    <button onClick={() => deleteBuild(build.id, build.buildName)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
