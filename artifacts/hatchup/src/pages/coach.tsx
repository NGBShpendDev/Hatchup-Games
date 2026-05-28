import { useState, useRef, useEffect, useCallback } from "react";
import { usePlayer } from "@/lib/playerContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Send, RotateCcw, Bot, User, Dumbbell, Zap, UsersRound, Trophy, ChevronRight, AlertTriangle } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const QUICK_PROMPTS = [
  { label: "Today's workout?", prompt: "What workout should I do today based on my recent activity?" },
  { label: "Build my streak", prompt: "How can I build a longer activity streak? Give me practical daily tips." },
  { label: "Boost my Pals", prompt: "What's the fastest way to level up my Pals through fitness?" },
  { label: "Recovery tips", prompt: "I'm feeling sore from recent workouts. What recovery strategies do you recommend?" },
  { label: "Nutrition advice", prompt: "Give me quick nutrition tips that match my fitness goal." },
  { label: "Morning routine", prompt: "Design a quick 15-minute morning routine I can do every day." },
];

const ACTION_LINKS = [
  { label: "Training Plan", href: "/training", icon: <Dumbbell className="w-3.5 h-3.5" /> },
  { label: "Log Activity", href: "/", icon: <Zap className="w-3.5 h-3.5" /> },
  { label: "Groups", href: "/groups", icon: <UsersRound className="w-3.5 h-3.5" /> },
  { label: "Leaderboard", href: "/social", icon: <Trophy className="w-3.5 h-3.5" /> },
];

let msgIdCounter = 1;
function nextId() { return msgIdCounter++; }

export default function Coach() {
  const { playerId } = usePlayer();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "assistant",
      content: "Hey there! I'm **Hatch**, your AI Fitness Coach. I can see your stats, recent workouts, and Pal progress — so my advice is tailored just for you.\n\nWhat do you want to work on today?",
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

    const userMsg: Message = { id: nextId(), role: "user", content: trimmed };
    const assistantId = nextId();

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", streaming: true }]);
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

      if (!res.ok || !res.body) {
        throw new Error("Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

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
            if (event.done || event.error) {
              if (event.error) accumulated = event.error;
              break;
            }
          } catch { /* skip malformed event */ }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: accumulated || "Sorry, I couldn't respond. Try again.", streaming: false } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Coach is unavailable right now. Please try again.", streaming: false } : m
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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset} title="New chat">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Safety notice */}
        <div className="flex items-start gap-2 mx-4 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-yellow-600 dark:text-yellow-400 font-medium leading-snug">
            For general wellness only. Always consult a healthcare professional for medical concerns, pain, or injury.
          </p>
        </div>

        {/* Quick action links */}
        <div className="flex gap-2 px-4 mt-3 overflow-x-auto no-scrollbar shrink-0">
          {ACTION_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-full text-[11px] font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors whitespace-nowrap cursor-pointer">
                {link.icon}
                {link.label}
                <ChevronRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
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
                    : <User className="w-3.5 h-3.5 text-muted-foreground" />
                  }
                </div>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
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
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts (shown when only the welcome message exists) */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 grid grid-cols-2 gap-2 shrink-0">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => sendMessage(qp.prompt)}
                disabled={isStreaming}
                className="text-left text-xs font-semibold px-3 py-2.5 bg-card border border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50 leading-snug"
              >
                {qp.label}
              </button>
            ))}
          </div>
        )}

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
            Press Enter to send · Shift+Enter for new line
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
