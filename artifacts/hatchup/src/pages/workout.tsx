import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useLogActivity } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Camera, CameraOff, Hand, Trophy, Zap, Egg,
  ChevronLeft, CheckCircle2, Star, Play, Square, Volume2,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Exercise catalogue ────────────────────────────────────────────────────────
const EXERCISES = [
  { id: "pushups",  name: "Push-Ups",         emoji: "💪", color: "#ef4444", cues: ["Lower chest to floor", "Full extension at top", "Keep core tight"] },
  { id: "squats",   name: "Squats",            emoji: "🦵", color: "#f97316", cues: ["Knees behind toes", "Thighs parallel to floor", "Chest up"] },
  { id: "burpees",  name: "Burpees",           emoji: "🔥", color: "#ec4899", cues: ["Chest to floor", "Jump up with hands raised", "Land softly"] },
  { id: "situps",   name: "Sit-Ups",           emoji: "⚡", color: "#a855f7", cues: ["Feet flat on floor", "Touch elbows to knees", "Controlled descent"] },
  { id: "pullups",  name: "Pull-Ups",          emoji: "🏋️", color: "#3b82f6", cues: ["Full hang at bottom", "Chin over bar at top", "Slow & controlled"] },
  { id: "planks",   name: "Planks",            emoji: "🧘", color: "#22c55e", cues: ["Hips level", "Core braced", "Eyes on floor"] },
] as const;

type ExerciseId = typeof EXERCISES[number]["id"];
type Exercise   = typeof EXERCISES[number];
type CountMode  = "manual" | "voice" | "camera";
type Phase      = "select" | "active" | "summary";
type VerifLevel = "bronze" | "silver" | "gold" | "diamond";

// ── Verification badge config ─────────────────────────────────────────────────
const BADGE = {
  bronze:  { label: "Bronze",  color: "#cd7f32", textColor: "#7c4a1a", bg: "#fef3c7", emoji: "🥉", mult: 1.0, desc: "Manual tracking" },
  silver:  { label: "Silver",  color: "#94a3b8", textColor: "#334155", bg: "#f1f5f9", emoji: "🥈", mult: 1.5, desc: "Voice verified (+50% XP & egg speed)" },
  gold:    { label: "Gold",    color: "#f59e0b", textColor: "#78350f", bg: "#fffbeb", emoji: "🥇", mult: 2.0, desc: "Smartwatch verified (×2 XP & egg speed)" },
  diamond: { label: "Diamond", color: "#818cf8", textColor: "#1e1b4b", bg: "#eef2ff", emoji: "💎", mult: 3.0, desc: "AI camera verified (×3 XP & egg speed)" },
} as const;

// ── Spoken-number helper ──────────────────────────────────────────────────────
const WORD_TO_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  "twenty one": 21, "twenty two": 22, "twenty three": 23, "twenty four": 24, "twenty five": 25,
  "twenty six": 26, "twenty seven": 27, "twenty eight": 28, "twenty nine": 29, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

function parseSpokenNumber(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (WORD_TO_NUM[t] != null) return WORD_TO_NUM[t];
  return null;
}

// ── Exercise select ───────────────────────────────────────────────────────────
function ExerciseSelect({ onSelect }: { onSelect: (e: Exercise) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Choose Exercise</h2>
        <p className="text-zinc-400 mt-1">Select to start your rep counter</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {EXERCISES.map(ex => (
          <motion.button
            key={ex.id}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(ex)}
            className="relative rounded-2xl p-5 text-left border border-white/10 bg-white/5 backdrop-blur hover:bg-white/10 transition-colors"
          >
            <div className="text-4xl mb-3">{ex.emoji}</div>
            <div className="font-bold text-white text-base">{ex.name}</div>
            <div
              className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl"
              style={{ background: ex.color }}
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ── Active workout ────────────────────────────────────────────────────────────
function ActiveWorkout({
  exercise,
  isPremium,
  onFinish,
  onBack,
}: {
  exercise: Exercise;
  isPremium: boolean;
  onFinish: (reps: number, mode: CountMode, seconds: number) => void;
  onBack: () => void;
}) {
  const [mode, setMode]       = useState<CountMode>("manual");
  const [reps, setReps]       = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [formCue, setFormCue] = useState<string | null>(null);
  const [lastDetectedNum, setLastDetectedNum] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number>(0);
  const prevBrightRef  = useRef<number[]>([]);
  const repsRef        = useRef(reps);
  repsRef.current      = reps;

  // Timer
  useEffect(() => {
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Form cue rotation
  useEffect(() => {
    setFormCue(exercise.cues[0]);
    let idx = 0;
    const id = setInterval(() => {
      idx = (idx + 1) % exercise.cues.length;
      setFormCue(exercise.cues[idx]);
    }, 6000);
    return () => clearInterval(id);
  }, [exercise]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoice();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mode switching: stop old before starting new ──────────────────────────
  function switchMode(next: CountMode) {
    stopVoice();
    stopCamera();
    setMode(next);
    setCameraReady(false);
    setCameraError(null);
    if (next === "voice")  startVoice();
    if (next === "camera") startCamera();
  }

  // ── Voice counting via Web Speech API ────────────────────────────────────
  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript.trim();
      const num  = parseSpokenNumber(text);
      if (num !== null && num > 0 && num <= 999) {
        setLastDetectedNum(num);
        setReps(prev => Math.max(prev, num));
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend   = () => { if (isListening) rec.start(); };
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }

  // ── Camera motion-based rep counting ─────────────────────────────────────
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        detectMotion();
      }
    } catch {
      setCameraError("Camera access denied. Switch to voice or manual mode.");
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  const detectMotion = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const W = 160, H = 120;
    canvas.width  = W;
    canvas.height = H;

    // Sample brightness in the lower 2/3 — that's where the body moves most
    const sampleY  = Math.round(H * 0.33);
    const sampleH  = H - sampleY;

    let peakBuffer: number[] = [];
    let lastPeak  = false;

    function sample() {
      ctx!.drawImage(video!, 0, 0, W, H);
      const pxData = ctx!.getImageData(0, sampleY, W, sampleH).data;
      let brightness = 0;
      const pixels = pxData.length / 4;
      for (let i = 0; i < pxData.length; i += 4) {
        brightness += (pxData[i]! + pxData[i + 1]! + pxData[i + 2]!) / 3;
      }
      brightness /= pixels;

      peakBuffer.push(brightness);
      if (peakBuffer.length > 20) peakBuffer.shift();

      // Simple peak detection: look for a local maximum then minimum cycle
      if (peakBuffer.length >= 10) {
        const mid = peakBuffer[peakBuffer.length - 5]!;
        const avg = peakBuffer.reduce((a, b) => a + b, 0) / peakBuffer.length;
        const isHigh = mid > avg + 3;   // "top" of movement
        const isLow  = mid < avg - 3;   // "bottom" of movement

        if (lastPeak && isLow) {
          // Completed one rep (high → low cycle)
          setReps(r => r + 1);
          lastPeak = false;
        } else if (!lastPeak && isHigh) {
          lastPeak = true;
        }
      }

      prevBrightRef.current = peakBuffer;
      rafRef.current = requestAnimationFrame(sample);
    }

    sample();
  }, []);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const modeVerif: Record<CountMode, VerifLevel> = { manual: "bronze", voice: "silver", camera: "diamond" };
  const badge = BADGE[modeVerif[mode]];

  const SpeechAvailable = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{exercise.emoji}</span>
          <h2 className="text-xl font-bold text-white">{exercise.name}</h2>
        </div>
        <div className="ml-auto font-mono text-lg text-zinc-300">{fmt(seconds)}</div>
      </div>

      {/* Verification badge earned */}
      <div
        className="rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-semibold border"
        style={{ background: badge.bg, borderColor: badge.color + "44", color: badge.textColor }}
      >
        <span>{badge.emoji}</span>
        <span>{badge.label} Verification</span>
        {badge.mult > 1 && (
          <span className="ml-auto text-xs opacity-70">{badge.mult}× XP &amp; egg speed</span>
        )}
      </div>

      {/* Rep counter */}
      <motion.div
        className="rounded-3xl border border-white/10 bg-white/5 flex flex-col items-center justify-center py-8"
        key={reps}
        animate={{ scale: reps > 0 ? [1, 1.05, 1] : 1 }}
        transition={{ duration: 0.15 }}
      >
        <div className="text-8xl font-black text-white tabular-nums leading-none">{reps}</div>
        <div className="text-zinc-400 mt-2 text-sm font-medium uppercase tracking-widest">reps</div>

        {/* Milestone banners */}
        <AnimatePresence>
          {reps > 0 && reps % 25 === 0 && (
            <motion.div
              key={reps}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-1 text-yellow-400 font-bold text-sm"
            >
              <Star className="w-4 h-4 fill-yellow-400" />
              {reps} reps completed!
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-2">
        {(["manual", "voice", "camera"] as CountMode[]).map(m => {
          const active = mode === m;
          const icons  = { manual: <Hand className="w-4 h-4" />, voice: <Mic className="w-4 h-4" />, camera: <Camera className="w-4 h-4" /> };
          const labels = { manual: "Tap", voice: "Voice", camera: "Camera" };
          const locked = m === "camera" && !isPremium;
          return (
            <button
              key={m}
              disabled={locked}
              onClick={() => switchMode(m)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all ${
                active
                  ? "border-pink-500 bg-pink-500/20 text-pink-300"
                  : locked
                  ? "border-white/5 bg-white/5 text-zinc-600 cursor-not-allowed"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
              }`}
            >
              {icons[m]}
              {labels[m]}
              {locked && <span className="text-[10px] text-yellow-500">Premium</span>}
            </button>
          );
        })}
      </div>

      {/* Mode-specific UI */}
      {mode === "manual" && (
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => setReps(r => r + 1)}
          className="w-full rounded-2xl border-2 border-pink-500/50 bg-pink-500/10 py-6 text-white font-bold text-lg hover:bg-pink-500/20 transition-colors active:bg-pink-500/30 select-none"
        >
          Tap to Count
        </motion.button>
      )}

      {mode === "voice" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center space-y-3">
          {!SpeechAvailable ? (
            <p className="text-zinc-400 text-sm">Voice counting requires Chrome or Safari.</p>
          ) : (
            <>
              <div className={`flex items-center justify-center gap-2 text-sm font-semibold ${isListening ? "text-green-400" : "text-zinc-400"}`}>
                {isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                {isListening ? "Listening — count aloud!" : "Microphone inactive"}
              </div>
              {lastDetectedNum != null && (
                <div className="text-xs text-zinc-500">
                  Last heard: <span className="text-white font-bold">{lastDetectedNum}</span>
                </div>
              )}
              <p className="text-zinc-500 text-xs">Count aloud: "1… 2… 3…" — the app tracks the highest number you say.</p>
            </>
          )}
        </div>
      )}

      {mode === "camera" && (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 overflow-hidden">
          {cameraError && (
            <div className="p-4 text-center text-red-400 text-sm">{cameraError}</div>
          )}
          <div className="relative">
            <video
              ref={videoRef}
              muted
              playsInline
              className={`w-full rounded-t-2xl ${cameraReady ? "block" : "hidden"}`}
              style={{ maxHeight: 200, objectFit: "cover", transform: "scaleX(-1)" }}
            />
            <canvas ref={canvasRef} className="hidden" />
            {!cameraReady && !cameraError && (
              <div className="p-8 text-center text-zinc-400 text-sm flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 animate-pulse" />
                Starting camera…
              </div>
            )}
            {cameraReady && (
              <div className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-1 text-xs text-green-400 font-semibold flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                AI tracking
              </div>
            )}
          </div>
          <div className="p-3 text-xs text-zinc-400 text-center">
            Position yourself so your full body is visible. Rep detection uses motion analysis.
          </div>
        </div>
      )}

      {/* Form coaching cue */}
      <AnimatePresence mode="wait">
        <motion.div
          key={formCue}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 flex items-center gap-2 text-sm text-zinc-300"
        >
          <Volume2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          {formCue}
        </motion.div>
      </AnimatePresence>

      {/* Reset + Finish */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 border-white/10 text-zinc-400 hover:text-white"
          onClick={() => setReps(0)}
        >
          Reset
        </Button>
        <Button
          className="flex-2 flex-grow bg-pink-600 hover:bg-pink-500 text-white font-bold"
          onClick={() => onFinish(reps, mode, seconds)}
          disabled={reps === 0}
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
          Finish Workout
        </Button>
      </div>
    </div>
  );
}

// ── Summary screen ─────────────────────────────────────────────────────────────
function WorkoutSummary({
  exercise,
  reps,
  mode,
  seconds,
  xpEarned,
  eggsUpdated,
  palXpDelta,
  onDone,
}: {
  exercise: Exercise;
  reps: number;
  mode: CountMode;
  seconds: number;
  xpEarned: number;
  eggsUpdated: number;
  palXpDelta: number;
  onDone: () => void;
}) {
  const modeVerif: Record<CountMode, VerifLevel> = { manual: "bronze", voice: "silver", camera: "diamond" };
  const level = modeVerif[mode];
  const badge = BADGE[level];
  const calories = Math.round(reps * 0.5 + seconds * 0.08);
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center py-4"
      >
        <div className="text-6xl mb-2">{exercise.emoji}</div>
        <h2 className="text-2xl font-black text-white">Workout Complete!</h2>
        <p className="text-zinc-400 text-sm mt-1">{exercise.name}</p>
      </motion.div>

      {/* Verification badge */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border p-4 text-center space-y-1"
        style={{ borderColor: badge.color + "66", background: badge.bg }}
      >
        <div className="text-3xl">{badge.emoji}</div>
        <div className="font-black text-lg" style={{ color: badge.textColor }}>
          {badge.label} Verified
        </div>
        <div className="text-xs opacity-70" style={{ color: badge.textColor }}>{badge.desc}</div>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-2 gap-3"
      >
        {[
          { icon: <Trophy className="w-4 h-4 text-yellow-400" />, label: "Total Reps",    value: reps,             unit: "reps" },
          { icon: <span className="text-sm">⏱️</span>,            label: "Duration",      value: fmt(seconds),     unit: "" },
          { icon: <span className="text-sm">🔥</span>,            label: "Calories",      value: calories,         unit: "kcal" },
          { icon: <Zap className="w-4 h-4 text-pink-400" />,      label: "XP Earned",     value: `+${xpEarned}`,  unit: "XP" },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
            {s.icon}
            <div>
              <div className="text-xs text-zinc-500">{s.label}</div>
              <div className="font-bold text-white text-sm">
                {s.value} <span className="text-zinc-500 font-normal text-xs">{s.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Pal & egg progress */}
      {(palXpDelta > 0 || eggsUpdated > 0) && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-2"
        >
          <div className="text-sm font-bold text-purple-300 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-purple-400 text-purple-400" />
            Creature Bonuses
          </div>
          {palXpDelta > 0 && (
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <span>⚡</span>
              <span>Active Pal gained <span className="font-bold text-white">+{palXpDelta} XP</span></span>
            </div>
          )}
          {eggsUpdated > 0 && (
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Egg className="w-4 h-4 text-pink-400" />
              <span>{eggsUpdated} egg{eggsUpdated > 1 ? "s" : ""} advanced toward hatching</span>
              {badge.mult > 1 && (
                <Badge className="ml-auto text-[10px] bg-pink-500/20 text-pink-300 border-0">
                  {badge.mult}× boost
                </Badge>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* XP multiplier callout */}
      {badge.mult > 1 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-gradient-to-r from-pink-900/40 to-purple-900/40 border border-pink-500/20 px-4 py-3 text-sm text-zinc-300 text-center"
        >
          <span className="font-bold text-white">{badge.mult}× multiplier</span> applied to XP and egg hatching speed!
        </motion.div>
      )}

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        <Button
          className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 text-base"
          onClick={onDone}
        >
          Done
        </Button>
      </motion.div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkoutPage() {
  const [, navigate]  = useLocation();
  const queryClient   = useQueryClient();
  const { toast }     = useToast();
  const { player, playerId } = usePlayer();

  const [phase,    setPhase]    = useState<Phase>("select");
  const [exercise, setExercise] = useState<Exercise>(EXERCISES[0]);
  const [mode,     setMode]     = useState<CountMode>("manual");
  const [summary,  setSummary]  = useState<{
    reps: number; seconds: number; xpEarned: number; eggsUpdated: number; palXpDelta: number;
  } | null>(null);

  const logActivity = useLogActivity();

  const isPremium = !!(
    player && (
      (player as any).subscriptionTier === "premium" ||
      (player as any).subscriptionSource === "trial"
    )
  );

  const modeVerif: Record<CountMode, VerifLevel> = { manual: "bronze", voice: "silver", camera: "diamond" };

  async function handleFinish(reps: number, countMode: CountMode, seconds: number) {
    const pid = playerId ?? 0;
    if (!pid) return;

    const verificationLevel = modeVerif[countMode];

    try {
      const result = await logActivity.mutateAsync({
        data: {
          playerId: pid,
          type: exercise.id as string,
          value: reps,
          note: `Rep counter: ${countMode} mode`,
          verificationLevel,
        },
      });

      setSummary({
        reps,
        seconds,
        xpEarned:    result.fitnessXpEarned,
        eggsUpdated: result.eggsUpdated,
        palXpDelta:  result.palXpResult?.xpDelta ?? 0,
      });
      setMode(countMode);
      setPhase("summary");

      // Invalidate player + hatchlings so home updates
      queryClient.invalidateQueries({ queryKey: ["getPlayer"] });
      queryClient.invalidateQueries({ queryKey: ["listHatchlings"] });
      queryClient.invalidateQueries({ queryKey: ["listFitnessActivities"] });
    } catch {
      toast({ title: "Error", description: "Could not save workout. Please try again.", variant: "destructive" });
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-6 min-h-screen">
        {/* Page header */}
        {phase === "select" && (
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => navigate("/training")} className="text-zinc-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-white">Rep Counter</h1>
              <p className="text-zinc-500 text-xs mt-0.5">Verified reps = faster hatching &amp; creature growth</p>
            </div>
          </div>
        )}

        {/* Verification level legend (select screen only) */}
        {phase === "select" && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Verification Levels</div>
            {(["bronze", "silver", "diamond"] as VerifLevel[]).map(lvl => {
              const b = BADGE[lvl];
              const locked = lvl === "diamond" && !isPremium;
              return (
                <div key={lvl} className="flex items-center gap-2 text-sm">
                  <span>{b.emoji}</span>
                  <span className="font-semibold text-white">{b.label}</span>
                  <span className="text-zinc-500 text-xs flex-1">{b.desc}</span>
                  {locked && <span className="text-yellow-500 text-xs font-semibold">Premium</span>}
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {phase === "select" && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ExerciseSelect
                onSelect={ex => {
                  setExercise(ex);
                  setPhase("active");
                }}
              />
            </motion.div>
          )}

          {phase === "active" && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ActiveWorkout
                exercise={exercise}
                isPremium={isPremium}
                onFinish={handleFinish}
                onBack={() => setPhase("select")}
              />
            </motion.div>
          )}

          {phase === "summary" && summary && (
            <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WorkoutSummary
                exercise={exercise}
                reps={summary.reps}
                mode={mode}
                seconds={summary.seconds}
                xpEarned={summary.xpEarned}
                eggsUpdated={summary.eggsUpdated}
                palXpDelta={summary.palXpDelta}
                onDone={() => navigate("/training")}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
