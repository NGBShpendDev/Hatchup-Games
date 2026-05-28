import { motion, AnimatePresence } from "framer-motion";
import { Crown, Zap, Coins, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChampionVictoryOverlayProps {
  show: boolean;
  challengeTitle: string;
  boostedXp: number;
  boostedCoins: number;
  onDismiss: () => void;
}

export function ChampionVictoryOverlay({
  show,
  challengeTitle,
  boostedXp,
  boostedCoins,
  onDismiss,
}: ChampionVictoryOverlayProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md cursor-pointer p-4"
          data-testid="overlay-tournament-champion"
        >
          <motion.div
            initial={{ scale: 0.4, opacity: 0, y: 60 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl border border-yellow-400/40 bg-gradient-to-b from-yellow-950/80 via-amber-950/80 to-black/90 p-7 text-center shadow-[0_0_60px_-10px_rgba(250,204,21,0.6)]"
          >
            {/* Burst rays */}
            {Array.from({ length: 16 }).map((_, i) => (
              <motion.div
                key={i}
                className="pointer-events-none absolute w-1.5 h-1.5 rounded-full bg-yellow-300"
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{
                  scale: [0, 1.2, 0],
                  x: Math.cos((i / 16) * Math.PI * 2) * 160,
                  y: Math.sin((i / 16) * Math.PI * 2) * 160,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1.1, delay: 0.25, ease: "easeOut" }}
                style={{ left: "50%", top: "50%" }}
              />
            ))}

            <motion.div
              animate={{ rotate: [0, -8, 8, -6, 6, 0], scale: [1, 1.18, 1] }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 shadow-[0_0_40px_rgba(250,204,21,0.7)]"
            >
              <Crown className="w-12 h-12 text-yellow-950" strokeWidth={2.5} />
            </motion.div>

            <motion.p
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300/90"
            >
              Tournament Champion
            </motion.p>

            <motion.h2
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.45, type: "spring", stiffness: 200 }}
              className="mt-2 font-black text-3xl text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
            >
              Victory!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="mt-2 text-sm font-bold text-yellow-100/80 line-clamp-2"
            >
              You crushed the bracket in
              <span className="text-white"> "{challengeTitle}"</span>
            </motion.p>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-5 grid grid-cols-2 gap-2"
            >
              <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-yellow-300/80">
                  Boosted XP
                </p>
                <p className="mt-0.5 flex items-center justify-center gap-1 font-black text-lg text-yellow-300">
                  <Zap className="w-4 h-4" />
                  {boostedXp.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-300/80">
                  Boosted Coins
                </p>
                <p className="mt-0.5 flex items-center justify-center gap-1 font-black text-lg text-amber-300">
                  <Coins className="w-4 h-4" />
                  {boostedCoins.toLocaleString()}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.85 }}
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-purple-400/30 bg-purple-500/10 p-3"
            >
              <Trophy className="w-4 h-4 text-purple-300" />
              <p className="text-xs font-black text-purple-200">
                Tournament Champion badge unlocked
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.05 }}
              className="mt-6"
            >
              <Button
                onClick={onDismiss}
                className="w-full bg-yellow-400 text-yellow-950 hover:bg-yellow-300 font-black"
                data-testid="button-dismiss-champion"
              >
                Claim Glory
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
