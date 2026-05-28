import { useEffect, useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, ChevronRight, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface Suggestion {
  title: string;
  description: string;
  href: string;
}

function suggestionsFor(path: string): Suggestion[] {
  if (path.startsWith("/hatchlings/")) {
    return [
      { title: "Boost this Hatchling", description: "Run a workout that grants the most XP to your active Pal.", href: "/training" },
      { title: "Fuel for battle", description: "Log a meal to raise battle readiness.", href: "/nutrition" },
      { title: "Find an opponent", description: "Match into a quick race or battle.", href: "/compete/battle" },
    ];
  }
  if (path.startsWith("/nutrition")) {
    return [
      { title: "Pair it with a workout", description: "A meal + workout combo doubles your daily streak progress.", href: "/training" },
      { title: "Show readiness", description: "Check how today's meals affect your battle stats.", href: "/compete/battle" },
      { title: "Ask the AI Coach", description: "Get a personalized meal idea right now.", href: "/coach" },
    ];
  }
  if (path.startsWith("/compete") || path.startsWith("/challenges")) {
    return [
      { title: "Power up first", description: "Log a quick workout to raise your match score.", href: "/" },
      { title: "Invite a friend", description: "Bring a partner to a challenge for bonus XP.", href: "/social" },
      { title: "Climb the leaderboard", description: "See where you rank globally.", href: "/social" },
    ];
  }
  if (path.startsWith("/social")) {
    return [
      { title: "Share your last PR", description: "Post your latest record to your feed.", href: "/records" },
      { title: "Discover groups", description: "Find local workout partners.", href: "/groups" },
      { title: "Start a challenge", description: "Spin up a public fitness challenge.", href: "/challenges/create" },
    ];
  }
  if (path.startsWith("/groups")) {
    return [
      { title: "Meet in public", description: "Pick a public park or gym before inviting others.", href: "/safety/guidelines" },
      { title: "Stake a goal", description: "Turn this group into a challenge.", href: "/challenges/create" },
    ];
  }
  if (path.startsWith("/hatch")) {
    return [
      { title: "Earn another egg", description: "Most eggs come from streaks — log today's activity.", href: "/" },
      { title: "See what's possible", description: "Browse the evolution catalog.", href: "/explore" },
    ];
  }
  return [
    { title: "Plan today's win", description: "Get a personalized workout plan.", href: "/training" },
    { title: "Log activity", description: "Log a quick workout to feed your Pals.", href: "/" },
    { title: "Talk to the coach", description: "Open the AI Coach for deep guidance.", href: "/coach" },
  ];
}

export function AIAssistantFab() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const items = useMemo(() => suggestionsFor(location), [location]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-ai-assistant", onOpen);
    return () => window.removeEventListener("open-ai-assistant", onOpen);
  }, []);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.92 }}
        animate={{ y: [0, -3, 0] }}
        transition={{ y: { repeat: Infinity, duration: 3, ease: "easeInOut" } }}
        onClick={() => setOpen(true)}
        aria-label="Open AI Assistant"
        className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_25px_-2px_hsl(var(--primary)/0.8)] flex items-center justify-center border border-white/20 backdrop-blur"
      >
        <Bot className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 border-2 border-background animate-pulse" />
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="bg-card/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2 text-xl font-black">
              <Sparkles className="w-5 h-5 text-primary" /> AI Assistant
            </SheetTitle>
            <SheetDescription>
              Smart suggestions based on where you are right now.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            <AnimatePresence>
              {items.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={s.href} onClick={() => setOpen(false)}>
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-background/40 hover:border-primary/50 hover:bg-background/60 transition-all cursor-pointer active:scale-[0.98]">
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm leading-tight">{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-2">
            <Link href="/coach" onClick={() => setOpen(false)}>
              <button className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-black uppercase tracking-wide shadow-[0_0_18px_-4px_hsl(var(--primary)/0.7)]">
                <Bot className="w-4 h-4" /> Chat with Coach
              </button>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" /> Close
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
