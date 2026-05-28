import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

interface LevelUpOverlayProps {
  show: boolean;
  level: number;
  newBadges?: { key: string; name: string; icon: string; tier: string }[];
  onDismiss: () => void;
}

export function LevelUpOverlay({ show, level, newBadges = [], onDismiss }: LevelUpOverlayProps) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
        >
          <motion.div
            initial={{ scale: 0.3, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="text-center px-8"
          >
            {/* Burst particles */}
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-yellow-400"
                initial={{ scale: 0, x: 0, y: 0 }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos((i / 12) * Math.PI * 2) * 120,
                  y: Math.sin((i / 12) * Math.PI * 2) * 120,
                }}
                transition={{ duration: 0.8, delay: 0.2 }}
                style={{ left: "50%", top: "50%" }}
              />
            ))}

            <motion.div
              animate={{ rotate: [0, -5, 5, -5, 5, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-8xl mb-4 select-none"
            >
              ⚡
            </motion.div>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-yellow-400 font-black text-xl uppercase tracking-widest mb-2"
            >
              Level Up!
            </motion.p>

            <motion.p
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
              className="font-black text-7xl text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]"
            >
              {level}
            </motion.p>

            {newBadges.length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-6 space-y-2"
              >
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  Badge{newBadges.length > 1 ? "s" : ""} Unlocked!
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {newBadges.map(b => (
                    <div key={b.key} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
                      <span className="text-xl">{b.icon}</span>
                      <span className="text-sm font-black text-white">{b.name}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="text-xs text-muted-foreground mt-6"
            >
              Tap to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
