import { Layout } from "@/components/layout";
import {
  useListEvolutions, getListEvolutionsQueryKey,
  useGetEvolutionRealms, getGetEvolutionRealmsQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Lock } from "lucide-react";
import { useState } from "react";
import { ErrorCard } from "@/components/error-card";

// ── Realm visual config ────────────────────────────────────────────────────────
const REALM_STYLES: Record<string, {
  color: string; auraColor: string; gradient: string;
  border: string; badge: string; emoji: string;
}> = {
  strength: {
    color: "#ef4444", auraColor: "#f97316", emoji: "🔥",
    gradient: "from-red-950/60 via-orange-950/30 to-transparent",
    border: "border-red-500/60", badge: "bg-red-500/20 text-red-400 border-red-500/40",
  },
  cardio: {
    color: "#06b6d4", auraColor: "#3b82f6", emoji: "⚡",
    gradient: "from-cyan-950/60 via-blue-950/30 to-transparent",
    border: "border-cyan-500/60", badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
  },
  balance: {
    color: "#a855f7", auraColor: "#d946ef", emoji: "✨",
    gradient: "from-purple-950/60 via-fuchsia-950/30 to-transparent",
    border: "border-purple-500/60", badge: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  },
  beast: {
    color: "#22c55e", auraColor: "#166534", emoji: "🌿",
    gradient: "from-green-950/60 via-emerald-950/30 to-transparent",
    border: "border-green-500/60", badge: "bg-green-500/20 text-green-400 border-green-500/40",
  },
  mythic: {
    color: "#ec4899", auraColor: "#a855f7", emoji: "🌌",
    gradient: "from-pink-950/60 via-violet-950/30 to-transparent",
    border: "border-pink-500/60", badge: "bg-pink-500/20 text-pink-400 border-pink-500/40",
  },
};

const STAGE_LABEL: Record<number, string> = {
  1: "Cute", 2: "Athletic", 3: "Legendary",
};

const RARITY_ORDER = ["Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];

function rarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case "mythic": return "bg-pink-500/20 text-pink-400 border-pink-500/40";
    case "legendary": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
    case "epic": return "bg-purple-500/20 text-purple-400 border-purple-500/40";
    case "rare": return "bg-blue-500/20 text-blue-400 border-blue-500/40";
    case "uncommon": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    default: return "bg-muted/50 text-muted-foreground border-border";
  }
}

// ── Evolution card ─────────────────────────────────────────────────────────────
function EvoCard({ evo, realmColor, isPrestige }: { evo: any; realmColor: string; isPrestige: boolean }) {
  if (isPrestige) {
    return (
      <div className="relative rounded-2xl border-2 border-dashed border-white/10 bg-card/20 p-5 flex flex-col items-center justify-center text-center gap-2 min-h-[160px]">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <p className="font-black text-lg text-muted-foreground/40">???</p>
        <p className="text-xs text-muted-foreground/30">Prestige Evolution</p>
        <p className="text-[10px] text-muted-foreground/30 italic">Unlock the impossible</p>
        <Badge variant="outline" className="text-[10px] border-dashed border-white/10 text-white/20 mt-1">Locked</Badge>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      className="relative rounded-2xl border-2 overflow-hidden bg-card/50 cursor-default"
      style={{ borderColor: realmColor + "50" }}
    >
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
        style={{ background: `radial-gradient(circle at center, ${realmColor}15, transparent)` }} />

      <div className="p-4 relative z-10">
        {/* Stage label */}
        <div className="flex justify-between items-start mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: realmColor + "20", color: realmColor, border: `1px solid ${realmColor}40` }}>
            Stage {evo.stage} — {STAGE_LABEL[evo.stage] ?? "Unknown"}
          </span>
          <Badge variant="outline" className={`text-[10px] font-black ${rarityColor(evo.rarity)}`}>
            {evo.rarity}
          </Badge>
        </div>

        {/* Name */}
        <h3 className="font-black text-lg leading-tight mb-1">{evo.name}</h3>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{evo.description}</p>

        {/* Ability */}
        {evo.abilityName && (
          <div className="rounded-xl p-2.5" style={{ background: realmColor + "15", border: `1px solid ${realmColor}30` }}>
            <p className="text-[10px] font-black uppercase mb-0.5" style={{ color: realmColor }}>Signature Move</p>
            <p className="text-xs font-bold">{evo.abilityName}</p>
          </div>
        )}

        {/* Unlock hint */}
        {evo.unlockHint && (
          <p className="text-[10px] text-muted-foreground/60 mt-2 italic flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" /> {evo.unlockHint}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Evolution path column ──────────────────────────────────────────────────────
function PathColumn({ path, evos, realmColor, pathLabel }: { path: string; evos: any[]; realmColor: string; pathLabel: string }) {
  const isPrestige = path === "C";
  const sorted = [...evos].sort((a, b) => a.stage - b.stage);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-4">
        {isPrestige ? (
          <Lock className="w-4 h-4 text-muted-foreground/40" />
        ) : (
          <div className="w-3 h-3 rounded-full" style={{ background: realmColor }} />
        )}
        <p className={`text-xs font-black uppercase tracking-widest ${isPrestige ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
          {pathLabel}
        </p>
      </div>

      {/* Connecting line */}
      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 pointer-events-none"
          style={{ background: isPrestige ? "rgba(255,255,255,0.05)" : `linear-gradient(to bottom, ${realmColor}60, transparent)` }} />
        <div className="space-y-4 relative z-10">
          {sorted.map(evo => (
            <EvoCard key={evo.id} evo={evo} realmColor={realmColor} isPrestige={isPrestige && evo.isPrestige} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Realm tab ──────────────────────────────────────────────────────────────────
function RealmEvolutions({ realm, evolutions }: { realm: string; evolutions: any[] }) {
  const style = REALM_STYLES[realm] ?? REALM_STYLES["balance"];

  const pathA = evolutions.filter(e => e.evolutionPath === "A");
  const pathB = evolutions.filter(e => e.evolutionPath === "B");
  const pathC = evolutions.filter(e => e.evolutionPath === "C");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      {/* Stage legend */}
      <div className="flex gap-3 justify-center">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/50 border border-border/50">
            <div className="w-2 h-2 rounded-full" style={{ background: style.color, opacity: s === 3 ? 1 : s === 2 ? 0.7 : 0.4 }} />
            <span className="text-xs font-black text-muted-foreground">Stage {s} — {STAGE_LABEL[s]}</span>
          </div>
        ))}
      </div>

      {/* Branching paths */}
      <div className="flex gap-6 items-start">
        <PathColumn path="A" evos={pathA} realmColor={style.color} pathLabel="Path Alpha" />
        <div className="w-px self-stretch bg-white/5 shrink-0" />
        <PathColumn path="B" evos={pathB} realmColor={style.auraColor} pathLabel="Path Beta" />
        <div className="w-px self-stretch bg-white/5 shrink-0" />
        <PathColumn path="C" evos={pathC} realmColor={style.color} pathLabel="Prestige Path" />
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Evolutions() {
  const [selectedRealm, setSelectedRealm] = useState<string>("strength");

  const { data: realms, isLoading: isLoadingRealms, isError: isErrorRealms, refetch: refetchRealms } = useGetEvolutionRealms({
    query: { queryKey: getGetEvolutionRealmsQueryKey() }
  });

  const { data: evolutions, isLoading: isLoadingEvos, isError: isErrorEvos, refetch: refetchEvos } = useListEvolutions(
    { realm: selectedRealm },
    { query: { queryKey: getListEvolutionsQueryKey({ realm: selectedRealm }) } }
  );

  const activeStyle = REALM_STYLES[selectedRealm] ?? REALM_STYLES["balance"];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-16">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-3 flex items-center justify-center gap-3">
            <Zap className="w-10 h-10" /> Evolution Atlas
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Five Realms. Branching paths. One prestige destiny.
          </p>
        </div>

        {/* Realm tabs */}
        {isErrorRealms && !realms ? (
          <ErrorCard title="Couldn't load realms" onRetry={() => refetchRealms()} />
        ) : isLoadingRealms ? (
          <div className="flex gap-3 justify-center">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center">
            {realms?.map(realm => {
              const style = REALM_STYLES[realm.id] ?? REALM_STYLES["balance"];
              const isActive = selectedRealm === realm.id;
              return (
                <motion.button
                  key={realm.id}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedRealm(realm.id)}
                  className={`relative px-5 py-3 rounded-2xl border-2 font-black text-sm transition-all ${isActive ? style.border : "border-border/30 hover:border-border/60"}`}
                  style={isActive ? {
                    background: `linear-gradient(135deg, ${style.color}20, transparent)`,
                    boxShadow: `0 0 20px ${style.color}30`,
                  } : {}}
                >
                  <span className="text-xl block mb-1">{style.emoji}</span>
                  <span className={isActive ? "" : "text-muted-foreground"} style={isActive ? { color: style.color } : {}}>
                    {realm.name.replace(" Realm", "")}
                  </span>
                  <span className="block text-[10px] text-muted-foreground font-medium mt-0.5">
                    {realm.evolutionCount} forms
                  </span>
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-2xl pointer-events-none"
                      style={{ border: `2px solid ${style.color}` }}
                      layoutId="activeRealmBorder"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Realm description */}
        {realms && (
          <motion.div key={selectedRealm} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard
              glow="primary"
              className={`p-5 bg-gradient-to-br ${activeStyle.gradient}`}
              style={{ borderColor: activeStyle.color + "40" }}
            >
              <div className="relative z-10 flex items-center gap-3">
                <span className="text-3xl">{activeStyle.emoji}</span>
                <div>
                  <p className="font-black text-lg" style={{ color: activeStyle.color }}>
                    {realms.find(r => r.id === selectedRealm)?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {realms.find(r => r.id === selectedRealm)?.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Evolution tree */}
        {isErrorEvos && !evolutions ? (
          <ErrorCard title="Couldn't load evolutions" onRetry={() => refetchEvos()} />
        ) : isLoadingEvos ? (
          <div className="grid grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <RealmEvolutions
              key={selectedRealm}
              realm={selectedRealm}
              evolutions={evolutions ?? []}
            />
          </AnimatePresence>
        )}
      </div>
    </Layout>
  );
}
