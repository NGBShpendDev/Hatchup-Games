import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NeonButton } from "@/components/ui/neon-button";
import { Sparkles, Trophy, Zap, Gift, Heart, Swords } from "lucide-react";

export interface RewardEntry {
  kind: "xp" | "artifact" | "streak" | "hatchling" | "leaderboard" | "challenge";
  label: string;
  value?: string | number;
  detail?: string;
}

const ICONS = {
  xp: <Zap className="w-5 h-5" />,
  artifact: <Gift className="w-5 h-5" />,
  streak: <Sparkles className="w-5 h-5" />,
  hatchling: <Heart className="w-5 h-5" />,
  leaderboard: <Trophy className="w-5 h-5" />,
  challenge: <Swords className="w-5 h-5" />,
};

const COLORS = {
  xp: "from-yellow-500/20 to-amber-500/10 border-yellow-500/40 text-yellow-300",
  artifact: "from-pink-500/20 to-rose-500/10 border-pink-500/40 text-pink-300",
  streak: "from-orange-500/20 to-red-500/10 border-orange-500/40 text-orange-300",
  hatchling: "from-fuchsia-500/20 to-purple-500/10 border-fuchsia-500/40 text-fuchsia-300",
  leaderboard: "from-cyan-500/20 to-blue-500/10 border-cyan-500/40 text-cyan-300",
  challenge: "from-violet-500/20 to-indigo-500/10 border-violet-500/40 text-violet-300",
};

export function RewardSummaryModal({
  open,
  onClose,
  title = "Reward Summary",
  rewards,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  rewards: RewardEntry[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border border-white/10 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative space-y-4">
          <div className="text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 18 }}
              className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_30px_-2px_hsl(var(--primary)/0.8)]"
            >
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </motion.div>
            <h2 className="text-2xl font-black mt-3">{title}</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Your moves rippled through the universe.
            </p>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {rewards.map((r, i) => (
                <motion.div
                  key={`${r.kind}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border bg-gradient-to-r ${COLORS[r.kind]}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-black/30 flex items-center justify-center">
                    {ICONS[r.kind]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm leading-tight">{r.label}</p>
                    {r.detail && <p className="text-[11px] opacity-80 mt-0.5">{r.detail}</p>}
                  </div>
                  {r.value !== undefined && (
                    <span className="font-black text-lg">{typeof r.value === "number" ? `+${r.value}` : r.value}</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <NeonButton onClick={onClose} className="w-full">
            Awesome
          </NeonButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
