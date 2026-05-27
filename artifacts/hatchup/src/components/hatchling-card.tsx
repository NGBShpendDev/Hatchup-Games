import { motion } from "framer-motion";
import { Hatchling } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, Heart } from "lucide-react";
import { Link } from "wouter";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

interface HatchlingCardProps {
  hatchling: Hatchling;
  onClick?: () => void;
}

const REALM_STYLES: Record<string, { gradient: string; border: string; badge: string; glow: string; label: string }> = {
  strength: {
    gradient: "from-red-900/40 via-orange-900/20 to-transparent",
    border: "border-red-500/60",
    badge: "bg-red-500/20 text-red-400 border-red-500/40",
    glow: "shadow-red-500/30",
    label: "Strength",
  },
  cardio: {
    gradient: "from-cyan-900/40 via-blue-900/20 to-transparent",
    border: "border-cyan-500/60",
    badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    glow: "shadow-cyan-500/30",
    label: "Cardio",
  },
  balance: {
    gradient: "from-purple-900/40 via-fuchsia-900/20 to-transparent",
    border: "border-purple-500/60",
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    glow: "shadow-purple-500/30",
    label: "Balance",
  },
  beast: {
    gradient: "from-green-900/40 via-emerald-900/20 to-transparent",
    border: "border-green-500/60",
    badge: "bg-green-500/20 text-green-400 border-green-500/40",
    glow: "shadow-green-500/30",
    label: "Beast",
  },
  mythic: {
    gradient: "from-pink-900/40 via-violet-900/20 to-transparent",
    border: "border-pink-500/60",
    badge: "bg-pink-500/20 text-pink-400 border-pink-500/40",
    glow: "shadow-pink-500/30",
    label: "Mythic",
  },
};

const RARITY_COLORS: Record<string, string> = {
  mythic: "border-pink-500 text-pink-400",
  legendary: "border-yellow-500 text-yellow-400",
  epic: "border-purple-500 text-purple-400",
  rare: "border-blue-500 text-blue-400",
  uncommon: "border-emerald-500 text-emerald-400",
  common: "border-gray-500 text-gray-400",
};

function MoodIndicator({ moodState }: { moodState: string }) {
  if (moodState === "celebrating") {
    return (
      <motion.div
        className="absolute top-2 right-2 z-30 text-sm"
        animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
      >✨</motion.div>
    );
  }
  if (moodState === "resting") {
    return (
      <motion.div
        className="absolute top-2 right-2 z-30 text-sm text-muted-foreground"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >💤</motion.div>
    );
  }
  return (
    <motion.div
      className="absolute top-2 right-2 z-30 w-2.5 h-2.5 rounded-full bg-green-400"
      animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
      transition={{ repeat: Infinity, duration: 2 }}
    />
  );
}

export function HatchlingCard({ hatchling, onClick }: HatchlingCardProps) {
  const realm = (hatchling.realm as string | undefined) ?? "balance";
  const realmStyle = REALM_STYLES[realm] ?? REALM_STYLES["balance"];
  const rarityKey = (hatchling.rarity ?? "common").toLowerCase();
  const rarityColor = RARITY_COLORS[rarityKey] ?? RARITY_COLORS["common"];
  const moodState = (hatchling.moodState as string | undefined) ?? "happy";

  const getFallbackImage = (category?: string) => {
    switch (category?.toLowerCase()) {
      case "strength": case "dragons": return lavaDragonImg;
      case "cardio": case "cyber": return cyberCreatureImg;
      case "beast": case "shadow": return shadowBeastImg;
      case "candy": return candyMonsterImg;
      case "mythic": case "cosmic": return cosmicEntityImg;
      case "balance": case "crystal": return crystalGuardianImg;
      default: return lavaDragonImg;
    }
  };

  const imageSrc = hatchling.imageUrl || getFallbackImage(hatchling.realm as string ?? hatchling.category);

  const CardContent = (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      className={`relative overflow-hidden rounded-2xl border-2 ${realmStyle.border} bg-card p-4 shadow-lg hover:shadow-2xl ${realmStyle.glow} cursor-pointer group transition-all`}
      onClick={onClick}
      data-testid={`hatchling-card-${hatchling.id}`}
    >
      {/* Realm gradient bg */}
      <div className={`absolute inset-0 bg-gradient-to-br ${realmStyle.gradient} pointer-events-none`} />

      {/* Hover glow */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${realmStyle.gradient}`} />

      {/* Mood indicator */}
      <MoodIndicator moodState={moodState} />

      {/* Shiny overlay */}
      {hatchling.isShiny && (
        <div className="absolute inset-0 bg-gradient-to-tr from-yellow-300/10 via-transparent to-yellow-300/10 z-10 pointer-events-none mix-blend-overlay animate-pulse" />
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-3 relative z-10">
        <div>
          <h3 className="font-black text-base text-foreground tracking-tight leading-none">{hatchling.name}</h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">{hatchling.species}</p>
        </div>
        <Badge variant="outline" className={`font-black uppercase text-[10px] px-1.5 py-0.5 ${rarityColor}`}>
          {hatchling.isShiny ? "✦ " : ""}{hatchling.rarity ?? "Common"}
        </Badge>
      </div>

      {/* Realm badge */}
      <div className="relative z-10 mb-3">
        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${realmStyle.badge}`}>
          {realmStyle.label} Realm
        </span>
      </div>

      {/* Image */}
      <div className="relative aspect-square w-full mb-3 flex items-center justify-center bg-black/20 rounded-xl overflow-hidden border border-white/5">
        <motion.img
          src={imageSrc}
          alt={hatchling.name}
          className="w-full h-full object-contain p-2 relative z-0 drop-shadow-2xl"
          animate={moodState === "celebrating"
            ? { y: [0, -8, 0], scale: [1, 1.05, 1] }
            : moodState === "resting"
            ? { opacity: [1, 0.8, 1] }
            : { y: [0, -4, 0] }
          }
          transition={{ repeat: Infinity, duration: moodState === "celebrating" ? 0.8 : 3, ease: "easeInOut" }}
        />
        <div className="absolute bottom-1.5 left-1.5 flex gap-1 z-20">
          <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 bg-background/80 backdrop-blur">
            Lv.{hatchling.level}
          </Badge>
          <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 bg-background/80 backdrop-blur">
            Stage {hatchling.evolutionStage ?? 1}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2 relative z-10">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="flex items-center gap-1 text-green-400"><Heart className="w-2.5 h-2.5" /> Happiness</span>
            <span className="text-muted-foreground">{hatchling.happiness}%</span>
          </div>
          <Progress value={hatchling.happiness} className="h-1 [&>div]:bg-green-500" />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="flex items-center gap-1 text-blue-400"><Zap className="w-2.5 h-2.5" /> Energy</span>
            <span className="text-muted-foreground">{hatchling.energy}%</span>
          </div>
          <Progress value={hatchling.energy} className="h-1 [&>div]:bg-blue-500" />
        </div>
      </div>

      {/* Friendship bar */}
      <div className="mt-2 relative z-10">
        <div className="flex justify-between text-[10px] font-bold mb-1">
          <span className="text-pink-400">Bond</span>
          <span className="text-muted-foreground">{hatchling.friendshipLevel ?? 0}/100</span>
        </div>
        <Progress value={hatchling.friendshipLevel ?? 0} className="h-1 [&>div]:bg-pink-500" />
      </div>
    </motion.div>
  );

  if (onClick) return CardContent;

  return (
    <Link href={`/hatchlings/${hatchling.id}`}>
      {CardContent}
    </Link>
  );
}
