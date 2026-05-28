import { useState, useRef, useEffect, useCallback } from "react";
import { usePlayer } from "@/lib/playerContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Send, RotateCcw, Bot, User,
  Dumbbell, Zap, UsersRound, Trophy, ChevronRight, AlertTriangle, Crown,
} from "lucide-react";

interface DeepLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
  deepLinks?: DeepLink[];
  capUpsell?: { cap: number };
}

const ALL_DEEP_LINKS: (DeepLink & { keywords: string[] })[] = [
  {
    label: "Training Plan",
    href: "/training",
    icon: <Dumbbell className="w-3.5 h-3.5" />,
    keywords: ["workout plan", "training plan", "training tab", "generate a plan", "workout plan", "exercise plan"],
  },
  {
    label: "Log Activity",
    href: "/",
    icon: <Zap className="w-3.5 h-3.5" />,
    keywords: ["log your", "log a workout", "log activity", "track your steps", "log steps", "record your"],
  },
  {
    label: "Join a Group",
    href: "/groups",
    icon: <UsersRound className="w-3.5 h-3.5" />,
    keywords: ["workout group", "join a group", "group workout", "social feature", "team", "community"],
  },
  {
    label: "Leaderboard",
    href: "/social",
    icon: <Trophy className="w-3.5 h-3.5" />,
    keywords: ["leaderboard", "ranking", "top players", "compete", "social"],
  },
];

function extractDeepLinks(text: string): DeepLink[] {
  const lower = text.toLowerCase();
  const found = ALL_DEEP_LINKS.filter((dl) =>
    dl.keywords.some((kw) => lower.includes(kw))
  );
  return found.map(({ label, href, icon }) => ({ label, href, icon }));
}

const QUICK_PROMPTS = [
  { label: "Today's workout?", prompt: "What workout should I do today based on my recent activity?" },
  { label: "Build my streak", prompt: "How can I build a longer activity streak? Give me practical daily tips." },
  { label: "Boost my Pals", prompt: "What's the fastest way to level up my Pals through fitness?" },
  { label: "Recovery tips", prompt: "I'm feeling sore from recent workouts. What recovery strategies do you recommend?" },
  { label: "Nutrition tips", prompt: "Give me quick nutrition tips that match my fitness goal." },
  { label: "Morning routine", prompt: "Design a quick 15-minute morning routine I can do every day." },
];

let msgIdCounter = 1;
function nextId() { return msgIdCounter++; }

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Coach() {
  const { playerId } = usePlayer();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "assistant",
      content: "Hey there! I'm **Hatch**, your AI Fitness Coach. I can see your stats, recent workouts, and Pal progress — so my advice is tailored just for you.\n\nWhat do you want to work on today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || !playerId) return;

    const now = new Date();
    const userMsg: Message = { id: nextId(), role: "user", content: trimmed, timestamp: now };
    const assistantId = nextId();
    const assistantTimestamp = new Date();

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", timestamp: assistantTimestamp, streaming: true },
    ]);
    setInput("");
    setIsStreaming(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${basePath}/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
        credentials: "include",
      });

      if (res.status === 402) {
        let cap = 5;
        try {
          const body = await res.json();
          if (typeof body?.cap === "number") cap = body.cap;
        } catch { /* keep default */ }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `You've used your ${cap} free AI coach messages for today. Upgrade to HatchUp Premium for unlimited coaching.`,
                  streaming: false,
                  capUpsell: { cap },
                }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

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
        // Keep the last (possibly incomplete) line in the buffer
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.content) {
              accumulated += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m
                )
              );
            }
            if (event.done) break outer;
            if (event.error) {
              accumulated = event.error;
              break outer;
            }
          } catch { /* skip malformed line */ }
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
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Coach is unavailable right now. Please try again.", streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, playerId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleReset = () => {
    setMessages([{
      id: nextId(),
      role: "assistant",
      content: "New session started! What do you want to work on today?",
      timestamp: new Date(),
    }]);
    setIsStreaming(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-background to-black pointer-events-none -z-10" />
      <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto w-full">

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/60 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-[0_0_12px_rgba(var(--primary),0.5)]">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-black text-sm leading-none">Hatch AI Coach</h1>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Personalized fitness guidance</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset} title="New chat">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </header>

        {/* Safety notice */}
        <div className="flex items-start gap-2 mx-4 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-yellow-600 dark:text-yellow-400 font-medium leading-snug">
            For general wellness only. Always consult a healthcare professional for medical concerns, pain, or injury.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "assistant"
                    ? "bg-gradient-to-br from-primary to-purple-600 shadow-[0_0_8px_rgba(var(--primary),0.4)]"
                    : "bg-muted"
                }`}>
                  {msg.role === "assistant"
                    ? <Bot className="w-4 h-4 text-white" />
                    : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-tr-sm"
                      : "bg-card border border-border/60 rounded-tl-sm"
                  }`}>
                    {msg.content
                      ? <FormattedMessage content={msg.content} />
                      : msg.streaming
                        ? <span className="inline-flex gap-1 items-center text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                          </span>
                        : null
                    }
                  </div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-muted-foreground px-1">
                    {formatTime(msg.timestamp)}
                  </span>

                  {/* Contextual deep-link actions (assistant only, after streaming) */}
                  {msg.role === "assistant" && !msg.streaming && msg.deepLinks && msg.deepLinks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
                      {msg.deepLinks.map((dl) => (
                        <Link key={dl.href} href={dl.href}>
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/30 rounded-full text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer whitespace-nowrap">
                            {dl.icon}
                            {dl.label}
                            <ChevronRight className="w-3 h-3" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Daily-cap upsell (assistant only) */}
                  {msg.role === "assistant" && msg.capUpsell && (
                    <div className="flex flex-wrap gap-1.5 px-1 pt-0.5" data-testid="coach-cap-upsell">
                      <Link href="/subscription?from=coach_cap">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-400/15 border border-amber-400/40 rounded-full text-[11px] font-bold text-amber-200 hover:bg-amber-400/25 transition-colors cursor-pointer whitespace-nowrap">
                          <Crown className="w-3 h-3" />
                          Upgrade for unlimited coaching
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Quick prompt chips — always visible above input */}
        <div className="px-4 pt-2 pb-1 shrink-0">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => sendMessage(qp.prompt)}
                disabled={isStreaming}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-card border border-border rounded-full hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border/50 bg-card/60 backdrop-blur">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your coach anything…"
              className="resize-none min-h-[44px] max-h-[120px] text-sm py-3"
              rows={1}
              disabled={isStreaming}
            />
            <Button
              size="icon"
              className="h-11 w-11 shrink-0 bg-gradient-to-br from-primary to-purple-600 shadow-[0_0_12px_rgba(var(--primary),0.4)] active-elevate"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2 font-medium">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
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
