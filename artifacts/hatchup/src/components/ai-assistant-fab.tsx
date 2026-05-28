import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, ChevronRight, Sparkles, Send, RotateCcw, User, Dumbbell, Zap, UsersRound, Trophy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/playerContext";

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

interface DeepLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const ALL_DEEP_LINKS: (DeepLink & { keywords: string[] })[] = [
  { label: "Training Plan", href: "/training", icon: <Dumbbell className="w-3 h-3" />,
    keywords: ["workout plan", "training plan", "training tab", "generate a plan", "exercise plan"] },
  { label: "Log Activity", href: "/", icon: <Zap className="w-3 h-3" />,
    keywords: ["log your", "log a workout", "log activity", "track your steps", "log steps", "record your"] },
  { label: "Join a Group", href: "/groups", icon: <UsersRound className="w-3 h-3" />,
    keywords: ["workout group", "join a group", "group workout", "community"] },
  { label: "Leaderboard", href: "/social", icon: <Trophy className="w-3 h-3" />,
    keywords: ["leaderboard", "ranking", "top players", "compete"] },
  { label: "Nutrition", href: "/nutrition", icon: <Zap className="w-3 h-3" />,
    keywords: ["meal", "nutrition", "macros", "calories", "protein"] },
  { label: "Open Coach", href: "/coach", icon: <Bot className="w-3 h-3" />,
    keywords: ["coach"] },
];

function extractDeepLinks(text: string): DeepLink[] {
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const out: DeepLink[] = [];
  for (const dl of ALL_DEEP_LINKS) {
    if (seen.has(dl.href)) continue;
    if (dl.keywords.some((kw) => lower.includes(kw))) {
      seen.add(dl.href);
      out.push({ label: dl.label, href: dl.href, icon: dl.icon });
    }
  }
  return out;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  deepLinks?: DeepLink[];
}

let msgIdCounter = 1;
const nextId = () => msgIdCounter++;

function contextLabelFor(path: string): string {
  if (path === "/" || path === "") return "Home";
  if (path.startsWith("/hatchlings/")) return `Hatchling detail (id: ${path.split("/")[2] ?? "?"})`;
  if (path.startsWith("/hatchlings")) return "My Hatchlings";
  if (path.startsWith("/nutrition")) return "Nutrition";
  if (path.startsWith("/training")) return "Training";
  if (path.startsWith("/compete/battle")) return "Battle";
  if (path.startsWith("/compete/race")) return "Race";
  if (path.startsWith("/compete")) return "Compete";
  if (path.startsWith("/challenges")) return "Challenges";
  if (path.startsWith("/social")) return "Social / Leaderboard";
  if (path.startsWith("/groups")) return "Groups";
  if (path.startsWith("/hatch")) return "Hatch (egg opening)";
  if (path.startsWith("/coach")) return "Coach";
  if (path.startsWith("/settings")) return "Settings";
  return path;
}

function buildContextPrefix(path: string): string {
  const label = contextLabelFor(path);
  return `[User context — currently viewing: ${label} (${path})]\n\n`;
}

export function AIAssistantFab() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { playerId } = usePlayer();
  const items = useMemo(() => suggestionsFor(location), [location]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-ai-assistant", onOpen);
    return () => window.removeEventListener("open-ai-assistant", onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || !playerId) return;

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed };
    const assistantId = nextId();

    const priorHistory = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const contextPrefix = buildContextPrefix(location);
      const res = await fetch(`${basePath}/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${contextPrefix}${trimmed}`,
          history: priorHistory,
        }),
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let lineBuffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.content) {
              accumulated += event.content;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
              );
            }
            if (event.done) break outer;
            if (event.error) {
              accumulated = event.error;
              break outer;
            }
          } catch { /* ignore malformed */ }
        }
      }

      const deepLinks = extractDeepLinks(accumulated);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated || "Sorry, I couldn't respond. Try again.", streaming: false, deepLinks }
            : m
        )
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Coach is unavailable right now. Please try again.", streaming: false }
            : m
        )
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsStreaming(false);
    }
  }, [messages, isStreaming, playerId, location]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsStreaming(false);
  };

  const hasChat = messages.length > 0;

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
        <SheetContent
          side="bottom"
          className="bg-card/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl max-h-[85vh] flex flex-col p-0"
        >
          <SheetHeader className="text-left px-6 pt-6 pb-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2 text-xl font-black">
                <Sparkles className="w-5 h-5 text-primary" /> AI Assistant
              </SheetTitle>
              {hasChat && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetChat}
                  className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                  title="New chat"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> New
                </Button>
              )}
            </div>
            <SheetDescription>
              {hasChat
                ? `Chatting with context: ${contextLabelFor(location)}`
                : "Ask anything, or pick a suggestion based on where you are."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-3">
            {!hasChat && (
              <div className="space-y-2">
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
            )}

            {hasChat && (
              <div className="space-y-3 pt-1">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          msg.role === "assistant"
                            ? "bg-gradient-to-br from-primary to-purple-600"
                            : "bg-muted"
                        }`}
                      >
                        {msg.role === "assistant"
                          ? <Bot className="w-3.5 h-3.5 text-white" />
                          : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-primary text-white rounded-tr-sm"
                              : "bg-background/60 border border-white/10 rounded-tl-sm"
                          }`}
                        >
                          {msg.content ? (
                            <FormattedMessage content={msg.content} />
                          ) : msg.streaming ? (
                            <span className="inline-flex gap-1 items-center text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                            </span>
                          ) : null}
                        </div>
                        {msg.role === "assistant" && !msg.streaming && msg.deepLinks && msg.deepLinks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {msg.deepLinks.map((dl) => (
                              <Link key={dl.href} href={dl.href} onClick={() => setOpen(false)}>
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/30 rounded-full text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer whitespace-nowrap">
                                  {dl.icon}
                                  {dl.label}
                                  <ChevronRight className="w-3 h-3" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="px-6 pt-2 pb-5 border-t border-white/10 bg-background/40 shrink-0">
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={playerId ? "Ask the coach anything…" : "Sign in to chat with the coach"}
                rows={1}
                disabled={isStreaming || !playerId}
                className="resize-none min-h-[42px] max-h-[120px] text-sm py-2.5 bg-background/60"
              />
              <Button
                size="icon"
                className="h-[42px] w-[42px] shrink-0 bg-gradient-to-br from-primary to-accent text-primary-foreground"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming || !playerId}
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <Link href="/coach" onClick={() => setOpen(false)}>
                <span className="text-[11px] font-bold text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Open full Coach
                </span>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" /> Close
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function FormattedMessage({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
