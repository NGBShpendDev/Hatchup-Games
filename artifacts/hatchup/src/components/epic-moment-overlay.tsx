import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

// ── Epic moment event types ───────────────────────────────────────────────────
// A single discriminated union describes every "epic moment" the app can fire.
// The overlay derives all colors, copy, icon, and glow from the variant.
export type EpicMomentEvent =
  | {
      id?: string;
      kind: "artifact";
      rarity: "Legendary" | "Mythic" | "Ancient" | "Celestial";
      name: string;
      lore?: string;
    }
  | {
      id?: string;
      kind: "evolution";
      hatchlingName: string;
      stage: number;
      stageName?: string;
      realmColor?: string;
      realmEmoji?: string;
    }
  | {
      id?: string;
      kind: "prestige";
      prestige: number;
      title?: string;
    }
  | {
      id?: string;
      kind: "fitnessBar";
      barType: string;
      level: 10 | 25 | 50 | (number & {});
      emoji?: string;
    }
  | {
      id?: string;
      kind: "hatch";
      species: string;
      rarity: "Mythic" | "Legendary";
      realmColor?: string;
      realmEmoji?: string;
    };

// ── Variant themes ────────────────────────────────────────────────────────────
type Theme = {
  glowClass: string;
  textColor: string;
  borderColor: string;
  particleColor: string;
  radialColor: string;
  label: string;
  headline: string;
  subheadline?: string;
  emoji: string;
  bigEmoji: string;
};

function themeFor(event: EpicMomentEvent): Theme {
  switch (event.kind) {
    case "artifact": {
      const map: Record<string, Theme> = {
        Legendary: {
          glowClass: "artifact-glow-legendary",
          textColor: "text-yellow-300",
          borderColor: "border-yellow-400/70",
          particleColor: "bg-yellow-400",
          radialColor: "rgba(234,179,8,0.45)",
          label: "🟡 Legendary Artifact Unlocked",
          headline: event.name,
          subheadline: event.lore ? `"${event.lore}"` : undefined,
          emoji: "🟡",
          bigEmoji: "🏺",
        },
        Mythic: {
          glowClass: "artifact-glow-mythic",
          textColor: "text-pink-300",
          borderColor: "border-pink-400/70",
          particleColor: "bg-pink-400",
          radialColor: "rgba(236,72,153,0.45)",
          label: "🔴 Mythic Artifact Unlocked",
          headline: event.name,
          subheadline: event.lore ? `"${event.lore}"` : undefined,
          emoji: "🔴",
          bigEmoji: "🏺",
        },
        Ancient: {
          glowClass: "artifact-glow-ancient",
          textColor: "text-orange-300",
          borderColor: "border-orange-400/70",
          particleColor: "bg-orange-400",
          radialColor: "rgba(249,115,22,0.45)",
          label: "🟠 Ancient Artifact Unlocked",
          headline: event.name,
          subheadline: event.lore ? `"${event.lore}"` : undefined,
          emoji: "🟠",
          bigEmoji: "🏺",
        },
        Celestial: {
          glowClass: "artifact-glow-celestial",
          textColor: "text-cyan-200",
          borderColor: "border-cyan-300/70",
          particleColor: "bg-cyan-300",
          radialColor: "rgba(34,211,238,0.45)",
          label: "🌟 Celestial Artifact Unlocked",
          headline: event.name,
          subheadline: event.lore ? `"${event.lore}"` : undefined,
          emoji: "🌟",
          bigEmoji: "✨",
        },
      };
      return map[event.rarity];
    }
    case "evolution": {
      const stageLabel = event.stageName ?? (event.stage >= 3 ? "Legendary Form" : event.stage === 2 ? "Athletic Form" : "Cute Form");
      const glow = event.stage >= 3 ? "artifact-glow-mythic" : "artifact-glow-legendary";
      const baseColor = event.realmColor ?? "#ec4899";
      return {
        glowClass: glow,
        textColor: "text-fuchsia-200",
        borderColor: "border-fuchsia-300/70",
        particleColor: "bg-fuchsia-400",
        radialColor: `${baseColor}80`,
        label: `✨ Evolution — Stage ${event.stage}`,
        headline: event.hatchlingName,
        subheadline: `Evolved into ${stageLabel}!`,
        emoji: event.realmEmoji ?? "✨",
        bigEmoji: event.realmEmoji ?? "🦋",
      };
    }
    case "prestige": {
      return {
        glowClass: "artifact-glow-celestial",
        textColor: "text-yellow-300",
        borderColor: "border-yellow-400/80",
        particleColor: "bg-yellow-400",
        radialColor: "rgba(234,179,8,0.55)",
        label: `✦ Prestige ${event.prestige} Unlocked`,
        headline: event.title ?? `Prestige ${event.prestige}`,
        subheadline: "You ascended. Your legend grows.",
        emoji: "✦",
        bigEmoji: "👑",
      };
    }
    case "fitnessBar": {
      const tier = event.level >= 50 ? "Mythic" : event.level >= 25 ? "Legendary" : "Epic";
      const glow = event.level >= 50 ? "artifact-glow-mythic" : event.level >= 25 ? "artifact-glow-legendary" : "artifact-glow-epic";
      const color = event.level >= 50 ? "rgba(236,72,153,0.5)" : event.level >= 25 ? "rgba(234,179,8,0.5)" : "rgba(147,51,234,0.5)";
      const textColor = event.level >= 50 ? "text-pink-300" : event.level >= 25 ? "text-yellow-300" : "text-purple-300";
      const particleColor = event.level >= 50 ? "bg-pink-400" : event.level >= 25 ? "bg-yellow-400" : "bg-purple-400";
      const borderColor = event.level >= 50 ? "border-pink-400/70" : event.level >= 25 ? "border-yellow-400/70" : "border-purple-400/70";
      const niceBarName = event.barType.charAt(0).toUpperCase() + event.barType.slice(1);
      return {
        glowClass: glow,
        textColor,
        borderColor,
        particleColor,
        radialColor: color,
        label: `${tier} Fitness Milestone`,
        headline: `${niceBarName} Lv ${event.level}`,
        subheadline: `Your ${niceBarName.toLowerCase()} bar reached an elite tier.`,
        emoji: event.emoji ?? "💪",
        bigEmoji: event.emoji ?? "💪",
      };
    }
    case "hatch": {
      const isMythic = event.rarity === "Mythic";
      const glow = isMythic ? "artifact-glow-mythic" : "artifact-glow-legendary";
      const baseColor = event.realmColor ?? (isMythic ? "#ec4899" : "#eab308");
      return {
        glowClass: glow,
        textColor: isMythic ? "text-pink-300" : "text-yellow-300",
        borderColor: isMythic ? "border-pink-400/70" : "border-yellow-400/70",
        particleColor: isMythic ? "bg-pink-400" : "bg-yellow-400",
        radialColor: `${baseColor}80`,
        label: isMythic ? "🌌 Mythic Hatch" : "🟡 Legendary Hatch",
        headline: event.species,
        subheadline: isMythic
          ? "An impossibly rare spirit just joined your team."
          : "A legendary creature joined your team.",
        emoji: event.realmEmoji ?? (isMythic ? "🌌" : "🟡"),
        bigEmoji: event.realmEmoji ?? "🥚",
      };
    }
  }
}

// ── Queue context ────────────────────────────────────────────────────────────
type QueuedEvent = EpicMomentEvent & { id: string };

type EpicMomentQueueValue = {
  enqueue: (event: EpicMomentEvent | EpicMomentEvent[]) => void;
};

const EpicMomentQueueContext = createContext<EpicMomentQueueValue | null>(null);

export function useEpicMomentQueue(): EpicMomentQueueValue {
  const ctx = useContext(EpicMomentQueueContext);
  // Provide a no-op fallback so components don't crash if rendered outside the
  // provider (e.g. during isolated unit/mockup rendering).
  return ctx ?? { enqueue: () => {} };
}

export function EpicMomentProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedEvent[]>([]);
  const counterRef = useRef(0);

  const enqueue = useCallback((event: EpicMomentEvent | EpicMomentEvent[]) => {
    const events = Array.isArray(event) ? event : [event];
    if (events.length === 0) return;
    setQueue(prev => [
      ...prev,
      ...events.map(e => ({
        ...e,
        id: e.id ?? `epic-${Date.now()}-${counterRef.current++}`,
      })),
    ]);
  }, []);

  const dismissCurrent = useCallback(() => {
    setQueue(prev => prev.slice(1));
  }, []);

  const value = useMemo(() => ({ enqueue }), [enqueue]);

  return (
    <EpicMomentQueueContext.Provider value={value}>
      {children}
      <EpicMomentOverlayHost queue={queue} onDismiss={dismissCurrent} />
    </EpicMomentQueueContext.Provider>
  );
}

// ── Overlay host ──────────────────────────────────────────────────────────────
function EpicMomentOverlayHost({
  queue,
  onDismiss,
}: {
  queue: QueuedEvent[];
  onDismiss: () => void;
}) {
  const current = queue[0];
  const remaining = queue.length;
  const theme = current ? themeFor(current) : undefined;

  return (
    <AnimatePresence mode="wait">
      {current && theme && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer p-6"
          data-testid="epic-moment-overlay"
          data-epic-kind={current.kind}
        >
          {/* Background radial glow */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.4, opacity: 0.55 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute inset-0 m-auto w-[80vmin] h-[80vmin] rounded-full blur-3xl pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${theme.radialColor} 0%, transparent 70%)`,
            }}
          />

          {/* Particle burst */}
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              className={`absolute w-2 h-2 rounded-full ${theme.particleColor} pointer-events-none`}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1.2, 0],
                x: Math.cos((i / 24) * Math.PI * 2) * (180 + Math.random() * 80),
                y: Math.sin((i / 24) * Math.PI * 2) * (180 + Math.random() * 80),
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.4, delay: 0.2 + (i % 6) * 0.05, ease: "easeOut" }}
              style={{ left: "50%", top: "50%" }}
            />
          ))}

          {/* Sparkle floats */}
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={`spark-${i}`}
              className={`absolute pointer-events-none ${theme.textColor}`}
              initial={{
                opacity: 0,
                x: (Math.random() - 0.5) * 400,
                y: 200 + Math.random() * 100,
                scale: 0.4 + Math.random() * 0.6,
              }}
              animate={{
                opacity: [0, 1, 0],
                y: -300 - Math.random() * 100,
                rotate: 360,
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                delay: Math.random() * 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
              style={{ left: "50%", top: "50%" }}
            >
              <Sparkles className="w-4 h-4" />
            </motion.div>
          ))}

          <motion.div
            initial={{ scale: 0.4, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 180, damping: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 text-center max-w-md w-full"
          >
            {/* Label */}
            <motion.p
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`font-black text-xs uppercase tracking-[0.3em] mb-3 ${theme.textColor}`}
              data-testid="epic-moment-label"
            >
              {theme.label}
            </motion.p>

            {/* Medallion */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 150, damping: 12 }}
              className={`relative mx-auto w-40 h-40 rounded-full border-4 ${theme.borderColor} ${theme.glowClass} flex items-center justify-center mb-6`}
              style={{
                background: `radial-gradient(circle, ${theme.radialColor} 0%, rgba(0,0,0,0.4) 70%)`,
              }}
            >
              <motion.div
                animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="text-7xl select-none drop-shadow-[0_0_18px_rgba(255,255,255,0.5)]"
              >
                {theme.bigEmoji}
              </motion.div>
            </motion.div>

            {/* Headline */}
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="font-black text-3xl text-white mb-3 drop-shadow-[0_0_18px_rgba(255,255,255,0.4)]"
              data-testid="epic-moment-headline"
            >
              {theme.headline}
            </motion.h2>

            {/* Sub */}
            {theme.subheadline && (
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.75 }}
                className="text-sm text-white/80 italic leading-relaxed px-2 mb-6"
                data-testid="epic-moment-sub"
              >
                {theme.subheadline}
              </motion.p>
            )}

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="space-y-1"
            >
              {remaining > 1 && (
                <p className={`text-xs font-black uppercase tracking-widest ${theme.textColor}`}>
                  {remaining} celebration{remaining === 1 ? "" : "s"} queued
                </p>
              )}
              <p className="text-[11px] text-white/60 uppercase tracking-wider">
                Tap anywhere to {remaining > 1 ? "see next" : "continue"}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
