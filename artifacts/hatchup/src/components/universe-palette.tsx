import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home as HomeIcon, Egg, Salad, Swords, MessageSquare, Trophy, Users, Sparkles,
  Bot, Activity, Shield, Gift, Compass, ScrollText, BookOpen, Settings,
  HeartPulse, Bell, Search,
} from "lucide-react";

interface Item {
  label: string;
  href: string;
  icon: React.ReactNode;
  group: "Beginner" | "Play" | "Social" | "Coach" | "Account";
  keywords?: string[];
}

const ITEMS: Item[] = [
  { label: "Home", href: "/", icon: <HomeIcon className="w-4 h-4" />, group: "Beginner" },
  { label: "Hatchlings", href: "/explore", icon: <Sparkles className="w-4 h-4" />, group: "Beginner", keywords: ["pals", "creatures"] },
  { label: "Hatch an Egg", href: "/hatch", icon: <Egg className="w-4 h-4" />, group: "Beginner" },
  { label: "Compete", href: "/challenges", icon: <Swords className="w-4 h-4" />, group: "Beginner" },
  { label: "Social Feed", href: "/social", icon: <MessageSquare className="w-4 h-4" />, group: "Beginner" },

  { label: "Battle Arena", href: "/compete/battle", icon: <Swords className="w-4 h-4" />, group: "Play" },
  { label: "Race", href: "/compete/race", icon: <Activity className="w-4 h-4" />, group: "Play" },
  { label: "Training Plans", href: "/training", icon: <ScrollText className="w-4 h-4" />, group: "Play" },
  { label: "Nutrition", href: "/nutrition", icon: <Salad className="w-4 h-4" />, group: "Play" },
  { label: "Personal Records", href: "/records", icon: <Trophy className="w-4 h-4" />, group: "Play" },
  { label: "Artifacts Museum", href: "/artifacts", icon: <BookOpen className="w-4 h-4" />, group: "Play" },
  { label: "Rewards", href: "/rewards", icon: <Gift className="w-4 h-4" />, group: "Play" },

  { label: "Groups", href: "/groups", icon: <Users className="w-4 h-4" />, group: "Social" },
  { label: "Challenges", href: "/challenges", icon: <Compass className="w-4 h-4" />, group: "Social" },
  { label: "Create Challenge", href: "/challenges/create", icon: <Sparkles className="w-4 h-4" />, group: "Social" },
  { label: "Family Team", href: "/family", icon: <HeartPulse className="w-4 h-4" />, group: "Social" },

  { label: "AI Coach", href: "/coach", icon: <Bot className="w-4 h-4" />, group: "Coach" },

  { label: "Health Settings", href: "/health-settings", icon: <HeartPulse className="w-4 h-4" />, group: "Account" },
  { label: "Privacy & Safety", href: "/settings/privacy", icon: <Shield className="w-4 h-4" />, group: "Account" },
  { label: "Safety Guidelines", href: "/safety/guidelines", icon: <Shield className="w-4 h-4" />, group: "Account" },
];

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export function UniversePalette() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-universe-palette", () => setOpen(true));
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = Array.from(new Set(ITEMS.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump anywhere in the HatchUp universe…" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No matches in the universe.</CommandEmpty>
        {groups.map((g, gi) => (
          <div key={g}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {ITEMS.filter((i) => i.group === g).map((item) => (
                <CommandItem
                  key={item.label + item.href}
                  value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                  onSelect={() => {
                    setOpen(false);
                    navigate(item.href);
                  }}
                  className="gap-3 cursor-pointer"
                >
                  <span className="text-primary">{item.icon}</span>
                  <span className="font-bold">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function UniversePaletteTrigger({ className }: { className?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("open-universe-palette"))}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/60 backdrop-blur px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      }
      aria-label="Open universe quick switcher"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Jump…</span>
      <kbd className="hidden md:inline rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
    </button>
  );
}

export { BASE as PALETTE_BASE };
