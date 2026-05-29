import { ReactNode, useEffect, useRef } from "react";
import { BottomNav } from "./bottom-nav";
import { TopBar } from "./top-bar";
import { UniversePalette } from "./universe-palette";
import { AIAssistantFab } from "./ai-assistant-fab";
import { useChallengeNotifications } from "@/hooks/use-challenge-notifications";
import { useNotificationsToast } from "@/hooks/use-notifications-toast";
import { TournamentChampionGate } from "./tournament-champion-gate";

/**
 * Fire a background health sync whenever the user returns to this tab.
 * This ensures steps/workouts from connected trackers (Google Fit, Fitbit,
 * Garmin, Oura) are up-to-date even if the server's 30-min passive sync
 * job hasn't run yet since the user was last active.
 */
function useHealthSyncOnFocus() {
  const lastSyncRef = useRef<number>(0);
  const MIN_INTERVAL_MS = 5 * 60 * 1000; // at most once every 5 min

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastSyncRef.current < MIN_INTERVAL_MS) return;
      lastSyncRef.current = now;

      // Fire-and-forget — don't block the UI
      fetch("/api/health/sync", {
        method: "POST",
        credentials: "include",
      }).catch(() => { /* silent — user may not have any connected trackers */ });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
}

export function Layout({ children }: { children: ReactNode }) {
  useChallengeNotifications();
  useNotificationsToast();
  useHealthSyncOnFocus();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground overflow-hidden font-sans flex flex-col relative pb-20 md:pb-24">
      {/* Cinematic noise and gradient backdrop */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-black pointer-events-none -z-10" />
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjciIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbikiLz48L3N2Zz4=')] -z-10" />

      <TopBar />

      <main className="flex-1 overflow-y-auto w-full max-w-lg mx-auto relative shadow-2xl bg-background/50 border-x border-border/10">
        <div className="relative z-10 p-4 md:p-6 pt-20 min-h-full">
          {children}
        </div>
      </main>

      <UniversePalette />
      <AIAssistantFab />
      <BottomNav />
      <TournamentChampionGate />
    </div>
  );
}
