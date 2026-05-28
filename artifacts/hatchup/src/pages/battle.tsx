import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Swords, Zap, Shield, Sparkles, Trophy, RotateCcw, ChevronLeft, Share2 } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Type defs ─────────────────────────────────────────────────────────────────
interface FighterState {
  playerId: number;
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

type MoveType = "basic_attack" | "special_move" | "defend" | "use_item";
type Phase = "select" | "queue" | "battle" | "result";

const REALM_EMOJI: Record<string, string> = {
  strength: "💪",
  cardio: "🏃",
  balance: "🧘",
  beast: "🐉",
  mythic: "✨",
};

const REALM_COLOR: Record<string, string> = {
  strength: "from-red-600 to-orange-500",
  cardio: "from-cyan-600 to-blue-500",
  balance: "from-green-600 to-teal-500",
  beast: "from-purple-600 to-violet-500",
  mythic: "from-yellow-500 to-pink-500",
};

const MOVES: { type: MoveType; label: string; icon: React.ReactNode; cost: number; desc: string; color: string }[] = [
  { type: "basic_attack", label: "Strike", icon: <Swords className="w-4 h-4" />, cost: 10, desc: "Reliable hit", color: "bg-blue-600 hover:bg-blue-500" },
  { type: "special_move", label: "Special", icon: <Sparkles className="w-4 h-4" />, cost: 25, desc: "2× power, 3-turn cooldown", color: "bg-purple-600 hover:bg-purple-500" },
  { type: "defend", label: "Defend", icon: <Shield className="w-4 h-4" />, cost: 12, desc: "Reduce incoming damage", color: "bg-green-600 hover:bg-green-500" },
  { type: "use_item", label: "Heal", icon: <Zap className="w-4 h-4" />, cost: 20, desc: "Restore 30% HP (once)", color: "bg-yellow-600 hover:bg-yellow-500" },
];

// ── DamageNumber pop-up ──────────────────────────────────────────────────────
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

// ── Fighter Panel ────────────────────────────────────────────────────────────
function FighterPanel({
  fighter,
  isActive,
  isPlayer,
  lastTurn,
  yourSlot,
  slot,
}: {
  fighter: FighterState;
  isActive: boolean;
  isPlayer: boolean;
  lastTurn: TurnResult | null;
  yourSlot: 1 | 2;
  slot: 1 | 2;
}) {
  const hpPct = Math.max(0, (fighter.currentHp / fighter.maxHp) * 100);
  const energyPct = Math.max(0, (fighter.energy / fighter.maxEnergy) * 100);
  const realmKey = fighter.realm ?? "balance";
  const gradient = REALM_COLOR[realmKey] ?? REALM_COLOR["balance"]!;

  const showDamage = lastTurn && lastTurn.actingSlot !== slot && lastTurn.damage > 0;
  const showHeal = lastTurn && lastTurn.actingSlot === slot && lastTurn.healing > 0;

  return (
    <motion.div
      animate={isActive ? { boxShadow: ["0 0 0px #fff0", "0 0 18px #fff8", "0 0 0px #fff0"] } : {}}
      transition={{ repeat: Infinity, duration: 1.5 }}
      className={`relative flex-1 rounded-2xl border-2 p-4 transition-all
        ${isActive ? "border-primary" : "border-white/10"} bg-black/40`}
    >
      {/* Active turn indicator */}
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          {isPlayer ? "Your turn" : "Opponent"}
        </div>
      )}

      {/* Hatchling avatar */}
      <div className={`w-full h-24 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 relative overflow-hidden`}>
        <span className="text-5xl select-none">{REALM_EMOJI[realmKey] ?? "🐣"}</span>
        {fighter.defenseBonus > 0 && (
          <div className="absolute bottom-1 right-1 bg-green-500/80 rounded px-1 text-[10px] font-bold text-white">🛡 DEF</div>
        )}
        {/* Damage/heal pop-up */}
        <AnimatePresence>
          {showDamage && (
            <DamagePopup key={`dmg-${lastTurn!.turnNumber}`} value={lastTurn!.damage} isCrit={lastTurn!.isCrit} isHeal={false} isSuper={lastTurn!.isSuper} />
          )}
          {showHeal && (
            <DamagePopup key={`heal-${lastTurn!.turnNumber}`} value={lastTurn!.healing} isCrit={false} isHeal={true} isSuper={false} />
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="font-black text-sm truncate">{fighter.hatchlingName}</p>
          <Badge variant="secondary" className="text-[10px] px-1.5">Lv.{fighter.hatchlingLevel}</Badge>
        </div>

        {/* HP bar */}
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>HP</span>
            <span>{fighter.currentHp}/{fighter.maxHp}</span>
          </div>
          <motion.div animate={{ width: `${hpPct}%` }} transition={{ duration: 0.5 }}>
            <Progress value={hpPct} className="h-2.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-green-400 [&>div]:to-emerald-500" />
          </motion.div>
        </div>

        {/* Energy bar */}
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>⚡ Energy</span>
            <span>{fighter.energy}/{fighter.maxEnergy}</span>
          </div>
          <Progress value={energyPct} className="h-1.5 bg-white/10 [&>div]:bg-blue-400" />
        </div>

        <div className="flex gap-1 flex-wrap">
          <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground capitalize">{realmKey}</span>
          {fighter.specialCooldown > 0 && (
            <span className="text-[10px] bg-purple-500/20 px-1.5 py-0.5 rounded text-purple-300">Special cd:{fighter.specialCooldown}</span>
          )}
        </div>
      </div>
    </motion.div>
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
  const [queueSecs, setQueueSecs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const queueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch hatchlings ──────────────────────────────────────────────────────
  const { data: hatchlings = [] } = useQuery<Hatchling[]>({
    queryKey: ["hatchlings-battle", pid],
    queryFn: () => fetch(`${BASE}/api/hatchlings?playerId=${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  // ── Fetch player for ranked check + ELO ──────────────────────────────────
  const { data: player } = useQuery<{ level: number; battleElo: number }>({
    queryKey: ["player-battle", pid],
    queryFn: () => fetch(`${BASE}/api/players/${pid}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  // ── Fetch battle history ──────────────────────────────────────────────────
  const { data: history = [] } = useQuery<{ id: number; opponent: string; viewerWon: boolean; myHatchling: string; createdAt: string; battleMode: string }[]>({
    queryKey: ["battle-history", pid],
    queryFn: () => fetch(`${BASE}/api/battles/history`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  // ── WS connection ─────────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!pid) return;
    // Fetch a server-issued one-time token so the WS handshake is authenticated
    // server-side instead of trusting a client-supplied ?playerId= query param.
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
    if (msg.type === "queue_joined") {
      // already in queue phase, timer running
    }
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
        const newTurns = newState.turns;
        if (newTurns.length > prevTurns) {
          setLastTurn(newTurns[newTurns.length - 1] ?? null);
        }
        return newState;
      });
    }
    if (msg.type === "battle_end") {
      setBattleState(msg.state as BattleState);
      setRewards({
        xp: (msg.rewards as { xp: number }).xp,
        coins: (msg.rewards as { coins: number }).coins,
        eloChange: Number(msg.eloChange ?? 0),
      });
      setLastTurn(null);
      setPhase("result");
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

  // Cleanup WS on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  function joinQueue() {
    if (!selectedHatchling || !pid) return;
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
    setSelectedHatchling(null);
    setPhase("select");
  }

  const myFighter = battleState ? (yourSlot === 1 ? battleState.fighter1 : battleState.fighter2) : null;
  const opponentFighter = battleState ? (yourSlot === 1 ? battleState.fighter2 : battleState.fighter1) : null;
  const isMyTurn = battleState?.currentSlot === yourSlot && battleState.phase === "active";
  const viewerWon = battleState ? battleState.winner === yourSlot : false;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 px-2">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5 pt-4">
          <button onClick={() => phase === "select" ? setLocation("/compete") : resetBattle()} className="text-muted-foreground hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-black text-2xl flex items-center gap-2"><Swords className="w-5 h-5 text-primary" /> Battle Arena</h1>
            {player && (
              <p className="text-xs text-muted-foreground">ELO: <span className="text-yellow-400 font-bold">{player.battleElo}</span></p>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">

          {/* ── SELECT HATCHLING ── */}
          {phase === "select" && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              {/* Mode toggle */}
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
                  <Button onClick={joinQueue} className="w-full h-14 font-black text-lg bg-gradient-to-r from-primary to-purple-600 rounded-2xl shadow-primary/30 shadow-lg">
                    <Swords className="w-5 h-5 mr-2" /> Find Battle
                  </Button>
                </motion.div>
              )}

              {/* Recent battle history */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Battles</p>
                  {history.slice(0, 5).map(b => (
                    <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${b.viewerWon ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                      <span className="text-lg">{b.viewerWon ? "🏆" : "💀"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{b.viewerWon ? "Victory" : "Defeat"} vs {b.opponent}</p>
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
                  {queueSecs < 30
                    ? `Searching… ${queueSecs}s`
                    : "Matched with a bot opponent!"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">You'll be matched with a bot if no one is found in 30 seconds.</p>
              <Button variant="outline" onClick={leaveQueue} className="rounded-full">Cancel</Button>
            </motion.div>
          )}

          {/* ── BATTLE ── */}
          {phase === "battle" && battleState && myFighter && opponentFighter && (
            <motion.div key="battle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Turn counter */}
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Turn {battleState.turnNumber}</span>
                <span className={`font-bold ${isMyTurn ? "text-primary animate-pulse" : "text-muted-foreground"}`}>
                  {isMyTurn ? "⚔️ Your turn!" : "⏳ Waiting…"}
                </span>
                <span>{battleState.mode} battle</span>
              </div>

              {/* Fighters side by side */}
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

              {/* Move buttons */}
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
                      const isItemUsed = mv.type === "use_item" && myFighter.itemUsed;
                      const noEnergy = myFighter.energy < mv.cost;
                      const disabled = isSpecialCd || isItemUsed || (noEnergy && mv.type !== "basic_attack");
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

              {/* Turn log (last 3 turns) */}
              {battleState.turns.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Battle Log</p>
                  {battleState.turns.slice(-3).reverse().map(t => (
                    <div key={t.turnNumber} className="text-[11px] text-muted-foreground flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5">
                      <span>{t.actingSlot === yourSlot ? "You" : "Opponent"}</span>
                      <span className="text-white/50">used</span>
                      <span className="capitalize font-medium text-white/70">{t.move.replace("_", " ")}</span>
                      {t.damage > 0 && <span className="ml-auto text-red-400">-{t.damage} HP {t.isCrit ? "⚡" : ""}{t.isSuper ? "🔥" : ""}</span>}
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
              {/* Burst particles */}
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
                  vs {battleState.fighter2.isBot ? "Bot" : (yourSlot === 1 ? battleState.fighter2.hatchlingName : battleState.fighter1.hatchlingName)}
                </p>
              </div>

              {rewards && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex gap-4 justify-center"
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

              {/* Battle summary text card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4 text-left text-sm space-y-1"
              >
                <p className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">Battle Summary</p>
                <p>Turns played: <span className="font-bold">{battleState.turnNumber}</span></p>
                <p>My Hatchling: <span className="font-bold">{myFighter?.hatchlingName}</span></p>
                <p>Opponent: <span className="font-bold">{opponentFighter?.hatchlingName ?? "Bot"} {opponentFighter?.isBot ? "🤖" : ""}</span></p>
                <p>Result: <span className={`font-bold ${viewerWon ? "text-green-400" : "text-red-400"}`}>{viewerWon ? "WIN" : battleState.winner === 0 ? "DRAW" : "LOSS"}</span></p>
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
                      `Opponent: ${opponentFighter?.hatchlingName ?? "Bot"} ${opponentFighter?.isBot ? "🤖" : ""}`,
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
    </Layout>
  );
}
