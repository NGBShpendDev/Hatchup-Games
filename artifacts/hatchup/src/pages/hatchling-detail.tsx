import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetHatchling, getGetHatchlingQueryKey,
  useUpdateHatchling,
  useEvolveHatchling,
  useDeleteHatchling
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Heart, Coffee, Shield, Trash2, ArrowUpCircle, Sword, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

// ── Realm config ───────────────────────────────────────────────────────────────
const REALM_CONFIG: Record<string, {
  label: string; color: string; gradient: string; border: string;
  description: string; emoji: string;
}> = {
  strength: {
    label: "Strength Realm", emoji: "🔥", color: "#ef4444",
    gradient: "from-red-950/60 to-orange-950/30",
    border: "border-red-500/50",
    description: "Forged in iron and volcanic fire. Grows powerful through resistance training.",
  },
  cardio: {
    label: "Cardio Realm", emoji: "⚡", color: "#06b6d4",
    gradient: "from-cyan-950/60 to-blue-950/30",
    border: "border-cyan-500/50",
    description: "Born from lightning and wind. Thrives on speed, endurance, and relentless movement.",
  },
  balance: {
    label: "Balance Realm", emoji: "✨", color: "#a855f7",
    gradient: "from-purple-950/60 to-fuchsia-950/30",
    border: "border-purple-500/50",
    description: "Woven from starlight. Heals, protects, and elevates those around it.",
  },
  beast: {
    label: "Beast Realm", emoji: "🌿", color: "#22c55e",
    gradient: "from-green-950/60 to-emerald-950/30",
    border: "border-green-500/50",
    description: "Risen from primal shadow. An untameable hunter that dominates through raw aggression.",
  },
  mythic: {
    label: "Mythic Realm", emoji: "🌌", color: "#ec4899",
    gradient: "from-pink-950/60 to-violet-950/30",
    border: "border-pink-500/50",
    description: "A cosmic anomaly born at the intersection of all realms. Impossibly rare.",
  },
};

const STAGE_LABELS: Record<number, { name: string; desc: string }> = {
  1: { name: "Cute", desc: "Small and soft — full of untapped potential." },
  2: { name: "Athletic", desc: "Powerful and elemental — truly coming into its own." },
  3: { name: "Legendary", desc: "Majestic god-tier form. Radiates an aura of pure power." },
};

const PERSONALITY_FLAVOR: Record<string, { desc: string; traits: string[] }> = {
  Sleepy: {
    desc: "Slow to wake, but unstoppable once it gets going. Prefers rest between workouts.",
    traits: ["Low energy", "High recovery", "Burst power"],
  },
  Hyper: {
    desc: "Bursting with energy — it never stops moving. Trains hardest in short intense bursts.",
    traits: ["High speed", "Eager", "Sprint specialist"],
  },
  Loyal: {
    desc: "Devoted to its Trainer above all else. Friendship grows faster with regular training.",
    traits: ["Bond +50%", "Team player", "Protective"],
  },
  Competitive: {
    desc: "Born to win. It trains hardest when challenged. Shines brightest in competitions.",
    traits: ["High aggression", "Win-driven", "Rivalry boost"],
  },
  Calm: {
    desc: "Measured and steady — wise beyond its years. Consistent and reliable in all situations.",
    traits: ["Balanced stats", "Steady growth", "Versatile"],
  },
};

const MOOD_DISPLAY: Record<string, { emoji: string; label: string; color: string; desc: string }> = {
  celebrating: { emoji: "✨", label: "Celebrating!", color: "#fbbf24", desc: "Still buzzing from that last workout!" },
  resting:     { emoji: "💤", label: "Resting",    color: "#94a3b8", desc: "It's been a while. Let's train together!" },
  happy:       { emoji: "😊", label: "Happy",      color: "#22c55e", desc: "Content and ready to train with you." },
};

type Genetics = {
  temperament: number; energyType: number; auraColor: number;
  physique: number; loyalty: number; aggression: number; mutationChance: number;
};

const GENETICS_LABELS: (keyof Genetics)[] = [
  "temperament", "energyType", "physique", "loyalty", "aggression", "auraColor",
];

const GENETICS_DISPLAY: Record<string, string> = {
  temperament: "Temperament",
  energyType: "Energy",
  physique: "Physique",
  loyalty: "Loyalty",
  aggression: "Aggression",
  auraColor: "Aura",
};

function GeneticBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold">
        <span className="text-muted-foreground">{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function HatchlingDetail() {
  const { id } = useParams<{ id: string }>();
  const hatchlingId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: hatchling, isLoading } = useGetHatchling(hatchlingId, {
    query: { enabled: !!hatchlingId, queryKey: getGetHatchlingQueryKey(hatchlingId) }
  });

  const updateMutation = useUpdateHatchling();
  const evolveMutation = useEvolveHatchling();
  const deleteMutation = useDeleteHatchling();

  const handleFeed = () => {
    if (!hatchling) return;
    updateMutation.mutate(
      { id: hatchlingId, data: { hunger: Math.min(100, hatchling.hunger + 20) } },
      {
        onSuccess: () => {
          toast({ title: "Yum!", description: `${hatchling.name} enjoyed the meal!` });
          queryClient.invalidateQueries({ queryKey: getGetHatchlingQueryKey(hatchlingId) });
        }
      }
    );
  };

  const handleTrain = () => {
    if (!hatchling) return;
    updateMutation.mutate(
      {
        id: hatchlingId,
        data: {
          happiness: Math.min(100, hatchling.happiness + 15),
          energy: Math.max(0, hatchling.energy - 10),
          lastWorkoutAt: new Date().toISOString(),
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Training Complete!", description: `${hatchling.name} is getting stronger! Bond +5` });
          queryClient.invalidateQueries({ queryKey: getGetHatchlingQueryKey(hatchlingId) });
        }
      }
    );
  };

  const handleEvolve = () => {
    if (!hatchling) return;
    evolveMutation.mutate(
      { data: { hatchlingId, evolutionId: 1, useItem: false } },
      {
        onSuccess: () => {
          toast({ title: "Evolution Complete!", description: `${hatchling.name} has reached Stage ${(hatchling.evolutionStage ?? 1) + 1}!` });
          queryClient.invalidateQueries({ queryKey: getGetHatchlingQueryKey(hatchlingId) });
        },
        onError: () => {
          toast({ title: "Evolution Failed", description: "Not enough XP or no valid evolution path.", variant: "destructive" });
        }
      }
    );
  };

  const handleRelease = () => {
    if (!hatchling) return;
    if (confirm(`Are you sure you want to release ${hatchling.name}? This cannot be undone.`)) {
      deleteMutation.mutate(
        { id: hatchlingId },
        {
          onSuccess: () => {
            toast({ title: "Released", description: `${hatchling.name} has been released into the wild.` });
            setLocation("/hatch");
          }
        }
      );
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-[500px] w-full rounded-3xl" />
            <div className="space-y-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!hatchling) return <Layout><div className="p-8 text-center font-bold">Pal not found</div></Layout>;

  const realm = (hatchling.realm as string | undefined) ?? "balance";
  const realmConfig = REALM_CONFIG[realm] ?? REALM_CONFIG["balance"];
  const stage = hatchling.evolutionStage ?? 1;
  const stageInfo = STAGE_LABELS[stage] ?? STAGE_LABELS[1];
  const moodState = (hatchling.moodState as string | undefined) ?? "happy";
  const moodDisplay = MOOD_DISPLAY[moodState] ?? MOOD_DISPLAY["happy"];
  const personality = hatchling.personality ?? "Calm";
  const personalityInfo = PERSONALITY_FLAVOR[personality] ?? PERSONALITY_FLAVOR["Calm"];
  const genetics = hatchling.genetics as Genetics | null | undefined;
  const friendshipLevel = hatchling.friendshipLevel ?? 0;

  const getFallbackImage = (cat?: string) => {
    switch (cat?.toLowerCase()) {
      case "strength": case "dragons": return lavaDragonImg;
      case "cardio": case "cyber": return cyberCreatureImg;
      case "beast": case "shadow": return shadowBeastImg;
      case "candy": return candyMonsterImg;
      case "mythic": case "cosmic": return cosmicEntityImg;
      case "balance": case "crystal": return crystalGuardianImg;
      default: return lavaDragonImg;
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto pb-12">
        <Button variant="ghost" className="mb-6 font-bold" onClick={() => setLocation("/hatch")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          {/* Left: Visual panel */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`bg-gradient-to-br ${realmConfig.gradient} backdrop-blur border-2 ${realmConfig.border} rounded-3xl p-8 flex flex-col items-center justify-between relative overflow-hidden shadow-2xl`}
            style={{ boxShadow: `0 0 40px ${realmConfig.color}30` }}
          >
            {/* Realm header */}
            <div className="w-full flex justify-between items-center mb-4 relative z-10">
              <Badge variant="outline" className="font-black text-sm px-3 py-1" style={{ borderColor: realmConfig.color + "60", color: realmConfig.color }}>
                {realmConfig.emoji} {realmConfig.label}
              </Badge>
              {hatchling.isShiny && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 font-black">✦ SHINY</Badge>
              )}
            </div>

            {/* Pal image */}
            <motion.img
              src={hatchling.imageUrl || getFallbackImage(realm)}
              alt={hatchling.name}
              className="w-full max-w-xs object-contain relative z-10"
              style={{ filter: `drop-shadow(0 0 20px ${realmConfig.color}60)` }}
              animate={moodState === "celebrating"
                ? { y: [0, -12, 0], scale: [1, 1.05, 1] }
                : moodState === "resting"
                ? { opacity: [1, 0.85, 1] }
                : { y: [0, -8, 0] }
              }
              transition={{ repeat: Infinity, duration: moodState === "celebrating" ? 0.7 : 4, ease: "easeInOut" }}
            />

            {/* Shiny overlay */}
            {hatchling.isShiny && (
              <div className="absolute inset-0 bg-gradient-to-tr from-yellow-300/10 via-transparent to-yellow-300/10 mix-blend-overlay pointer-events-none animate-pulse" />
            )}

            {/* Evolution stage arc */}
            <div className="w-full mt-6 relative z-10">
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 text-center">Evolution Arc</p>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3].map((s) => (
                  <div key={s} className={`flex-1 text-center px-2 py-2 rounded-xl border transition-all ${s === stage ? "border-opacity-100 font-black" : s < stage ? "opacity-60" : "opacity-25 border-white/10"}`}
                    style={s === stage ? { borderColor: realmConfig.color, background: realmConfig.color + "20" } : {}}>
                    <p className="text-[10px] font-black uppercase" style={s === stage ? { color: realmConfig.color } : {}}>
                      {STAGE_LABELS[s]?.name}
                    </p>
                    {s === stage && <div className="w-1 h-1 rounded-full mx-auto mt-1" style={{ background: realmConfig.color }} />}
                  </div>
                ))}
              </div>
              <p className="text-xs text-center text-muted-foreground mt-2 italic">"{stageInfo.desc}"</p>
            </div>

            {/* Evolve button */}
            <div className="mt-6 relative z-10 w-full">
              <Button
                size="lg"
                className="w-full font-black text-lg h-14 text-white border-0"
                style={{ background: `linear-gradient(135deg, ${realmConfig.color}, ${realmConfig.color}99)` }}
                onClick={handleEvolve}
                disabled={evolveMutation.isPending}
              >
                <ArrowUpCircle className="w-6 h-6 mr-2" />
                {evolveMutation.isPending ? "Evolving..." : `Evolve Pal — Stage ${Math.min(3, stage + 1)}`}
              </Button>
            </div>
          </motion.div>

          {/* Right: Stats panel */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="space-y-5"
          >
            {/* Name & identity */}
            <div>
              <h1 className="text-4xl font-black tracking-tight text-foreground mb-2">{hatchling.name}</h1>
              <div className="flex gap-2 items-center flex-wrap">
                <Badge variant="outline" className="text-sm font-bold px-3 py-1 uppercase">{hatchling.species}</Badge>
                <Badge className="text-sm font-bold px-3 py-1 bg-primary/20 text-primary border-0">Level {hatchling.level}</Badge>
                <Badge variant="outline" className="text-sm font-bold">{hatchling.rarity ?? "Common"}</Badge>
              </div>
            </div>

            {/* Realm description */}
            <Card className={`border ${realmConfig.border} bg-gradient-to-br ${realmConfig.gradient}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{realmConfig.emoji}</span>
                  <p className="font-black text-sm" style={{ color: realmConfig.color }}>{realmConfig.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{realmConfig.description}</p>
              </CardContent>
            </Card>

            {/* Mood state */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{moodDisplay.emoji}</span>
                    <div>
                      <p className="font-black text-sm" style={{ color: moodDisplay.color }}>{moodDisplay.label}</p>
                      <p className="text-xs text-muted-foreground">{moodDisplay.desc}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Mood</p>
                    <p className="text-xs font-black capitalize">{moodState}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Friendship bond */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-4 h-4 text-pink-400" />
                  <p className="font-black text-sm text-pink-400">Friendship Bond</p>
                  <span className="ml-auto font-black text-sm">{friendshipLevel}/100</span>
                </div>
                <Progress value={friendshipLevel} className="h-2 [&>div]:bg-pink-500" />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {friendshipLevel < 30 ? "Still getting to know each other." : friendshipLevel < 70 ? "A strong bond is forming!" : "An unbreakable bond. True partners."}
                </p>
              </CardContent>
            </Card>

            {/* Personality */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4" style={{ color: realmConfig.color }} />
                  <p className="font-black text-sm">Personality — <span style={{ color: realmConfig.color }}>{personality}</span></p>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{personalityInfo.desc}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {personalityInfo.traits.map(t => (
                    <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ borderColor: realmConfig.color + "60", color: realmConfig.color, background: realmConfig.color + "15" }}>
                      {t}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Vitals */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-black text-base">Vitals</h3>
                {[
                  { icon: Heart, label: "Happiness", value: hatchling.happiness, color: "#22c55e" },
                  { icon: Coffee, label: "Hunger", value: hatchling.hunger, color: "#f97316" },
                  { icon: Zap, label: "Energy", value: hatchling.energy, color: "#3b82f6" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between font-bold text-xs">
                      <span className="flex items-center gap-2" style={{ color }}><Icon className="w-3.5 h-3.5" /> {label}</span>
                      <span className="text-muted-foreground">{value}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full">
                      <motion.div className="h-full rounded-full" style={{ background: color }}
                        initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 1 }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Genetics */}
            {genetics && (
              <Card className="bg-card/80 border-border">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4" style={{ color: realmConfig.color }} />
                    <h3 className="font-black text-sm">Genetics Profile</h3>
                    {genetics.mutationChance > 7 && (
                      <Badge className="text-[10px] ml-auto font-black bg-yellow-500/20 text-yellow-400 border-yellow-500/40">
                        ⚗ Mutation Risk
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {GENETICS_LABELS.map(key => (
                      <GeneticBar
                        key={key}
                        label={GENETICS_DISPLAY[key]}
                        value={typeof genetics[key] === "number" ? genetics[key] : 0}
                        color={realmConfig.color}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Ability */}
            <Card className="bg-card/80 border-l-4 border-border" style={{ borderLeftColor: realmConfig.color }}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4" style={{ color: realmConfig.color }} />
                  <h3 className="font-black text-sm">Signature Ability</h3>
                </div>
                <p className="font-black text-base">{hatchling.abilityName || "Unknown Ability"}</p>
                <p className="text-sm text-muted-foreground mt-1">{hatchling.abilityDesc || "This Pal hasn't discovered its true power yet."}</p>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button size="lg" className="flex-1 font-bold" onClick={handleTrain} disabled={updateMutation.isPending}>
                <Sword className="w-4 h-4 mr-2" /> Train
              </Button>
              <Button size="lg" variant="secondary" className="flex-1 font-bold" onClick={handleFeed} disabled={updateMutation.isPending}>
                <Coffee className="w-4 h-4 mr-2" /> Feed
              </Button>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-bold text-sm" onClick={handleRelease}>
                <Trash2 className="w-4 h-4 mr-2" /> Release Pal
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
