import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface XpBarProps {
  level: number;
  xpPercent: number;
  xpCurrentLevel: number;
  xpForNextLevel: number;
  prestige?: number;
  className?: string;
  compact?: boolean;
}

const PRESTIGE_COLORS = [
  "from-primary to-purple-600",
  "from-blue-500 to-cyan-400",
  "from-green-500 to-emerald-400",
  "from-yellow-500 to-amber-400",
  "from-orange-500 to-red-400",
  "from-pink-500 to-rose-400",
];

export function XpBar({ level, xpPercent, xpCurrentLevel, xpForNextLevel, prestige = 0, className, compact = false }: XpBarProps) {
  const barColor = PRESTIGE_COLORS[Math.min(prestige, PRESTIGE_COLORS.length - 1)];
  const isNearLevelUp = xpPercent >= 85;

  return (
    <div className={cn("space-y-1", className)}>
      {!compact && (
        <div className="flex justify-between items-center text-xs font-bold">
          <span className="text-muted-foreground uppercase tracking-wider">
            {prestige > 0 ? `✦ P${prestige} · ` : ""}Level {level}
          </span>
          <span className={isNearLevelUp ? "text-yellow-400 animate-pulse" : "text-muted-foreground"}>
            {xpCurrentLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
          </span>
        </div>
      )}
      <div className={cn(
        "relative rounded-full overflow-hidden bg-black/30",
        compact ? "h-2" : "h-3"
      )}>
        <motion.div
          className={cn("h-full rounded-full bg-gradient-to-r", barColor, "relative")}
          initial={{ width: 0 }}
          animate={{ width: `${xpPercent}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {isNearLevelUp && !compact && (
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          )}
          {!compact && xpPercent > 10 && (
            <div className="absolute right-0 top-0 bottom-0 w-px bg-white/50 shadow-[0_0_6px_white]" />
          )}
        </motion.div>
        {/* Glow effect */}
        {prestige > 0 && !compact && (
          <div
            className={cn("absolute inset-0 rounded-full opacity-30 blur-sm bg-gradient-to-r pointer-events-none", barColor)}
            style={{ width: `${xpPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}
