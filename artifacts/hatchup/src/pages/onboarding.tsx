import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type Step = "age" | "fitness" | "mode" | "path";

const AGE_RANGES = [
  { value: "under13", label: "Under 13",  emoji: "🐣", sub: "Young explorer" },
  { value: "teen",    label: "Teen",       emoji: "⚡", sub: "13–17 years" },
  { value: "adult",   label: "Adult",      emoji: "💪", sub: "18–59 years" },
  { value: "senior",  label: "Senior",     emoji: "🌿", sub: "60+ years" },
];

const FITNESS_LEVELS = [
  { value: "beginner",     label: "Beginner",     emoji: "🌱", sub: "Just starting out" },
  { value: "intermediate", label: "Intermediate", emoji: "🔥", sub: "Active a few days a week" },
  { value: "advanced",     label: "Advanced",     emoji: "🏆", sub: "Work out regularly" },
  { value: "elite",        label: "Elite",        emoji: "⚡", sub: "High-performance athlete" },
];

const ACC_MODES = [
  { value: "none",       label: "Standard",       emoji: "🎮", sub: "Full experience" },
  { value: "child",      label: "Child-Friendly", emoji: "🧒", sub: "Simplified UI, no social" },
  { value: "senior",     label: "Senior Mode",    emoji: "🌿", sub: "Low-impact first, bigger text" },
  { value: "low_impact", label: "Low-Impact",     emoji: "🪑", sub: "Seated & mobility workouts" },
];

const IDENTITY_PATHS = [
  { value: "casual_explorer", label: "Casual Explorer",  emoji: "🌿", sub: "Move at your own pace" },
  { value: "warrior",         label: "Warrior",          emoji: "⚔️", sub: "Push hard, train harder" },
  { value: "athlete",         label: "Athlete",          emoji: "🏅", sub: "Performance-focused" },
  { value: "recovery_master", label: "Recovery Master",  emoji: "🌸", sub: "Rest and restore" },
  { value: "wellness_mystic", label: "Wellness Mystic",  emoji: "✨", sub: "Mindful and holistic" },
  { value: "family_champion", label: "Family Champion",  emoji: "👨‍👩‍👧", sub: "Moving together" },
];

const STEPS: Step[] = ["age", "fitness", "mode", "path"];
const STEP_LABELS: Record<Step, string> = {
  age:     "Age Range",
  fitness: "Fitness Level",
  mode:    "Accessibility",
  path:    "Identity Path",
};

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("age");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const select = (field: string, value: string) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
    else submit();
  };

  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ageRange:          answers.age,
          fitnessLevel:      answers.fitness,
          accessibilityMode: answers.mode,
          identityPath:      answers.path,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onComplete();
    } catch {
      toast({ title: "Couldn't save your preferences", variant: "destructive" });
      setLoading(false);
    }
  };

  const canContinue = !!answers[step];

  const variants = {
    enter:  { x: 60, opacity: 0 },
    center: { x: 0,  opacity: 1 },
    exit:   { x: -60, opacity: 0 },
  };

  return (
    <div className="min-h-[100dvh] bg-[#050508] text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#ff2d55] to-[#bf00ff] flex items-center justify-center mx-auto mb-4 text-3xl">
            🥚
          </div>
          <h1 className="text-2xl font-black mb-1">Welcome to HatchUp!</h1>
          <p className="text-white/50 text-sm">Let's set up your experience</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
                i <= stepIndex ? "bg-gradient-to-r from-[#ff2d55] to-[#bf00ff]" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <p className="text-xs text-white/40 uppercase tracking-widest mb-2 text-center">
          Step {stepIndex + 1} of {STEPS.length} — {STEP_LABELS[step]}
        </p>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25 }}
          >
            {step === "age" && (
              <OptionGrid
                options={AGE_RANGES}
                selected={answers.age}
                onSelect={v => select("age", v)}
              />
            )}
            {step === "fitness" && (
              <OptionGrid
                options={FITNESS_LEVELS}
                selected={answers.fitness}
                onSelect={v => select("fitness", v)}
              />
            )}
            {step === "mode" && (
              <OptionGrid
                options={ACC_MODES}
                selected={answers.mode}
                onSelect={v => select("mode", v)}
              />
            )}
            {step === "path" && (
              <OptionGrid
                options={IDENTITY_PATHS}
                selected={answers.path}
                onSelect={v => select("path", v)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {stepIndex > 0 && (
            <Button
              variant="outline"
              className="flex-1 border-white/20 text-white bg-transparent hover:bg-white/5"
              onClick={back}
              disabled={loading}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            className="flex-1 bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white font-bold disabled:opacity-40"
            onClick={next}
            disabled={!canContinue || loading}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : stepIndex === STEPS.length - 1 ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                Let's Go!
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>

        {step !== "path" && (
          <button
            className="w-full text-center text-xs text-white/30 mt-4 hover:text-white/50 transition-colors"
            onClick={() => {
              if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
              else submit();
            }}
          >
            Skip this step
          </button>
        )}
      </div>
    </div>
  );
}

function OptionGrid({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string; emoji: string; sub: string }[];
  selected?: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className={`relative p-4 rounded-2xl border text-left transition-all duration-200 ${
            selected === opt.value
              ? "border-[#ff2d55] bg-[#ff2d55]/10 shadow-[0_0_16px_rgba(255,45,85,0.2)]"
              : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/8"
          }`}
        >
          {selected === opt.value && (
            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#ff2d55] flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
          <div className="text-2xl mb-2">{opt.emoji}</div>
          <div className="font-bold text-sm leading-tight">{opt.label}</div>
          <div className="text-xs text-white/40 mt-0.5">{opt.sub}</div>
        </button>
      ))}
    </div>
  );
}
