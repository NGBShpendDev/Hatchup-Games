import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Check, Eye, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RarityBadge } from "@/components/rarity-badge";
import { useToast } from "@/hooks/use-toast";
import { generateHatchShareImage } from "@/lib/hatchShareImage";

export type LegendaryRarity = "Legendary" | "Mythic" | "Ancient" | "Celestial";

export interface LegendaryCinematicProps {
  species: string;
  name: string;
  rarity: LegendaryRarity;
  realmColor: string;
  realmEmoji: string;
  steps: number;
  onClose: () => void;
  onViewPal: () => void;
}

type CinPhase = "shaking" | "particles" | "rarity-reveal" | "creature-reveal" | "share";

// ── Rarity config ─────────────────────────────────────────────────────────────
const RARITY_CONFIG: Record<LegendaryRarity, {
  glow: string;
  particleColors: string[];
  bgFrom: string;
  bgTo: string;
  textColor: string;
  labelText: string;
  subText: string;
  bigEmoji: string;
  radialColor: string;
}> = {
  Legendary: {
    glow: "artifact-glow-legendary",
    particleColors: ["bg-yellow-400", "bg-amber-300", "bg-yellow-200", "bg-orange-300"],
    bgFrom: "from-yellow-950/95",
    bgTo: "to-amber-950/95",
    textColor: "text-yellow-300",
    labelText: "🟡 LEGENDARY HATCH",
    subText: "A legendary creature has chosen you.",
    bigEmoji: "👑",
    radialColor: "rgba(234,179,8,0.55)",
  },
  Mythic: {
    glow: "artifact-glow-mythic",
    particleColors: ["bg-red-500", "bg-pink-400", "bg-red-300", "bg-rose-400"],
    bgFrom: "from-red-950/95",
    bgTo: "to-pink-950/95",
    textColor: "text-red-300",
    labelText: "🔴 MYTHIC HATCH",
    subText: "An impossibly rare spirit awakens. Crimson fire surrounds you.",
    bigEmoji: "⚡",
    radialColor: "rgba(239,68,68,0.55)",
  },
  Ancient: {
    glow: "artifact-glow-ancient",
    particleColors: ["bg-teal-400", "bg-emerald-300", "bg-jade-400", "bg-green-300"],
    bgFrom: "from-teal-950/95",
    bgTo: "to-emerald-950/95",
    textColor: "text-teal-300",
    labelText: "🏺 ANCIENT HATCH",
    subText: "A spirit from the depths of time stirs. Ancient runes align.",
    bigEmoji: "🏺",
    radialColor: "rgba(20,184,166,0.55)",
  },
  Celestial: {
    glow: "artifact-glow-celestial",
    particleColors: ["bg-cyan-300", "bg-violet-400", "bg-pink-300", "bg-emerald-300"],
    bgFrom: "from-indigo-950/95",
    bgTo: "to-violet-950/95",
    textColor: "text-white",
    labelText: "🌌 CELESTIAL HATCH",
    subText: "A once-in-a-universe spirit has found its way to you.",
    bigEmoji: "✨",
    radialColor: "rgba(147,51,234,0.55)",
  },
};

// ── Mythic lightning bolts ─────────────────────────────────────────────────────
function MythicLightning() {
  const bolts = [
    { x1: "10%", y1: "0%", x2: "30%", y2: "60%", x3: "20%", y3: "100%", delay: 0 },
    { x1: "70%", y1: "0%", x2: "55%", y2: "50%", x3: "65%", y3: "100%", delay: 0.3 },
    { x1: "45%", y1: "0%", x2: "60%", y2: "40%", x3: "50%", y3: "100%", delay: 0.6 },
    { x1: "85%", y1: "20%", x2: "70%", y2: "65%", x3: "80%", y3: "100%", delay: 0.9 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {bolts.map((b, i) => (
        <motion.svg
          key={i}
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.2, 0.85, 0, 0.7, 0] }}
          transition={{ duration: 2, delay: b.delay, repeat: Infinity, repeatDelay: 1.5 }}
        >
          <polyline
            points={`${b.x1},${b.y1} ${b.x2},${b.y2} ${b.x3},${b.y3}`}
            stroke="#ef4444"
            strokeWidth="0.6"
            fill="none"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 4px #ef4444) drop-shadow(0 0 8px #dc2626)" }}
          />
        </motion.svg>
      ))}
    </div>
  );
}

// ── Ancient runes ──────────────────────────────────────────────────────────────
const RUNE_CHARS = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛁ", "ᛃ", "ᛇ", "ᛈ", "ᛉ", "ᛊ"];

function AncientRunes() {
  const runes = Array.from({ length: 12 }, (_, i) => ({
    char: RUNE_CHARS[i % RUNE_CHARS.length],
    left: `${8 + (i * 7.5) % 84}%`,
    size: 0.8 + (i % 3) * 0.4,
    delay: (i * 0.4) % 3,
    duration: 4 + (i % 4),
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {runes.map((r, i) => (
        <motion.span
          key={i}
          className="absolute font-mono select-none"
          style={{
            left: r.left,
            bottom: "-10%",
            fontSize: `${r.size}rem`,
            color: "rgba(20,184,166,0.7)",
            textShadow: "0 0 12px rgba(20,184,166,0.9), 0 0 24px rgba(20,184,166,0.5)",
          }}
          initial={{ y: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: [0, -window.innerHeight * 1.2],
            opacity: [0, 0.8, 0.8, 0],
            rotate: [0, 180 + i * 30, 360 + i * 60],
          }}
          transition={{
            duration: r.duration,
            delay: r.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        >
          {r.char}
        </motion.span>
      ))}
    </div>
  );
}

// ── Ancient jade/teal burst ────────────────────────────────────────────────────
function AncientJadeBurst() {
  const JADE = ["#14b8a6", "#0d9488", "#10b981", "#34d399", "#06b6d4"];

  const shards = Array.from({ length: 28 }, (_, i) => ({
    angle: (i / 28) * 360,
    length: 70 + (i % 5) * 45,
    width: 1.5 + (i % 3) * 0.8,
    color: JADE[i % JADE.length],
    delay: (i % 7) * 0.03,
    duration: 0.65 + (i % 3) * 0.12,
  }));

  const dots = Array.from({ length: 36 }, (_, i) => ({
    angle: (i / 36) * Math.PI * 2,
    dist: 90 + (i % 4) * 55,
    size: 5 + (i % 4) * 3,
    color: JADE[i % JADE.length],
    delay: (i % 6) * 0.035,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {/* Central jade flash */}
      <motion.div
        className="absolute rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(20,184,166,0.95) 0%, rgba(16,185,129,0.5) 40%, transparent 70%)",
        }}
        initial={{ width: 0, height: 0, opacity: 1 }}
        animate={{ width: "85vmin", height: "85vmin", opacity: [1, 0.7, 0] }}
        transition={{ duration: 0.85, ease: "easeOut" }}
      />

      {/* Three concentric jade rings that expand outward */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`jade-ring-${i}`}
          className="absolute rounded-full"
          style={{
            border: `${2.5 - i * 0.5}px solid ${JADE[i]}`,
            width: "55vmin",
            height: "55vmin",
            boxShadow: `0 0 14px ${JADE[i]}80`,
          }}
          initial={{ scale: 0, opacity: 0.95 }}
          animate={{ scale: 2.8 + i * 0.4, opacity: 0 }}
          transition={{ duration: 0.9, delay: i * 0.14, ease: "easeOut" }}
        />
      ))}

      {/* Crystal shard rays */}
      {shards.map((s, i) => (
        <motion.div
          key={`shard-${i}`}
          className="absolute"
          style={{
            width: s.length,
            height: s.width,
            background: `linear-gradient(to right, ${s.color}ff, ${s.color}20, transparent)`,
            rotate: `${s.angle}deg`,
            left: "50%",
            top: "50%",
            transformOrigin: "left center",
            boxShadow: `0 0 6px ${s.color}90`,
          }}
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: [0, 1, 0.5], opacity: [0, 1, 0] }}
          transition={{ duration: s.duration, delay: s.delay, ease: "easeOut" }}
        />
      ))}

      {/* Jade particle dots */}
      {dots.map((p, i) => (
        <motion.div
          key={`jadedot-${i}`}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 8px ${p.color}`,
          }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
          animate={{
            scale: [0, 1.6, 0.8],
            x: Math.cos(p.angle) * p.dist,
            y: Math.sin(p.angle) * p.dist,
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 1.05, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ── Celestial slow prismatic rainbow explosion ──────────────────────────────
function CelestialRainbowExplosion() {
  const PRISM = ["#22d3ee", "#818cf8", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#c084fc", "#f9a8d4"];

  const rings = Array.from({ length: 7 }, (_, i) => ({
    color: PRISM[i % PRISM.length],
    delay: i * 0.28,
    thickness: Math.max(1, 3.5 - i * 0.4),
  }));

  const particles = Array.from({ length: 52 }, (_, i) => ({
    angle: (i / 52) * Math.PI * 2,
    dist: 130 + (i % 6) * 55,
    size: 5 + (i % 3) * 4,
    color: PRISM[i % PRISM.length],
    delay: (i % 8) * 0.18,
    duration: 2.8 + (i % 4) * 0.4,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {/* Slow-rotating conic gradient bloom */}
      <motion.div
        className="absolute rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, #22d3ee70, #818cf870, #f472b670, #34d39970, #fbbf2470, #60a5fa70, #c084fc70, #22d3ee70)",
          width: "75vmin",
          height: "75vmin",
        }}
        initial={{ scale: 0, opacity: 0, rotate: 0 }}
        animate={{ scale: [0, 2.2], opacity: [0, 0.85, 0.3, 0], rotate: 240 }}
        transition={{ duration: 3.2, ease: "easeOut" }}
      />

      {/* Slow expanding prismatic rings */}
      {rings.map((ring, i) => (
        <motion.div
          key={`prism-ring-${i}`}
          className="absolute rounded-full"
          style={{
            border: `${ring.thickness}px solid ${ring.color}`,
            width: "55vmin",
            height: "55vmin",
            boxShadow: `0 0 22px ${ring.color}60, inset 0 0 10px ${ring.color}20`,
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 4.5 + i * 0.3, opacity: 0 }}
          transition={{ duration: 3.0, delay: ring.delay, ease: "easeOut" }}
        />
      ))}

      {/* Languid prismatic particles */}
      {particles.map((p, i) => (
        <motion.div
          key={`prism-dot-${i}`}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 12px ${p.color}, 0 0 24px ${p.color}80`,
          }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.3, 1.0, 0],
            x: Math.cos(p.angle) * p.dist,
            y: Math.sin(p.angle) * p.dist,
            opacity: [0, 1, 0.9, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ── Celestial prismatic burst ──────────────────────────────────────────────────
function CelestialPrismatic() {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360;
    const colors = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa"];
    return { angle, color: colors[i % colors.length] };
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
      {/* Rotating rainbow ring */}
      <motion.div
        className="absolute w-[120vmin] h-[120vmin] rounded-full"
        style={{
          background: "conic-gradient(from 0deg, #22d3ee, #a78bfa, #f472b6, #34d399, #fbbf24, #60a5fa, #22d3ee)",
          opacity: 0.15,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      {/* Rays */}
      {rays.map((ray, i) => (
        <motion.div
          key={i}
          className="absolute origin-center"
          style={{
            width: "60vmax",
            height: "2px",
            background: `linear-gradient(to right, transparent, ${ray.color}60, transparent)`,
            rotate: `${ray.angle}deg`,
            transformOrigin: "left center",
            left: "50%",
            top: "50%",
          }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, delay: i * 0.25, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Particle burst ─────────────────────────────────────────────────────────────
function ParticleBurst({ colors }: { colors: string[] }) {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    colorCls: colors[i % colors.length],
    angle: (i / 40) * Math.PI * 2,
    distance: 120 + Math.random() * 180,
    size: 4 + Math.random() * 6,
    delay: Math.random() * 0.3,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full ${p.colorCls}`}
          style={{ width: p.size, height: p.size }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
          animate={{
            scale: [0, 1.5, 0],
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance,
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 1.2, delay: p.delay, ease: "easeOut" }}
        />
      ))}
      {/* Secondary sparkle ring */}
      {Array.from({ length: 16 }, (_, i) => (
        <motion.div
          key={`ring-${i}`}
          className={`absolute rounded-full ${colors[i % colors.length]}`}
          style={{ width: 3, height: 3 }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos((i / 16) * Math.PI * 2) * (60 + Math.random() * 40),
            y: Math.sin((i / 16) * Math.PI * 2) * (60 + Math.random() * 40),
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 0.8, delay: 0.4 + Math.random() * 0.2, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ── Main cinematic component ───────────────────────────────────────────────────
export function LegendaryCinematic({
  species,
  name,
  rarity,
  realmColor,
  realmEmoji,
  steps,
  onClose,
  onViewPal,
}: LegendaryCinematicProps) {
  const { toast } = useToast();
  const cfg = RARITY_CONFIG[rarity];
  const [phase, setPhase] = useState<CinPhase>("shaking");
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback((to: CinPhase, delay: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => setPhase(to), delay);
  }, []);

  const isLegendary = rarity === "Legendary";
  const isMythic = rarity === "Mythic";
  const isAncient = rarity === "Ancient";
  const isCelestial = rarity === "Celestial";

  useEffect(() => {
    if (phase === "shaking") advance("particles", 500);
    if (phase === "particles") advance("rarity-reveal", isCelestial ? 2400 : 1200);
    if (phase === "rarity-reveal") advance("creature-reveal", 3500);
    return () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); };
  }, [phase, advance, isCelestial]);

  const handleShare = async () => {
    const shareText = `I just hatched a ${rarity} ${species} after ${steps.toLocaleString()} steps in HatchUp! 🥚✨`;
    const shareTitle = "HatchUp — Legendary Hatch!";
    setSharing(true);

    // ── Step 1: generate the share card image ──────────────────────────────────
    let imageFile: File | undefined;
    try {
      const blob = await generateHatchShareImage({ name, species, rarity, realmEmoji, realmColor, steps });
      imageFile = new File([blob], `hatch-${rarity.toLowerCase()}-${name}.png`, { type: "image/png" });
    } catch {
      // Image generation is best-effort; fall through to text-only share
    }

    // ── Step 2: attempt Web Share API (with image if supported) ───────────────
    if (typeof navigator !== "undefined" && navigator.share) {
      const canShareFiles = imageFile &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [imageFile] });

      try {
        if (canShareFiles && imageFile) {
          await navigator.share({ title: shareTitle, text: shareText, files: [imageFile] });
        } else {
          await navigator.share({ title: shareTitle, text: shareText });
        }
        setShared(true);
        setSharing(false);
        return;
      } catch (err) {
        // DOMException name "AbortError" means user cancelled — treat as silent.
        // Any other error falls through to clipboard fallback below.
        const isCancel = err instanceof DOMException && err.name === "AbortError";
        if (isCancel) {
          setSharing(false);
          return;
        }
        // Fall through to clipboard copy
      }
    }

    // ── Step 3: clipboard fallback ─────────────────────────────────────────────
    try {
      await navigator.clipboard.writeText(shareText);
      toast({ title: "Copied to clipboard!", description: "Paste it anywhere to share your hatch." });
      setShared(true);
    } catch {
      toast({ title: "Couldn't copy text", variant: "destructive" });
    }
    setSharing(false);
  };

  return (
    <motion.div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-b ${cfg.bgFrom} ${cfg.bgTo} backdrop-blur-md overflow-hidden`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="legendary-hatch-cinematic"
      data-rarity={rarity}
    >
      {/* Rarity-specific background effects */}
      {isMythic && <MythicLightning />}
      {isAncient && <AncientRunes />}
      {isCelestial && <CelestialPrismatic />}

      {/* Ambient radial glow */}
      <motion.div
        className="absolute inset-0 m-auto w-[90vmin] h-[90vmin] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${cfg.radialColor} 0%, transparent 65%)` }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating sparkles */}
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={`sp-${i}`}
          className={`absolute pointer-events-none ${cfg.textColor}`}
          initial={{ opacity: 0, x: (Math.random() - 0.5) * 300, y: 250 + Math.random() * 100, scale: 0.3 + Math.random() * 0.5 }}
          animate={{ opacity: [0, 0.9, 0], y: -350, rotate: 360 }}
          transition={{ duration: 4 + Math.random() * 3, delay: Math.random() * 3, repeat: Infinity, ease: "easeOut" }}
          style={{ left: "50%", top: "50%" }}
        >
          <Sparkles className="w-5 h-5" />
        </motion.div>
      ))}

      {/* ── PHASE: shaking ── */}
      <AnimatePresence mode="wait">
        {phase === "shaking" && (
          <motion.div
            key="shaking"
            className="hatch-screen-shake absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              animate={{ scale: [1, 1.3, 0.9, 1.2, 1], rotate: [-3, 3, -3, 3, 0] }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-[8rem] select-none filter"
                style={{ filter: `drop-shadow(0 0 30px ${realmColor})` }}>
                {realmEmoji}
              </div>
              <motion.p
                className={`font-black text-xl uppercase tracking-[0.3em] ${cfg.textColor}`}
                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 0.5, repeat: 1 }}
              >
                Something stirs…
              </motion.p>
            </motion.div>
          </motion.div>
        )}

        {/* ── PHASE: particles ── */}
        {phase === "particles" && (
          <motion.div
            key="particles"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {isAncient ? (
              <AncientJadeBurst />
            ) : isCelestial ? (
              <CelestialRainbowExplosion />
            ) : (
              <ParticleBurst colors={cfg.particleColors} />
            )}
            <motion.div
              className="text-[7rem] select-none relative z-10"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.6, 1.2], opacity: [0, 1, 1], rotate: [0, 20, -10, 0] }}
              transition={{ duration: isAncient ? 0.75 : isCelestial ? 1.8 : 0.9 }}
              style={{ filter: `drop-shadow(0 0 40px ${realmColor})` }}
            >
              {isAncient ? "🏺" : isCelestial ? "🌌" : "💥"}
            </motion.div>
          </motion.div>
        )}

        {/* ── PHASE: rarity-reveal ── */}
        {phase === "rarity-reveal" && (
          <motion.div
            key="rarity-reveal"
            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer z-10 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPhase("creature-reveal")}
          >
            {/* Rarity label */}
            <motion.p
              className={`font-black text-xs uppercase tracking-[0.35em] mb-6 ${cfg.textColor}`}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {cfg.labelText}
            </motion.p>

            {/* Rarity badge medallion */}
            <motion.div
              className={`relative w-52 h-52 rounded-full border-4 flex items-center justify-center mb-6 ${cfg.glow}`}
              style={{
                borderColor: realmColor,
                background: `radial-gradient(circle, ${cfg.radialColor} 0%, rgba(0,0,0,0.6) 70%)`,
              }}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 130, damping: 12 }}
            >
              {/* Rarity-specific inner effect */}
              {isCelestial && (
                <motion.div
                  className="absolute inset-2 rounded-full"
                  style={{ background: "conic-gradient(from 0deg, #22d3ee40, #a78bfa40, #f472b640, #34d39940, #22d3ee40)" }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
              )}
              {isLegendary && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(234,179,8,0.3), transparent)" }}
                  animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}

              <motion.span
                className="text-7xl select-none relative z-10"
                animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: `drop-shadow(0 0 20px ${realmColor})` }}
              >
                {cfg.bigEmoji}
              </motion.span>
            </motion.div>

            {/* Rarity text */}
            <motion.h2
              className={`font-black text-5xl mb-3 ${cfg.textColor}`}
              style={{ textShadow: `0 0 30px ${realmColor}, 0 0 60px ${realmColor}80` }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 180, damping: 14 }}
            >
              {rarity}
            </motion.h2>

            <motion.p
              className="text-white/70 text-sm text-center max-w-xs italic"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              {cfg.subText}
            </motion.p>

            <motion.p
              className={`mt-8 text-xs uppercase tracking-widest ${cfg.textColor} opacity-60`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0] }}
              transition={{ delay: 1.5, duration: 1.5, repeat: Infinity }}
            >
              Tap to reveal
            </motion.p>
          </motion.div>
        )}

        {/* ── PHASE: creature-reveal ── */}
        {phase === "creature-reveal" && (
          <motion.div
            key="creature-reveal"
            className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Spotlight */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse 40% 60% at 50% 40%, ${cfg.radialColor} 0%, transparent 70%)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            />

            {/* Creature visual */}
            <motion.div
              className="relative w-40 h-40 rounded-full flex items-center justify-center mb-4 border-4"
              style={{
                borderColor: realmColor,
                boxShadow: `0 0 40px ${realmColor}80, 0 0 80px ${realmColor}40`,
                background: `radial-gradient(circle, ${realmColor}30, transparent)`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 150, damping: 12 }}
            >
              <motion.span
                className="text-6xl select-none"
                animate={{ rotate: [0, 8, -5, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: `drop-shadow(0 0 16px ${realmColor})` }}
              >
                {realmEmoji}
              </motion.span>
            </motion.div>

            {/* Species */}
            <motion.p
              className={`font-black text-sm uppercase tracking-[0.25em] mb-1 ${cfg.textColor}`}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              {species}
            </motion.p>

            {/* Name */}
            <motion.h2
              className="font-black text-4xl text-white text-center mb-3"
              style={{ textShadow: `0 0 20px ${realmColor}` }}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35, type: "spring", stiffness: 180, damping: 14 }}
            >
              {name}
            </motion.h2>

            {/* Rarity badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="mb-6"
            >
              <RarityBadge rarity={rarity} />
            </motion.div>

            {/* Share prompt button */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 }}
            >
              <Button
                onClick={() => setPhase("share")}
                className="font-black px-8 h-12"
                style={{
                  background: realmColor,
                  color: "#000",
                  boxShadow: `0 0 20px ${realmColor}80`,
                }}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share your hatch
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* ── PHASE: share ── */}
        {phase === "share" && (
          <motion.div
            key="share"
            className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Card preview */}
            <motion.div
              className="w-full max-w-sm rounded-3xl border-2 p-6 text-center mb-6 relative overflow-hidden"
              style={{
                borderColor: realmColor,
                boxShadow: `0 0 40px ${realmColor}50`,
                background: `radial-gradient(circle at 50% 30%, ${realmColor}20, rgba(0,0,0,0.8))`,
              }}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 180, damping: 16 }}
            >
              <div className="text-5xl mb-3">{realmEmoji}</div>
              <RarityBadge rarity={rarity} className="mb-2" />
              <h3 className="font-black text-2xl text-white mb-1">{name}</h3>
              <p className={`text-sm font-bold ${cfg.textColor}`}>{species}</p>
              <p className="text-xs text-white/50 mt-3">
                {steps.toLocaleString()} steps · HatchUp
              </p>

              {/* HatchUp branding strip */}
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">🥚 HatchUp</span>
              </div>
            </motion.div>

            {/* Share text preview */}
            <motion.p
              className="text-xs text-white/50 text-center italic mb-6 max-w-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              "I just hatched a {rarity} {species} after {steps.toLocaleString()} steps in HatchUp!"
            </motion.p>

            {/* Action buttons */}
            <motion.div
              className="w-full max-w-xs space-y-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                onClick={handleShare}
                disabled={sharing}
                className="w-full h-12 font-black"
                style={{
                  background: shared ? "#22c55e" : realmColor,
                  color: "#000",
                  boxShadow: `0 0 20px ${shared ? "#22c55e80" : `${realmColor}80`}`,
                }}
                data-testid="cinematic-share-button"
              >
                {shared ? (
                  <><Check className="w-4 h-4 mr-2" /> Shared!</>
                ) : sharing ? (
                  "Sharing…"
                ) : (
                  <><Share2 className="w-4 h-4 mr-2" /> Share via Web / Copy</>
                )}
              </Button>

              <Button
                onClick={onViewPal}
                variant="outline"
                className="w-full h-12 font-black border-white/20 text-white hover:bg-white/10"
                data-testid="cinematic-view-pal-button"
              >
                <Eye className="w-4 h-4 mr-2" /> View Pal
              </Button>

              <Button
                onClick={onClose}
                variant="ghost"
                className="w-full h-10 font-bold text-white/50 hover:text-white hover:bg-white/5"
                data-testid="cinematic-close-button"
              >
                <X className="w-4 h-4 mr-2" /> Close
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
