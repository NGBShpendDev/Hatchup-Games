import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

export interface HatchlingReactionData {
  hatchlingName: string;
  happinessDelta: number;
  energyDelta: number;
  imageUrl?: string | null;
  realm?: string | null;
}

interface Props {
  reaction: HatchlingReactionData | null;
  onDismiss: () => void;
  variant?: "overlay" | "inline";
}

const AUTO_HIDE_MS = 1800;

// Per-realm tint used to give the sprite the same colored glow that the
// hatchling detail page applies (`drop-shadow(0 0 20px <color>60)`).
const REALM_TINT: Record<string, { color: string; ring: string; gradient: string }> = {
  strength: { color: "#ef4444", ring: "ring-red-400/60",    gradient: "from-red-500/25"    },
  cardio:   { color: "#06b6d4", ring: "ring-cyan-400/60",   gradient: "from-cyan-500/25"   },
  balance:  { color: "#a855f7", ring: "ring-purple-400/60", gradient: "from-purple-500/25" },
  beast:    { color: "#22c55e", ring: "ring-green-400/60",  gradient: "from-green-500/25"  },
  mythic:   { color: "#ec4899", ring: "ring-pink-400/60",   gradient: "from-pink-500/25"   },
};

function realmFallbackImage(realm?: string | null) {
  switch ((realm ?? "").toLowerCase()) {
    case "strength": return lavaDragonImg;
    case "cardio":   return cyberCreatureImg;
    case "beast":    return shadowBeastImg;
    case "mythic":   return cosmicEntityImg;
    case "balance":  return crystalGuardianImg;
    case "candy":    return candyMonsterImg;
    default:         return lavaDragonImg;
  }
}

export function HatchlingReaction({ reaction, onDismiss, variant = "overlay" }: Props) {
  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [reaction, onDismiss]);

  const positive = reaction ? (reaction.happinessDelta ?? 0) >= 0 : true;
  const hasSprite = !!(reaction?.imageUrl || reaction?.realm);
  const tint = reaction?.realm ? REALM_TINT[reaction.realm.toLowerCase()] : undefined;
  const ringColor = tint?.ring ?? (positive ? "ring-green-400/60" : "ring-red-400/60");
  const tintFrom = tint?.gradient ?? (positive ? "from-green-500/20" : "from-red-500/20");
  const accent = positive ? "text-green-300" : "text-red-300";
  const spriteSrc = hasSprite
    ? (reaction!.imageUrl || realmFallbackImage(reaction!.realm))
    : null;

  const parts: string[] = [];
  if (reaction?.happinessDelta) {
    parts.push(`${reaction.happinessDelta > 0 ? "+" : ""}${reaction.happinessDelta} happiness`);
  }
  if (reaction?.energyDelta) {
    parts.push(`${reaction.energyDelta > 0 ? "+" : ""}${reaction.energyDelta} energy`);
  }
  const caption = parts.join(" · ");

  // Happy = bounce + wiggle; sad = slump downward with a small head-shake.
  const bounceAnim = positive
    ? { y: [0, -16, 0, -8, 0], rotate: [0, -6, 6, -3, 0], scale: [1, 1.05, 1, 1.02, 1] }
    : { y: [0, 6, 6, 6, 0], rotate: [0, -4, 0, 4, 0], scale: [1, 0.92, 0.92, 0.95, 1] };

  const containerBase =
    variant === "overlay"
      ? "fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
      : "w-full flex items-center justify-center my-3";

  return (
    <AnimatePresence>
      {reaction && (
        <motion.div
          key="hatchling-reaction"
          className={containerBase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss reaction"
            className={`pointer-events-auto cursor-pointer rounded-3xl px-6 py-4 bg-gradient-to-br ${tintFrom} to-black/40 backdrop-blur-md ring-2 ${ringColor} shadow-2xl flex flex-col items-center gap-2`}
            initial={{ scale: 0.6, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.6, opacity: 0, y: -10 }}
            transition={{ type: "spring", damping: 14, stiffness: 260 }}
          >
            {spriteSrc ? (
              <motion.img
                src={spriteSrc}
                alt={reaction.hatchlingName}
                className="w-24 h-24 object-contain select-none pointer-events-none"
                style={tint ? { filter: `drop-shadow(0 0 18px ${tint.color}99)` } : undefined}
                animate={bounceAnim}
                transition={{ duration: 1.4, ease: "easeInOut" }}
                draggable={false}
              />
            ) : (
              <motion.div
                className="text-6xl select-none"
                animate={bounceAnim}
                transition={{ duration: 1.4, ease: "easeInOut" }}
              >
                {positive ? "😄" : "😞"}
              </motion.div>
            )}
            <p className="font-black text-sm text-white text-center">
              {reaction.hatchlingName}{" "}
              <span className={accent}>{positive ? "loved it!" : "didn't enjoy that"}</span>
            </p>
            {caption && (
              <p className={`text-[11px] font-bold ${accent}`}>{caption}</p>
            )}
            <p className="text-[9px] text-white/50 uppercase tracking-wider font-bold">
              Tap to dismiss
            </p>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
