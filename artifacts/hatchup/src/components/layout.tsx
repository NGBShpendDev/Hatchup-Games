import { ReactNode } from "react";
import { Link } from "wouter";
import { Settings } from "lucide-react";
import { BottomNav } from "./bottom-nav";
import { useChallengeNotifications } from "@/hooks/use-challenge-notifications";

export function Layout({ children }: { children: ReactNode }) {
  useChallengeNotifications();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground overflow-hidden font-sans flex flex-col relative pb-20 md:pb-24">
      {/* Cinematic noise and gradient backdrop */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-black pointer-events-none -z-10" />
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjciIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbikiLz48L3N2Zz4=')] -z-10" />

      {/* Global top bar with settings shortcut */}
      <div className="fixed top-0 right-0 z-40 p-3">
        <Link href="/health-settings">
          <button className="w-8 h-8 rounded-full bg-card/60 backdrop-blur border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all">
            <Settings className="w-4 h-4" />
          </button>
        </Link>
      </div>
      
      <main className="flex-1 overflow-y-auto w-full max-w-lg mx-auto relative shadow-2xl bg-background/50 border-x border-border/10">
        <div className="relative z-10 p-4 md:p-6 min-h-full">
          {children}
        </div>
      </main>
      
      <BottomNav />
    </div>
  );
}
