import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface HatchlingReactionData {
  hatchlingName: string;
  happinessDelta: number;
  energyDelta: number;
}

interface Props {
  reaction: HatchlingReactionData | null;
  onDismiss: () => void;
  variant?: "overlay" | "inline";
}

const AUTO_HIDE_MS = 1800;

export function HatchlingReaction({ reaction, onDismiss, variant = "overlay" }: Props) {
  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [reaction, onDismiss]);

  const positive = reaction ? (reaction.happinessDelta ?? 0) >= 0 : true;
  const sprite = positive ? "😄" : "😞";
  const ringColor = positive ? "ring-green-400/60" : "ring-red-400/60";
  const tintFrom = positive ? "from-green-500/20" : "from-red-500/20";
  const accent = positive ? "text-green-300" : "text-red-300";

  const parts: string[] = [];
  if (reaction?.happinessDelta) {
    parts.push(`${reaction.happinessDelta > 0 ? "+" : ""}${reaction.happinessDelta} happiness`);
  }
  if (reaction?.energyDelta) {
    parts.push(`${reaction.energyDelta > 0 ? "+" : ""}${reaction.energyDelta} energy`);
  }
  const caption = parts.join(" · ");

  const bounceAnim = positive
    ? { y: [0, -16, 0, -8, 0], rotate: [0, -6, 6, -3, 0] }
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
            <motion.div
              className="text-6xl select-none"
              animate={bounceAnim}
              transition={{ duration: 1.4, ease: "easeInOut" }}
            >
              {sprite}
            </motion.div>
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
