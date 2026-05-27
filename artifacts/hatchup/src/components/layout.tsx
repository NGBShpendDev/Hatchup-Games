import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useGetPlayer, getGetPlayerQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Flame, Star, Trophy, Sparkles, Zap, Shield, Swords, Calendar } from "lucide-react";

export const PLAYER_ID = 1;

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: player } = useGetPlayer(PLAYER_ID, {
    query: { enabled: true, queryKey: getGetPlayerQueryKey(PLAYER_ID) }
  });

  const navItems = [
    { href: "/", label: "Dashboard", icon: <Star className="w-5 h-5" /> },
    { href: "/hatchlings", label: "My Hatchlings", icon: <Flame className="w-5 h-5" /> },
    { href: "/hatch", label: "Hatch New", icon: <Sparkles className="w-5 h-5" /> },
    { href: "/evolutions", label: "Evolutions", icon: <Zap className="w-5 h-5" /> },
    { href: "/compete", label: "Compete", icon: <Swords className="w-5 h-5" /> },
    { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="w-5 h-5" /> },
    { href: "/events", label: "Events", icon: <Calendar className="w-5 h-5" /> },
    { href: "/club", label: "Club", icon: <Shield className="w-5 h-5" /> },
  ];

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        className="w-64 bg-card border-r border-border flex flex-col shrink-0 z-10 shadow-2xl relative"
      >
        <div className="p-6 border-b border-border bg-gradient-to-br from-primary/20 to-transparent">
          <Link href="/">
            <h1 className="text-3xl font-black tracking-tighter text-primary cursor-pointer drop-shadow-md hover:scale-105 transition-transform origin-left">
              HATCHUP
            </h1>
          </Link>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 font-bold" 
                    : "hover:bg-muted text-muted-foreground hover:text-foreground font-semibold"
                }`}>
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {player && (
          <div className="p-4 border-t border-border bg-card-foreground/5">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-primary shadow-sm">
                <AvatarImage src={player.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold">{player.username.substring(0,2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-sm leading-tight">{player.displayName || player.username}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-black bg-primary/20 text-primary px-2 py-0.5 rounded-full">Lvl {player.level}</span>
                  <span className="text-xs font-bold text-yellow-500 flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-yellow-500" /> {player.coins}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-background via-background to-black">
        {/* Subtle noise texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjciIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbikiLz48L3N2Zz4=')]" />
        
        <div className="relative z-10 p-6 md:p-10 min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
