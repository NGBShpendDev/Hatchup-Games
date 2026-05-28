import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ComebackStreakData {
  palName: string;
  streakCount: number;
}

interface Props {
  data: ComebackStreakData | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

const FIRE_COLORS = [
  "#f97316", "#ef4444", "#fbbf24", "#f43f5e",
  "#fb923c", "#fcd34d", "#dc2626", "#fde68a",
];

const PARTICLE_COUNT = 55;

interface FireParticle {
  id: number;
  x: number;
  y: number;
  r: number;
  color: string;
  speedX: number;
  speedY: number;
  life: number;
  maxLife: number;
}

function useFireParticles(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean,
) {
  const particlesRef = useRef<FireParticle[]>([]);
  const rafRef = useRef<number>(0);
  const nextIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    function spawn(): FireParticle {
      const id = nextIdRef.current++;
      const maxLife = 60 + Math.random() * 60;
      return {
        id,
        x: Math.random() * canvas!.width,
        y: canvas!.height + 10,
        r: 3 + Math.random() * 9,
        color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        speedX: (Math.random() - 0.5) * 2.5,
        speedY: -(2 + Math.random() * 4),
        life: 0,
        maxLife,
      };
    }

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, spawn);

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p, i) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.life++;

        const progress = p.life / p.maxLife;
        const alpha = 1 - progress;
        const radius = p.r * (1 - progress * 0.5);

        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = radius * 2;
        ctx.fill();
        ctx.restore();

        if (p.life >= p.maxLife) {
          particlesRef.current[i] = spawn();
        }
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

export function ComebackStreakCelebration({ data, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = !!data;
  useFireParticles(canvasRef, active);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [data, onDismiss]);

  const fireColor = "#f97316";
  const fireGlow = "rgba(249,115,22,0.6)";

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key={`comeback-streak-${data.streakCount}`}
          className="fixed inset-0 z-[85] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          onClick={onDismiss}
        >
          {/* Dark backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Fire particle canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
          />

          {/* Celebration card */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-5 px-8 py-10 rounded-3xl border-2 max-w-sm w-full mx-4 text-center"
            style={{
              borderColor: "#f9731680",
              background: `radial-gradient(ellipse at center, rgba(249,115,22,0.25) 0%, rgba(0,0,0,0.92) 70%)`,
              boxShadow: `0 0 60px ${fireGlow}, 0 0 120px rgba(249,115,22,0.25)`,
            }}
            initial={{ scale: 0.5, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", damping: 16, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fire emoji pulsing ring */}
            <motion.div
              style={{
                borderRadius: "50%",
                padding: 6,
                border: `3px solid #f9731680`,
              }}
              animate={{
                boxShadow: [
                  `0 0 20px ${fireGlow}`,
                  `0 0 55px ${fireGlow}`,
                  `0 0 20px ${fireGlow}`,
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            >
              <motion.div
                className="w-36 h-36 rounded-full flex items-center justify-center"
                style={{
                  background: `radial-gradient(circle, rgba(249,115,22,0.25), transparent 70%)`,
                }}
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              >
                <motion.span
                  className="text-8xl select-none"
                  animate={{ rotate: [-6, 6, -6], scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                >
                  🔥
                </motion.span>
              </motion.div>
            </motion.div>

            {/* Headline */}
            <div className="space-y-1">
              <motion.p
                className="text-xs font-black uppercase tracking-[0.2em]"
                style={{ color: fireColor }}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              >
                Comeback Streak!
              </motion.p>
              <h2 className="text-3xl font-black text-white leading-tight">
                Unstoppable!
              </h2>
              <p className="text-sm font-bold" style={{ color: fireColor }}>
                {data.streakCount} consecutive comebacks
              </p>
            </div>

            {/* Pal name */}
            <p className="text-muted-foreground text-sm font-bold">
              {data.palName} is on fire!
            </p>

            {/* Bonus rewards */}
            <motion.div
              className="flex items-center gap-3"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1.7, ease: "easeInOut" }}
            >
              <div
                className="flex items-center gap-1.5 px-4 py-2 rounded-full font-black text-base border"
                style={{ borderColor: "#eab30860", color: "#eab308", background: "#eab30818" }}
              >
                <span>⚡</span>
                <span>+50 XP</span>
              </div>
              <div
                className="flex items-center gap-1.5 px-4 py-2 rounded-full font-black text-base border"
                style={{ borderColor: "#f9731660", color: fireColor, background: "#f9731618" }}
              >
                <span>❤️</span>
                <span>+5 Loyalty</span>
              </div>
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
