import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

export type UnlockedArtifact = {
  id: number;
  name: string;
  rarity: string;
  lore?: string;
  imageSlug?: string;
};

interface ArtifactUnlockOverlayProps {
  queue: UnlockedArtifact[];
  onDismissAll: () => void;
}

const RARITY_THEME: Record<string, {
  glowClass: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  particleColor: string;
  label: string;
  emoji: string;
}> = {
  Legendary: {
    glowClass: "artifact-glow-legendary",
    textColor: "text-yellow-300",
    bgGradient: "from-yellow-900/40 via-amber-900/30 to-black/60",
    borderColor: "border-yellow-400/70",
    particleColor: "bg-yellow-400",
    label: "Legendary Artifact",
    emoji: "🟡",
  },
  Mythic: {
    glowClass: "artifact-glow-mythic",
    textColor: "text-pink-300",
    bgGradient: "from-pink-900/40 via-rose-900/30 to-black/60",
    borderColor: "border-pink-400/70",
    particleColor: "bg-pink-400",
    label: "Mythic Artifact",
    emoji: "🔴",
  },
  Ancient: {
    glowClass: "artifact-glow-ancient",
    textColor: "text-orange-300",
    bgGradient: "from-orange-900/50 via-amber-900/30 to-black/60",
    borderColor: "border-orange-400/70",
    particleColor: "bg-orange-400",
    label: "Ancient Artifact",
    emoji: "🟠",
  },
  Celestial: {
    glowClass: "artifact-glow-celestial",
    textColor: "text-cyan-200",
    bgGradient: "from-cyan-900/40 via-indigo-900/30 to-black/70",
    borderColor: "border-cyan-300/70",
    particleColor: "bg-cyan-300",
    label: "Celestial Artifact",
    emoji: "🌟",
  },
};

export function ArtifactUnlockOverlay({ queue, onDismissAll }: ArtifactUnlockOverlayProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [queue]);

  const current = queue[index];
  const theme = current ? RARITY_THEME[current.rarity] : undefined;

  const handleDismiss = () => {
    if (index + 1 < queue.length) {
      setIndex(i => i + 1);
    } else {
      onDismissAll();
    }
  };

  return (
    <AnimatePresence mode="wait">
      {current && theme && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleDismiss}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer p-6"
          data-testid="artifact-unlock-overlay"
        >
          {/* Background radial glow */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.4, opacity: 0.55 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className={`absolute inset-0 m-auto w-[80vmin] h-[80vmin] rounded-full blur-3xl bg-gradient-radial ${theme.bgGradient}`}
            style={{
              background: `radial-gradient(circle, ${
                current.rarity === "Celestial" ? "rgba(34,211,238,0.45)"
                : current.rarity === "Ancient" ? "rgba(249,115,22,0.45)"
                : current.rarity === "Mythic" ? "rgba(236,72,153,0.45)"
                : "rgba(234,179,8,0.45)"
              } 0%, transparent 70%)`,
            }}
          />

          {/* Particle burst */}
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              className={`absolute w-2 h-2 rounded-full ${theme.particleColor}`}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1.2, 0],
                x: Math.cos((i / 24) * Math.PI * 2) * (180 + Math.random() * 80),
                y: Math.sin((i / 24) * Math.PI * 2) * (180 + Math.random() * 80),
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.4, delay: 0.2 + (i % 6) * 0.05, ease: "easeOut" }}
              style={{ left: "50%", top: "50%" }}
            />
          ))}

          {/* Sparkle floats */}
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={`spark-${i}`}
              className={`absolute ${theme.textColor}`}
              initial={{
                opacity: 0,
                x: (Math.random() - 0.5) * 400,
                y: 200 + Math.random() * 100,
                scale: 0.4 + Math.random() * 0.6,
              }}
              animate={{
                opacity: [0, 1, 0],
                y: -300 - Math.random() * 100,
                rotate: 360,
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                delay: Math.random() * 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
              style={{ left: "50%", top: "50%" }}
            >
              <Sparkles className="w-4 h-4" />
            </motion.div>
          ))}

          <motion.div
            initial={{ scale: 0.4, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 180, damping: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 text-center max-w-md w-full"
          >
            {/* Rarity label */}
            <motion.p
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`font-black text-xs uppercase tracking-[0.3em] mb-3 ${theme.textColor}`}
            >
              {theme.emoji} {theme.label} Unlocked
            </motion.p>

            {/* Artifact medallion */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 150, damping: 12 }}
              className={`relative mx-auto w-40 h-40 rounded-full bg-gradient-to-br ${theme.bgGradient} border-4 ${theme.borderColor} ${theme.glowClass} flex items-center justify-center mb-6`}
            >
              <motion.div
                animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="text-7xl select-none drop-shadow-[0_0_18px_rgba(255,255,255,0.5)]"
              >
                {theme.emoji === "🌟" ? "✨" : "🏺"}
              </motion.div>
            </motion.div>

            {/* Name */}
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="font-black text-3xl text-white mb-3 drop-shadow-[0_0_18px_rgba(255,255,255,0.4)]"
              data-testid="artifact-unlock-name"
            >
              {current.name}
            </motion.h2>

            {/* Lore */}
            {current.lore && (
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.75 }}
                className="text-sm text-white/80 italic leading-relaxed px-2 mb-6"
                data-testid="artifact-unlock-lore"
              >
                "{current.lore}"
              </motion.p>
            )}

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="space-y-1"
            >
              {queue.length > 1 && (
                <p className={`text-xs font-black uppercase tracking-widest ${theme.textColor}`}>
                  {index + 1} / {queue.length}
                </p>
              )}
              <p className="text-[11px] text-white/60 uppercase tracking-wider">
                Tap anywhere to {index + 1 < queue.length ? "see next reward" : "continue"}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
