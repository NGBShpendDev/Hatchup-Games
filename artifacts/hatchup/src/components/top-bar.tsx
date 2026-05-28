import { Link } from "wouter";
import { Bot, Settings, Flame } from "lucide-react";
import { usePlayer } from "@/lib/playerContext";
import { UniversePaletteTrigger } from "./universe-palette";
import { NotificationsBell } from "./notifications-bell";

// Approximate XP-to-next-level used purely for top-bar ring presentation.
// The Home dashboard uses the authoritative server values; this just gives
// every page a live-feeling progress ring without an extra fetch.
function xpRingPct(level: number, xp: number): number {
  const base = 150;
  const forLevel = (lv: number) => Math.round(base * Math.pow(1.35, Math.max(0, lv - 1)));
  let acc = 0;
  for (let i = 1; i < level; i++) acc += forLevel(i);
  const need = forLevel(level);
  const inLevel = Math.max(0, xp - acc);
  return Math.max(0, Math.min(100, Math.round((inLevel / need) * 100)));
}

export function TopBar() {
  const { player } = usePlayer();
  if (!player) return null;
  const pct = xpRingPct(player.level, player.xp);
  const initial = (player.displayName ?? player.username ?? "?").charAt(0).toUpperCase();

  return (
    <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-lg mx-auto px-3 pt-3 flex items-center justify-between gap-2 pointer-events-auto">
        {/* Avatar + level ring */}
        <Link href="/health-settings">
          <button className="group flex items-center gap-2" aria-label="Open profile">
            <div className="relative w-10 h-10">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r="17" stroke="hsl(var(--muted))" strokeWidth="3" fill="none" />
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  stroke="url(#xp-grad)"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 17}
                  strokeDashoffset={(2 * Math.PI * 17) * (1 - pct / 100)}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 600ms ease" }}
                />
                <defs>
                  <linearGradient id="xp-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-1 rounded-full bg-card/90 backdrop-blur border border-white/10 flex items-center justify-center text-[11px] font-black text-foreground">
                {initial}
              </div>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Level</span>
              <span className="text-sm font-black text-foreground">{player.level}</span>
            </div>
          </button>
        </Link>

        <div className="flex items-center gap-2">
          {(player.currentStreak ?? 0) > 0 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-card/60 backdrop-blur border border-orange-500/30 text-orange-400">
              <Flame className="w-3.5 h-3.5" />
              <span className="text-xs font-black">{player.currentStreak}d</span>
            </div>
          )}
          <UniversePaletteTrigger />
          <NotificationsBell />
          <button
            onClick={() => window.dispatchEvent(new Event("open-ai-assistant"))}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center shadow-[0_0_14px_-2px_hsl(var(--primary)/0.7)] border border-white/15"
            aria-label="Open AI Assistant"
          >
            <Bot className="w-4 h-4" />
          </button>
          <Link href="/health-settings">
            <button
              className="w-9 h-9 rounded-full bg-card/60 backdrop-blur border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
