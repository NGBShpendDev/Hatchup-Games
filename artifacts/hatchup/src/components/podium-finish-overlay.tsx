import { motion, AnimatePresence } from "framer-motion";
import { Medal, Zap, Coins, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PodiumFinishOverlayProps {
  show: boolean;
  rank: 2 | 3;
  challengeTitle: string;
  rewardXp: number;
  rewardCoins: number;
  onDismiss: () => void;
  onShare?: () => void;
  isSharing?: boolean;
  shared?: boolean;
}

const RANK_THEME = {
  2: {
    label: "Silver Medalist",
    headline: "Podium Finish!",
    accentText: "text-slate-200",
    eyebrow: "text-slate-300/90",
    medalBg: "from-slate-200 via-slate-400 to-slate-600",
    medalIcon: "text-slate-900",
    panel:
      "border-slate-300/40 bg-gradient-to-b from-slate-800/80 via-slate-900/80 to-black/90 shadow-[0_0_50px_-10px_rgba(203,213,225,0.5)]",
    chip: "border-slate-300/30 bg-slate-300/10",
    chipLabel: "text-slate-200/80",
    chipValue: "text-slate-100",
    shareBtn:
      "border-slate-300/40 bg-slate-300/10 text-slate-100 hover:bg-slate-300/20",
    dismissBtn: "bg-slate-200 text-slate-900 hover:bg-slate-100",
    burst: "bg-slate-200",
  },
  3: {
    label: "Bronze Medalist",
    headline: "Podium Finish!",
    accentText: "text-amber-200",
    eyebrow: "text-amber-400/90",
    medalBg: "from-amber-400 via-amber-600 to-amber-800",
    medalIcon: "text-amber-950",
    panel:
      "border-amber-500/40 bg-gradient-to-b from-amber-950/80 via-stone-900/80 to-black/90 shadow-[0_0_50px_-10px_rgba(217,119,6,0.55)]",
    chip: "border-amber-500/30 bg-amber-500/10",
    chipLabel: "text-amber-300/80",
    chipValue: "text-amber-200",
    shareBtn:
      "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
    dismissBtn: "bg-amber-500 text-amber-950 hover:bg-amber-400",
    burst: "bg-amber-400",
  },
} as const;

export function PodiumFinishOverlay({
  show,
  rank,
  challengeTitle,
  rewardXp,
  rewardCoins,
  onDismiss,
  onShare,
  isSharing,
  shared,
}: PodiumFinishOverlayProps) {
  const theme = RANK_THEME[rank];
  const placeText = rank === 2 ? "2nd place" : "3rd place";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md cursor-pointer p-4"
          data-testid={`overlay-tournament-podium-${rank}`}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-sm rounded-3xl border p-7 text-center ${theme.panel}`}
          >
            {/* Burst rays — lighter than the champion overlay */}
            {Array.from({ length: 10 }).map((_, i) => (
              <motion.div
                key={i}
                className={`pointer-events-none absolute w-1.5 h-1.5 rounded-full ${theme.burst}`}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos((i / 10) * Math.PI * 2) * 130,
                  y: Math.sin((i / 10) * Math.PI * 2) * 130,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1, delay: 0.25, ease: "easeOut" }}
                style={{ left: "50%", top: "50%" }}
              />
            ))}

            <motion.div
              animate={{ rotate: [0, -6, 6, -4, 4, 0], scale: [1, 1.12, 1] }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className={`relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${theme.medalBg}`}
            >
              <Medal className={`w-10 h-10 ${theme.medalIcon}`} strokeWidth={2.5} />
            </motion.div>

            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`text-[11px] font-black uppercase tracking-[0.25em] ${theme.eyebrow}`}
            >
              {theme.label}
            </motion.p>

            <motion.h2
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
              className="mt-2 font-black text-2xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            >
              {theme.headline}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className={`mt-2 text-sm font-bold ${theme.accentText} line-clamp-2`}
            >
              You took {placeText} in
              <span className="text-white"> "{challengeTitle}"</span>
            </motion.p>

            <motion.div
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="mt-5 grid grid-cols-2 gap-2"
            >
              <div className={`rounded-xl border p-3 ${theme.chip}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${theme.chipLabel}`}>
                  XP Earned
                </p>
                <p className={`mt-0.5 flex items-center justify-center gap-1 font-black text-lg ${theme.chipValue}`}>
                  <Zap className="w-4 h-4" />
                  {rewardXp.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-xl border p-3 ${theme.chip}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${theme.chipLabel}`}>
                  Coins Earned
                </p>
                <p className={`mt-0.5 flex items-center justify-center gap-1 font-black text-lg ${theme.chipValue}`}>
                  <Coins className="w-4 h-4" />
                  {rewardCoins.toLocaleString()}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85 }}
              className="mt-6 space-y-2"
            >
              {onShare && (
                <Button
                  onClick={onShare}
                  disabled={isSharing || shared}
                  variant="outline"
                  className={`w-full font-black ${theme.shareBtn}`}
                  data-testid={`button-share-podium-${rank}`}
                >
                  {shared ? (
                    <>
                      <Check className="w-4 h-4 mr-2" /> Shared to feed
                    </>
                  ) : isSharing ? (
                    "Sharing…"
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 mr-2" /> Share Podium Finish
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={onDismiss}
                className={`w-full font-black ${theme.dismissBtn}`}
                data-testid={`button-dismiss-podium-${rank}`}
              >
                Nice Run
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
