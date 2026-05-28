import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGetDailyStreak, useClaimDailyReward, getGetDailyStreakQueryKey, useBuyStreakShield } from "@workspace/api-client-react";
import type { DailyRewardDay, DailyClaimResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetPlayerDashboardQueryKey } from "@workspace/api-client-react";
import { CheckCircle2, Lock, Gift, Flame, ShieldCheck, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_BG: Record<string, string> = {
  coins:    "from-yellow-500/20 to-yellow-600/10 border-yellow-500/40",
  xp:       "from-blue-500/20 to-blue-600/10 border-blue-500/40",
  egg:      "from-green-500/20 to-green-600/10 border-green-500/40",
  artifact: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/40",
  chest:    "from-purple-500/20 to-pink-600/10 border-purple-500/40",
};

const MILESTONE_DAYS = new Set([7, 14, 21, 30]);

const SHIELD_COST = 200;

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: number;
  onClaimed?: (result: DailyClaimResult) => void;
}

export function StreakCalendarModal({ open, onClose, playerId, onClaimed }: Props) {
  const queryClient = useQueryClient();
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: streak, isLoading } = useGetDailyStreak({
    query: {
      queryKey: getGetDailyStreakQueryKey(),
      enabled: open,
    },
  });

  const claim = useClaimDailyReward({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlayerDashboardQueryKey(playerId) });
        onClaimed?.(result);
      },
    },
  });

  const buyShield = useBuyStreakShield({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlayerDashboardQueryKey(playerId) });
      },
    },
  });

  // Scroll the current day tile into view when modal opens
  useEffect(() => {
    if (!open || !streak || !gridRef.current) return;
    const nextDay = streak.alreadyClaimed ? streak.currentDay : streak.currentDay + 1;
    const tile = gridRef.current.querySelector(`[data-day="${nextDay}"]`) as HTMLElement | null;
    if (tile) {
      setTimeout(() => tile.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [open, streak]);

  const currentDay = streak?.currentDay ?? 0;
  const todayDayNumber = streak?.alreadyClaimed ? currentDay : currentDay + 1;
  const schedule = streak?.schedule ?? [];
  const shieldCount = streak?.streakShields ?? 0;
  const shieldActive = streak?.shieldActive ?? false;

  function getDayState(day: DailyRewardDay): "claimed" | "today" | "future" {
    if (day.day < todayDayNumber) return "claimed";
    if (day.day === todayDayNumber) return "today";
    return "future";
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0 bg-[#0d0d14] border border-white/10 rounded-2xl overflow-hidden">
        <DialogHeader className="p-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-black">Daily Login Rewards</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {currentDay > 0 ? (
                  streak?.alreadyClaimed
                    ? `Day ${currentDay} claimed — come back tomorrow!`
                    : streak?.streakBroken
                    ? "Streak reset — start fresh today!"
                    : `🔥 ${currentDay}-day streak — claim today's reward!`
                ) : (
                  "Claim your first reward today!"
                )}
              </p>
            </div>
            {/* Shield count badge */}
            {shieldCount > 0 && (
              <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-2 py-1 flex-shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-400">{shieldCount}</span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Shield used notice */}
        <AnimatePresence>
          {shieldActive && streak?.alreadyClaimed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-5 mb-2 bg-cyan-950/40 border border-cyan-500/30 rounded-xl px-3 py-2 text-sm text-cyan-300 flex items-center gap-2 flex-shrink-0"
            >
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>A Streak Shield was used to protect your streak!</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streak broken notice */}
        <AnimatePresence>
          {streak?.streakBroken && !streak.alreadyClaimed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-5 mb-2 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2 text-sm text-red-300 flex-shrink-0"
            >
              😔 You missed a day and your streak reset to Day 1. No worries — start fresh!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calendar grid */}
        <div ref={gridRef} className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
          {isLoading ? (
            <div className="grid grid-cols-5 gap-2 pt-2">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 pt-2">
              {schedule.map((day) => {
                const state = getDayState(day);
                const isMilestone = MILESTONE_DAYS.has(day.day);
                const isShieldDay = shieldActive && state === "claimed" && day.day === currentDay;

                return (
                  <motion.div
                    key={day.day}
                    data-day={day.day}
                    initial={state === "today" ? { scale: 0.9 } : false}
                    animate={state === "today" ? { scale: 1 } : {}}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-xl border aspect-square p-1 gap-0.5 select-none",
                      state === "claimed" && !isShieldDay && "bg-gradient-to-br from-green-500/15 to-green-600/5 border-green-500/30 opacity-70",
                      isShieldDay && "bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/40 opacity-90",
                      state === "today" && !streak?.alreadyClaimed && cn("bg-gradient-to-br border-2", KIND_BG[day.kind] ?? "border-primary/50", "ring-2 ring-primary/30 shadow-[0_0_12px_rgba(255,45,85,0.3)]"),
                      state === "today" && streak?.alreadyClaimed && "bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/50 opacity-80",
                      state === "future" && "bg-white/3 border-white/10 opacity-50",
                      isMilestone && state !== "future" && "border-2",
                      isMilestone && state === "future" && "border-yellow-500/20",
                    )}
                  >
                    {/* Day number */}
                    <span className="text-[9px] font-black text-muted-foreground leading-none">{day.day}</span>

                    {/* Icon */}
                    {isShieldDay ? (
                      <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    ) : state === "claimed" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : state === "future" ? (
                      <span className="text-base leading-none grayscale">{day.icon}</span>
                    ) : (
                      <span className="text-base leading-none">{day.icon}</span>
                    )}

                    {/* Label */}
                    <span className={cn(
                      "text-[8px] font-bold leading-none text-center truncate w-full text-center",
                      isShieldDay ? "text-cyan-400/80" : state === "claimed" ? "text-green-400/70" : state === "future" ? "text-muted-foreground/50" : "text-foreground/80",
                    )}>
                      {isShieldDay ? "Shield" : day.label.replace(" Coins", "¢").replace(" XP", "xp").replace("Streak ", "")}
                    </span>

                    {/* Milestone glow ring */}
                    {isMilestone && state !== "future" && (
                      <div className="absolute inset-0 rounded-xl ring-1 ring-yellow-400/30 pointer-events-none" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA footer */}
        <div className="p-5 pt-3 border-t border-white/10 flex-shrink-0 space-y-3">
          {streak && !streak.alreadyClaimed && (
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{streak.todayReward?.icon ?? "🎁"}</span>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Today's reward</p>
                  <p className="text-sm font-black">{streak.todayReward?.label}</p>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>+{streak.todayReward?.coins} coins</p>
                <p>+{streak.todayReward?.xp} XP</p>
              </div>
            </div>
          )}

          {/* Streak Shield purchase row */}
          <div className="flex items-center justify-between bg-cyan-950/30 border border-cyan-500/20 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-black text-cyan-300">Streak Shield</p>
                <p className="text-[10px] text-muted-foreground">Auto-protects your streak if you miss a day</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 flex items-center gap-1 text-xs h-7 px-2.5 flex-shrink-0"
              disabled={buyShield.isPending}
              onClick={() => buyShield.mutate()}
            >
              <ShoppingCart className="w-3 h-3" />
              {SHIELD_COST}¢
            </Button>
          </div>

          {streak?.alreadyClaimed ? (
            <Button variant="outline" className="w-full" onClick={onClose}>
              Come back tomorrow!
            </Button>
          ) : (
            <Button
              className="w-full bg-gradient-to-r from-primary to-violet-600 text-white font-black"
              disabled={claim.isPending || isLoading}
              onClick={() => claim.mutate()}
            >
              {claim.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Claiming...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Gift className="w-4 h-4" />
                  Claim Day {todayDayNumber} Reward
                </span>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
