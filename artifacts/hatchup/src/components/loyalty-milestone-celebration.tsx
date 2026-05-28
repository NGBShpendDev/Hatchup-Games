import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface LoyaltyMilestoneData {
  palId: number;
  palName: string;
  milestone: 25 | 50 | 75 | 100;
  imageUrl?: string | null;
  realm?: string | null;
}

interface Props {
  data: LoyaltyMilestoneData | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

const MILESTONE_LABELS: Record<number, { emoji: string; title: string; subtitle: string; color: string; glow: string }> = {
  25:  { emoji: "💛", title: "First Bond!",      subtitle: "Loyalty Level 25 reached",  color: "#eab308", glow: "rgba(234,179,8,0.5)" },
  50:  { emoji: "🧡", title: "Trusted Partner!", subtitle: "Loyalty Level 50 reached",  color: "#f97316", glow: "rgba(249,115,22,0.5)" },
  75:  { emoji: "❤️",  title: "Devoted Ally!",   subtitle: "Loyalty Level 75 reached",  color: "#ef4444", glow: "rgba(239,68,68,0.5)"  },
  100: { emoji: "💜", title: "Unbreakable Bond!", subtitle: "Loyalty Level 100 — MAX!", color: "#a855f7", glow: "rgba(168,85,247,0.7)" },
};

const CONFETTI_COLORS = [
  "#ec4899", "#a855f7", "#3b82f6", "#22c55e",
  "#eab308", "#f97316", "#06b6d4", "#f43f5e",
];

const CONFETTI_COUNT = 60;

interface Particle {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
  rotate: number;
  rotateDir: number;
  speedX: number;
  speedY: number;
  shape: "rect" | "circle";
}

function useConfetti(canvasRef: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    particlesRef.current = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      r: 4 + Math.random() * 8,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotate: Math.random() * 360,
      rotateDir: Math.random() > 0.5 ? 1 : -1,
      speedX: (Math.random() - 0.5) * 3,
      speedY: 2.5 + Math.random() * 4,
      shape: Math.random() > 0.4 ? "rect" : "circle",
    }));

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotate += p.rotateDir * 3;

        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotate * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;

        if (p.shape === "rect") {
          ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, canvasRef]);
}

export function LoyaltyMilestoneCelebration({ data, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = !!data;
  useConfetti(canvasRef, active);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [data, onDismiss]);

  const meta = data ? MILESTONE_LABELS[data.milestone] : null;

  return (
    <AnimatePresence>
      {data && meta && (
        <motion.div
          key={`loyalty-milestone-${data.palId}-${data.milestone}`}
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          onClick={onDismiss}
        >
          {/* Dark backdrop */}
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

          {/* Canvas confetti */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
          />

          {/* Celebration card */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-5 px-8 py-10 rounded-3xl border-2 max-w-sm w-full mx-4 text-center"
            style={{
              borderColor: meta.color + "80",
              background: `radial-gradient(ellipse at center, ${meta.glow} 0%, rgba(0,0,0,0.9) 70%)`,
              boxShadow: `0 0 60px ${meta.glow}, 0 0 120px ${meta.glow}40`,
            }}
            initial={{ scale: 0.5, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", damping: 16, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Milestone badge ring */}
            <motion.div
              className="relative"
              animate={{
                boxShadow: [
                  `0 0 20px ${meta.glow}`,
                  `0 0 50px ${meta.glow}`,
                  `0 0 20px ${meta.glow}`,
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
              style={{ borderRadius: "50%", padding: 6, border: `3px solid ${meta.color}80` }}
            >
              <motion.div
                className="w-36 h-36 rounded-full overflow-hidden flex items-center justify-center"
                style={{ background: `radial-gradient(circle, ${meta.color}30, transparent 70%)` }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              >
                <motion.span
                  className="text-8xl select-none"
                  animate={{ rotate: [0, -8, 8, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                >
                  {meta.emoji}
                </motion.span>
              </motion.div>
            </motion.div>

            {/* "Loyalty Level Up!" headline */}
            <div className="space-y-1">
              <motion.p
                className="text-xs font-black uppercase tracking-[0.2em]"
                style={{ color: meta.color }}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                Loyalty Level Up!
              </motion.p>
              <h2 className="text-3xl font-black text-white leading-tight">{meta.title}</h2>
              <p className="text-sm font-bold" style={{ color: meta.color }}>
                {meta.subtitle}
              </p>
            </div>

            {/* Pal name */}
            <p className="text-muted-foreground text-sm font-bold">
              {data.palName} has reached a loyalty milestone!
            </p>

            {/* Milestone number badge */}
            <motion.div
              className="flex items-center gap-2 px-5 py-2 rounded-full font-black text-lg border"
              style={{ borderColor: meta.color + "60", color: meta.color, background: meta.color + "18" }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            >
              <span>❤️</span>
              <span>Loyalty {data.milestone}</span>
              {data.milestone === 100 && <span>👑</span>}
            </motion.div>

            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
              Tap anywhere to continue
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const MILESTONES = [25, 50, 75, 100] as const;
type Milestone = typeof MILESTONES[number];

const LS_KEY_PREFIX = "loyalty-milestone-celebrated";

function getLsKey(palId: number, milestone: Milestone) {
  return `${LS_KEY_PREFIX}-${palId}-${milestone}`;
}

export function checkLoyaltyMilestone(
  palId: number,
  prevScore: number,
  newScore: number
): Milestone | null {
  for (const m of [...MILESTONES].reverse()) {
    if (prevScore < m && newScore >= m) {
      const key = getLsKey(palId, m);
      if (!localStorage.getItem(key)) {
        return m;
      }
    }
  }
  return null;
}

export function markMilestoneSeen(palId: number, milestone: Milestone) {
  localStorage.setItem(getLsKey(palId, milestone), "1");
}
