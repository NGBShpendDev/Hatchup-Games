import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Lock, Star, Zap, Shield, Trophy, ChevronDown, ChevronUp, User, GripVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary", "Mythic", "Ancient", "Celestial"];

const RARITY_STYLES: Record<string, { glow: string; border: string; badge: string; text: string; bg: string }> = {
  Common:    { glow: "", border: "border-zinc-600",   badge: "bg-zinc-700 text-zinc-200",           text: "text-zinc-300",    bg: "bg-zinc-800/40" },
  Rare:      { glow: "artifact-glow-rare",      border: "border-blue-500/60",   badge: "bg-blue-600 text-white",              text: "text-blue-300",    bg: "bg-blue-950/30" },
  Epic:      { glow: "artifact-glow-epic",      border: "border-purple-500/70", badge: "bg-purple-600 text-white",            text: "text-purple-300",  bg: "bg-purple-950/30" },
  Legendary: { glow: "artifact-glow-legendary", border: "border-yellow-500/80", badge: "bg-yellow-500 text-black font-bold", text: "text-yellow-300",  bg: "bg-yellow-950/20" },
  Mythic:    { glow: "artifact-glow-mythic",    border: "border-pink-500/80",   badge: "bg-gradient-to-r from-pink-500 to-rose-500 text-white", text: "text-pink-300", bg: "bg-pink-950/20" },
  Ancient:   { glow: "artifact-glow-ancient",   border: "border-orange-500/80", badge: "bg-gradient-to-r from-orange-500 to-amber-600 text-white", text: "text-orange-300", bg: "bg-orange-950/20" },
  Celestial: { glow: "artifact-glow-celestial", border: "border-cyan-400/90",   badge: "bg-gradient-to-r from-cyan-400 to-indigo-500 text-white", text: "text-cyan-200",  bg: "bg-cyan-950/20" },
};

const RARITY_EMOJIS: Record<string, string> = {
  Common: "⬜", Rare: "🔵", Epic: "🟣", Legendary: "🟡", Mythic: "🔴", Ancient: "🟠", Celestial: "🌟",
};

const BAR_ICONS: Record<string, string> = {
  strength: "💪", speed: "⚡", cardio: "🫀", recovery: "🌿",
  consistency: "🔥", endurance: "🏔️", agility: "🐆", discipline: "🧘",
};

const BAR_COLORS: Record<string, string> = {
  strength:    "from-red-500 to-orange-500",
  speed:       "from-yellow-400 to-amber-500",
  cardio:      "from-pink-500 to-rose-500",
  recovery:    "from-green-400 to-emerald-500",
  consistency: "from-orange-500 to-yellow-500",
  endurance:   "from-blue-500 to-indigo-500",
  agility:     "from-purple-500 to-violet-500",
  discipline:  "from-teal-400 to-cyan-500",
};

interface ArtifactEntry {
  id: number;
  name: string;
  lore: string;
  rarity: string;
  type: string;
  imageSlug: string;
  isHidden: boolean;
  abilities: Array<{ name: string; description: string; value: number }>;
  discovered: boolean;
  isEquipped: boolean;
  isFeatured: boolean;
  featuredOrder: number | null;
  earnedAt: string | null;
}

interface FitnessBarEntry {
  barType: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  xpInCurrentLevel: number;
  progressPct: number;
}

export default function Artifacts() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const qc = useQueryClient();
  const [expandedRarities, setExpandedRarities] = useState<Set<string>>(new Set(["Legendary", "Mythic", "Ancient", "Celestial", "Epic"]));
  const [expandedArtifact, setExpandedArtifact] = useState<number | null>(null);

  const { data: museum, isLoading: museumLoading } = useQuery<ArtifactEntry[]>({
    queryKey: ["artifacts-museum", pid],
    queryFn: () => fetch(`${BASE}/api/artifacts`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const featuredArtifacts = (museum ?? [])
    .filter(a => a.isFeatured)
    .sort((a, b) => {
      const ao = a.featuredOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.featuredOrder ?? Number.MAX_SAFE_INTEGER;
      return ao - bo;
    });
  const featuredCount = featuredArtifacts.length;
  const MAX_FEATURED = 3;

  // Local order state for drag-to-reorder; synced from server data.
  const [orderedFeatured, setOrderedFeatured] = useState<ArtifactEntry[]>([]);
  useEffect(() => {
    setOrderedFeatured(featuredArtifacts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museum]);

  const reorderFeatured = useMutation({
    mutationFn: async (artifactIds: number[]) => {
      const res = await fetch(`${BASE}/api/players/me/featured-order`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["artifacts-museum", pid] });
      qc.invalidateQueries({ queryKey: ["player-profile", pid] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't reorder", description: err.message, variant: "destructive" });
    },
  });

  const commitReorder = (next: ArtifactEntry[]) => {
    setOrderedFeatured(next);
    const ids = next.map(a => a.id);
    const prevIds = featuredArtifacts.map(a => a.id);
    const changed = ids.length !== prevIds.length || ids.some((id, i) => id !== prevIds[i]);
    if (changed) reorderFeatured.mutate(ids);
  };

  const toggleFeatured = useMutation({
    mutationFn: async ({ artifactId, isFeatured }: { artifactId: number; isFeatured: boolean }) => {
      const res = await fetch(`${BASE}/api/players/me/artifacts/${artifactId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["artifacts-museum", pid] });
      qc.invalidateQueries({ queryKey: ["player-profile", pid] });
      toast({
        title: vars.isFeatured ? "Featured on profile" : "Removed from showcase",
        description: vars.isFeatured ? "This artifact now shines on your profile." : undefined,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update", description: err.message, variant: "destructive" });
    },
  });

  const handleToggleFeatured = (artifact: ArtifactEntry) => {
    if (!artifact.isFeatured && featuredCount >= MAX_FEATURED) {
      toast({
        title: `Showcase full (${MAX_FEATURED} max)`,
        description: "Unfeature one to feature another.",
        variant: "destructive",
      });
      return;
    }
    toggleFeatured.mutate({ artifactId: artifact.id, isFeatured: !artifact.isFeatured });
  };

  const { data: fitnessBars, isLoading: barsLoading } = useQuery<FitnessBarEntry[]>({
    queryKey: ["fitness-bars", pid],
    queryFn: () => fetch(`${BASE}/api/players/me/fitness-bars`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pid,
  });

  const toggleRarity = (rarity: string) => {
    setExpandedRarities(prev => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });
  };

  const groupedByRarity = RARITY_ORDER.reduce<Record<string, ArtifactEntry[]>>((acc, rarity) => {
    acc[rarity] = (museum ?? []).filter(a => a.rarity === rarity);
    return acc;
  }, {});

  const totalOwned = (museum ?? []).filter(a => a.discovered).length;
  const totalArtifacts = (museum ?? []).length;

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="text-center py-6 space-y-2">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-4xl">🏛️</span>
            <h1 className="text-3xl font-black tracking-tight text-white">Artifact Museum</h1>
          </div>
          <p className="text-muted-foreground text-sm">Legendary relics earned through elite fitness discipline.</p>
          {pid > 0 && (
            <Link href={`/players/${pid}`}>
              <button
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-bold text-muted-foreground hover:text-white hover:border-primary/60 transition-all"
                data-testid="link-view-profile"
              >
                <User className="w-3 h-3" /> View my profile
              </button>
            </Link>
          )}
          {!museumLoading && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-sm font-bold text-yellow-400">{totalOwned}</span>
              <span className="text-sm text-muted-foreground">/ {totalArtifacts} discovered</span>
              <div className="ml-2 h-2 w-24 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full"
                  style={{ width: `${totalArtifacts ? (totalOwned / totalArtifacts) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Featured Showcase (drag to reorder) ── */}
        {!museumLoading && featuredCount > 0 && (
          <div className="bg-card border border-border rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              <h2 className="font-black text-lg">Profile Showcase</h2>
              <span className="text-xs text-muted-foreground ml-auto">{featuredCount}/{MAX_FEATURED} featured</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Drag to reorder how they appear on your profile.</p>
            <Reorder.Group
              axis="y"
              values={orderedFeatured}
              onReorder={commitReorder}
              className="space-y-2"
              data-testid="featured-reorder-list"
            >
              {orderedFeatured.map((artifact, idx) => {
                const s = RARITY_STYLES[artifact.rarity] ?? RARITY_STYLES.Common!;
                return (
                  <Reorder.Item
                    key={artifact.id}
                    value={artifact}
                    className={`flex items-center gap-3 rounded-2xl border ${s.border} ${s.bg} p-3 cursor-grab active:cursor-grabbing select-none`}
                    data-testid={`featured-item-${artifact.id}`}
                    whileDrag={{ scale: 1.03, zIndex: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl ${s.bg} border ${s.border}`}>
                      <ArtifactEmoji slug={artifact.imageSlug} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black truncate ${s.text}`}>{artifact.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{artifact.rarity}</p>
                    </div>
                    <span className="text-xs font-black text-muted-foreground w-5 text-right">#{idx + 1}</span>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        )}

        {/* ── Fitness Bars Panel ── */}
        <GlassCard glow="cyan" className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            <h2 className="font-black text-lg">Fitness Bars</h2>
            <span className="text-xs text-muted-foreground ml-auto">8 independent tracks</span>
          </div>
          {barsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(fitnessBars ?? []).map(bar => (
                <motion.div
                  key={bar.barType}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-muted/30 rounded-2xl p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base">{BAR_ICONS[bar.barType]}</span>
                    <span className="text-xs font-black text-muted-foreground uppercase tracking-wide">
                      {bar.barType}
                    </span>
                    <span className="text-xs font-black text-white">Lv.{bar.level}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full bg-gradient-to-r ${BAR_COLORS[bar.barType] ?? "from-white to-white"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${bar.progressPct}%` }}
                      transition={{ duration: 0.8, delay: 0.1 }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">{bar.xpInCurrentLevel}/{bar.nextLevelXp} XP</p>
                </motion.div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* ── Artifact Museum by Rarity ── */}
        {museumLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
          </div>
        ) : (
          RARITY_ORDER.map(rarity => {
            const group = groupedByRarity[rarity] ?? [];
            if (group.length === 0) return null;
            const styles = RARITY_STYLES[rarity] ?? RARITY_STYLES.Common!;
            const isExpanded = expandedRarities.has(rarity);
            const ownedCount = group.filter(a => a.discovered).length;

            return (
              <div key={rarity} className={`rounded-3xl border ${styles.border} overflow-hidden`}>
                {/* Rarity header */}
                <button
                  className={`w-full flex items-center justify-between p-4 ${styles.bg} hover:brightness-110 transition-all`}
                  onClick={() => toggleRarity(rarity)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{RARITY_EMOJIS[rarity]}</span>
                    <div className="text-left">
                      <span className={`font-black text-base ${styles.text}`}>{rarity}</span>
                      <p className="text-xs text-muted-foreground">{ownedCount}/{group.length} discovered</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 grid grid-cols-1 gap-3 bg-card/50">
                        {group.map(artifact => (
                          <ArtifactCard
                            key={artifact.id}
                            artifact={artifact}
                            styles={styles}
                            isExpanded={expandedArtifact === artifact.id}
                            onToggle={() => setExpandedArtifact(prev => prev === artifact.id ? null : artifact.id)}
                            onToggleFeatured={() => handleToggleFeatured(artifact)}
                            isToggling={toggleFeatured.isPending}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}

function ArtifactCard({
  artifact,
  styles,
  isExpanded,
  onToggle,
  onToggleFeatured,
  isToggling,
}: {
  artifact: ArtifactEntry;
  styles: { glow: string; border: string; badge: string; text: string; bg: string };
  isExpanded: boolean;
  onToggle: () => void;
  onToggleFeatured: () => void;
  isToggling: boolean;
}) {
  const discovered = artifact.discovered;

  return (
    <motion.div
      layout
      className={`rounded-2xl border ${styles.border} ${discovered ? styles.bg : "bg-muted/20"} ${discovered && styles.glow ? styles.glow : ""} overflow-hidden cursor-pointer`}
      onClick={onToggle}
    >
      <div className="p-4 flex items-start gap-4">
        {/* Artifact icon */}
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0 ${discovered ? styles.bg : "bg-muted/30"} border ${styles.border}`}>
          {!discovered ? (
            <Lock className="w-6 h-6 text-muted-foreground" />
          ) : (
            <ArtifactEmoji slug={artifact.imageSlug} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-black text-base leading-tight ${discovered ? styles.text : "text-muted-foreground"}`}>
              {artifact.name}
            </h3>
            {artifact.isEquipped && (
              <Badge className="text-[10px] bg-green-600 text-white px-1.5 py-0">Equipped</Badge>
            )}
            {artifact.isFeatured && (
              <Badge className="text-[10px] bg-yellow-500 text-black px-1.5 py-0">Featured</Badge>
            )}
          </div>
          <p className={`text-xs mt-1 leading-relaxed ${discovered ? "text-muted-foreground" : "text-muted-foreground/50 italic"}`}>
            {artifact.lore}
          </p>
        </div>

        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />}
      </div>

      <AnimatePresence>
        {isExpanded && discovered && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`border-t ${styles.border} px-4 py-3 space-y-3`}
          >
            {artifact.abilities.length > 0 && (
              <>
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Active Abilities</p>
                {artifact.abilities.map((ability, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${styles.text}`} />
                    <div>
                      <p className={`text-xs font-bold ${styles.text}`}>{ability.name}</p>
                      <p className="text-[11px] text-muted-foreground">{ability.description}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFeatured(); }}
              disabled={isToggling}
              data-testid={`button-toggle-featured-${artifact.id}`}
              className={`w-full mt-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                artifact.isFeatured
                  ? "bg-yellow-500/90 text-black hover:bg-yellow-400"
                  : `${styles.bg} ${styles.text} border ${styles.border} hover:brightness-125`
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${artifact.isFeatured ? "fill-black" : ""}`} />
              {artifact.isFeatured ? "Featured on Profile" : "Feature on Profile"}
            </button>
            {artifact.earnedAt && (
              <p className="text-[10px] text-muted-foreground/60 pt-1">
                Earned {new Date(artifact.earnedAt).toLocaleDateString()}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ArtifactEmoji({ slug }: { slug: string }) {
  const SLUG_EMOJIS: Record<string, string> = {
    ember_spark: "🔥", bronze_strider: "🥾", iron_pact: "⚙️",
    flame_keeper: "🕯️", crystal_horizon: "💎", iron_fist: "✊",
    steel_resolve: "🛡️", thunderstride: "⚡", iron_devotee: "💪",
    steel_form: "🗿", leg_day_legend: "🦵", centurion_flame: "👑",
    marathon_spirit: "🏃", million_paces: "🌍", phoenix_core: "🦅",
    obsidian_sovereign: "⚫", stellar_epoch: "⭐", void_whisper: "🌑",
    agile_phantom: "🐆", eternal_vigil: "🌙",
  };
  return <span>{SLUG_EMOJIS[slug] ?? "🏺"}</span>;
}
