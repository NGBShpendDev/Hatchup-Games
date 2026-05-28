import { Link, useLocation } from "wouter";
import { Home, Compass, Egg, Salad, Swords } from "lucide-react";
import { usePlayer } from "@/lib/playerContext";

export function BottomNav() {
  const [location] = useLocation();
  const { player } = usePlayer();
  const hasPassiveXp = (player?.passiveXpSinceLastVisit ?? 0) > 0;

  const navItems = [
    { href: "/", label: "Home", icon: <Home className="w-6 h-6" />, badge: hasPassiveXp },
    { href: "/explore", label: "Explore", icon: <Compass className="w-6 h-6" />, badge: false },
    { href: "/hatch", label: "Hatch", icon: <Egg className="w-6 h-6" />, badge: false },
    { href: "/challenges", label: "Compete", icon: <Swords className="w-6 h-6" />, badge: false },
    { href: "/nutrition", label: "Nutrition", icon: <Salad className="w-6 h-6" />, badge: false },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/50 pb-safe">
      <div className="flex justify-around items-center h-16 md:h-20 max-w-md mx-auto px-2">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex flex-col items-center justify-center w-16 h-full transition-all duration-200 cursor-pointer ${
                  isActive 
                    ? "text-primary scale-110 drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" 
                    : "text-muted-foreground hover:text-foreground hover:scale-105"
                }`}
              >
                <div className={`mb-1 transition-transform duration-300 relative ${isActive ? '-translate-y-1' : ''}`}>
                  {item.icon}
                  {item.badge && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-yellow-400 border-2 border-card animate-pulse" />
                  )}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full shadow-[0_0_10px_rgba(var(--primary),1)]" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
