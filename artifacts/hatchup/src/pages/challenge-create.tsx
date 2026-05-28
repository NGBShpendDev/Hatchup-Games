import { useState } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useCreateChallenge } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SafetyBanner } from "@/components/safety-banner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Target, Trophy, Globe, Lock,
  MapPin, Users2, Zap, Coins, CheckCircle2, Swords,
  AlertTriangle,
} from "lucide-react";

const METRICS = [
  { id: "steps",       label: "Steps",        icon: "👟", desc: "Daily step count"          },
  { id: "pushups",     label: "Pushups",       icon: "💪", desc: "Total rep count"           },
  { id: "workouts",    label: "Workouts",      icon: "🏋️", desc: "Completed workout sessions" },
  { id: "streak_days", label: "Streak Days",   icon: "🔥", desc: "Active days in a row"      },
  { id: "calories",    label: "Calories",      icon: "🍎", desc: "Total calories burned"     },
  { id: "miles",       label: "Miles",         icon: "🏃", desc: "Total miles covered"       },
  { id: "pullups",     label: "Pullups",       icon: "🤸", desc: "Total pullup reps"         },
];

const TYPES = [
  { id: "public",  label: "Public",  icon: <Globe className="w-5 h-5" />,  desc: "Anyone can join",                 meetup: false },
  { id: "private", label: "Private", icon: <Lock className="w-5 h-5" />,   desc: "Invite only",                     meetup: false },
  { id: "city",    label: "City",    icon: <MapPin className="w-5 h-5" />, desc: "Open to nearby players",          meetup: true  },
  { id: "guild",   label: "Guild",   icon: <Users2 className="w-5 h-5" />, desc: "For your group/club members",    meetup: false },
];

const DURATIONS = [
  { days: 1,  label: "1 Day"   },
  { days: 3,  label: "3 Days"  },
  { days: 7,  label: "1 Week"  },
  { days: 14, label: "2 Weeks" },
  { days: 30, label: "1 Month" },
];

const TARGETS: Record<string, number[]> = {
  steps:       [5000, 10000, 20000, 50000, 100000],
  pushups:     [50, 100, 250, 500, 1000],
  workouts:    [3, 5, 10, 20, 30],
  streak_days: [3, 5, 7, 14, 30],
  calories:    [500, 1000, 2500, 5000, 10000],
  miles:       [5, 10, 25, 50, 100],
  pullups:     [25, 50, 100, 250, 500],
};

interface FormState {
  title: string;
  description: string;
  metric: string;
  targetValue: number;
  durationDays: number;
  type: string;
  requiresPublicMeetup: boolean;
  rewardXp: number;
  rewardCoins: number;
  maxParticipants: number;
  isElimination: boolean;
}

const STEPS = ["metric", "details", "type", "rewards", "review"] as const;
type Step = typeof STEPS[number];

const STEP_LABELS: Record<Step, string> = {
  metric:  "Metric",
  details: "Details",
  type:    "Type",
  rewards: "Rewards",
  review:  "Review",
};

export default function ChallengeCreate() {
  const [, navigate] = useLocation();
  const { player } = usePlayer();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("metric");

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    metric: "",
    targetValue: 10000,
    durationDays: 7,
    type: "public",
    requiresPublicMeetup: false,
    rewardXp: 100,
    rewardCoins: 50,
    maxParticipants: 100,
    isElimination: false,
  });

  const createMutation = useCreateChallenge({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Challenge created!", description: "It's live. Let the games begin! 🏆" });
        navigate(`/challenges/${data.id}`);
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error ?? "Could not create challenge", variant: "destructive" });
      },
    },
  });

  const stepIdx = STEPS.indexOf(step);
  const canNext = (): boolean => {
    if (step === "metric") return form.metric !== "";
    if (step === "details") return form.title.trim().length >= 3 && form.targetValue >= 1;
    return true;
  };

  const goNext = () => {
    if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1]);
  };
  const goBack = () => {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1]);
    else navigate("/challenges");
  };

  const handleTypeSelect = (typeId: string) => {
    const t = TYPES.find(x => x.id === typeId);
    setForm(f => ({ ...f, type: typeId, requiresPublicMeetup: t?.meetup ?? false }));
  };

  const handleSubmit = () => {
    createMutation.mutate({
      data: {
        title: form.title.trim(),
        description: form.description.trim(),
        metric: form.metric,
        targetValue: form.targetValue,
        durationDays: form.durationDays,
        type: form.type as "public" | "private" | "guild" | "city",
        rewardXp: form.rewardXp,
        rewardCoins: form.rewardCoins,
        requiresPublicMeetup: form.requiresPublicMeetup,
        maxParticipants: form.maxParticipants,
        isElimination: form.isElimination,
      },
    });
  };

  const selectedMetric = METRICS.find(m => m.id === form.metric);
  const isMinor = (player as { isMinor?: boolean } | null)?.isMinor ?? false;

  return (
    <Layout>
      <div className="max-w-xl mx-auto pb-24 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pt-4">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-black text-foreground">Create Challenge</h1>
            <p className="text-xs text-muted-foreground">Step {stepIdx + 1} of {STEPS.length}: {STEP_LABELS[step]}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-2 px-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= stepIdx ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Step: Metric */}
            {step === "metric" && (
              <>
                <p className="text-sm text-muted-foreground px-1">What will players compete on?</p>
                <div className="grid grid-cols-2 gap-3">
                  {METRICS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setForm(f => ({
                        ...f,
                        metric: m.id,
                        targetValue: TARGETS[m.id]?.[2] ?? 1000,
                      }))}
                      className={`p-3 rounded-2xl border text-left transition-all duration-200 ${
                        form.metric === m.id
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                          : "border-border/50 bg-card/60 hover:border-primary/40"
                      }`}
                    >
                      <span className="text-2xl mb-1 block">{m.icon}</span>
                      <p className="font-black text-sm text-foreground">{m.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step: Details */}
            {step === "details" && (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-bold text-foreground mb-1.5 block">Challenge Title *</label>
                    <Input
                      placeholder="e.g. 10k Steps Showdown"
                      value={form.title}
                      onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                      maxLength={80}
                      className="bg-card/60"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{form.title.length}/80</p>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-foreground mb-1.5 block">Description</label>
                    <Textarea
                      placeholder="Describe the challenge rules, goals, or tips…"
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      maxLength={500}
                      rows={3}
                      className="bg-card/60 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-bold text-foreground mb-2 block">
                      Target — {selectedMetric?.label}
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(TARGETS[form.metric] ?? []).map((v) => (
                        <button
                          key={v}
                          onClick={() => setForm(f => ({ ...f, targetValue: v }))}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${
                            form.targetValue === v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {v >= 1000 ? `${v / 1000}k` : v}
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      value={form.targetValue}
                      onChange={(e) => setForm(f => ({ ...f, targetValue: Math.max(1, Number(e.target.value)) }))}
                      className="bg-card/60"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-bold text-foreground mb-2 block">Duration</label>
                    <div className="flex flex-wrap gap-2">
                      {DURATIONS.map((d) => (
                        <button
                          key={d.days}
                          onClick={() => setForm(f => ({ ...f, durationDays: d.days }))}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${
                            form.durationDays === d.days
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Step: Type */}
            {step === "type" && (
              <>
                <p className="text-sm text-muted-foreground px-1">Who can participate?</p>
                <div className="space-y-3">
                  {TYPES.map((t) => {
                    const isMeetup = t.meetup;
                    const blocked = isMeetup && isMinor;
                    return (
                      <button
                        key={t.id}
                        onClick={() => !blocked && handleTypeSelect(t.id)}
                        disabled={blocked}
                        className={`w-full p-4 rounded-2xl border text-left transition-all ${
                          form.type === t.id
                            ? "border-primary bg-primary/10"
                            : blocked
                              ? "border-border/30 opacity-50 cursor-not-allowed"
                              : "border-border/50 bg-card/60 hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${form.type === t.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {t.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-black text-foreground">{t.label}</p>
                              {isMeetup && <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/40">Meetup</Badge>}
                              {blocked && <Badge variant="destructive" className="text-xs">18+ only</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground">{t.desc}</p>
                          </div>
                          {form.type === t.id && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {form.requiresPublicMeetup && (
                  <SafetyBanner variant="event" dismissible={false} />
                )}

                {isMinor && (
                  <Card className="border-orange-500/30 bg-orange-950/10">
                    <CardContent className="p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-300">
                        Players under 18 cannot create challenges with physical meetups. Parental consent is required for in-person activities.
                      </p>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-3 mt-2">
                  <div>
                    <label className="text-sm font-bold text-foreground mb-1.5 block">Max Participants</label>
                    <div className="flex flex-wrap gap-2">
                      {[10, 25, 50, 100, 250].map((v) => (
                        <button
                          key={v}
                          onClick={() => setForm(f => ({ ...f, maxParticipants: v }))}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${
                            form.maxParticipants === v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setForm(f => ({ ...f, isElimination: !f.isElimination }))}
                    className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                      form.isElimination ? "border-primary bg-primary/10" : "border-border/50 bg-card/60"
                    }`}
                  >
                    <Swords className={`w-5 h-5 shrink-0 ${form.isElimination ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <p className="font-bold text-sm text-foreground">Elimination Tournament</p>
                      <p className="text-xs text-muted-foreground">Players are knocked out each round</p>
                    </div>
                    {form.isElimination && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                  </button>
                </div>
              </>
            )}

            {/* Step: Rewards */}
            {step === "rewards" && (
              <>
                <p className="text-sm text-muted-foreground px-1">What does the winner earn?</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold text-foreground mb-2 block flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" /> XP Reward (1st place)
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {[50, 100, 250, 500, 1000].map((v) => (
                        <button
                          key={v}
                          onClick={() => setForm(f => ({ ...f, rewardXp: v }))}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${
                            form.rewardXp === v
                              ? "border-yellow-400 bg-yellow-400/10 text-yellow-400"
                              : "border-border/50 text-muted-foreground hover:border-yellow-400/40"
                          }`}
                        >
                          {v} XP
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-foreground mb-2 block flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-400" /> Coins Reward (1st place)
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {[25, 50, 100, 250, 500].map((v) => (
                        <button
                          key={v}
                          onClick={() => setForm(f => ({ ...f, rewardCoins: v }))}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${
                            form.rewardCoins === v
                              ? "border-amber-400 bg-amber-400/10 text-amber-400"
                              : "border-border/50 text-muted-foreground hover:border-amber-400/40"
                          }`}
                        >
                          {v} 🪙
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reward summary */}
                  <Card className="border-yellow-500/20 bg-yellow-950/10">
                    <CardContent className="p-3 space-y-1.5">
                      <p className="text-xs font-black text-yellow-300 uppercase tracking-wide">Prize Pool</p>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">1st Place</p>
                          <p className="font-black text-sm text-yellow-400">{form.rewardXp} XP + {form.rewardCoins} 🪙</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">2nd Place</p>
                          <p className="font-bold text-sm text-slate-400">{Math.floor(form.rewardXp * 0.6)} XP + {Math.floor(form.rewardCoins * 0.6)} 🪙</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">3rd Place</p>
                          <p className="font-bold text-sm text-amber-600">{Math.floor(form.rewardXp * 0.3)} XP + {Math.floor(form.rewardCoins * 0.3)} 🪙</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* Step: Review */}
            {step === "review" && (
              <>
                <p className="text-sm text-muted-foreground px-1">Review your challenge before launching</p>

                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Title</p>
                      <p className="font-black text-foreground text-lg">{form.title}</p>
                      {form.description && <p className="text-sm text-muted-foreground mt-1">{form.description}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Metric</p>
                        <p className="font-bold">{selectedMetric?.icon} {selectedMetric?.label}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Target</p>
                        <p className="font-bold">{form.targetValue.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="font-bold">{form.durationDays} {form.durationDays === 1 ? "day" : "days"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-bold capitalize">{form.type}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Max Players</p>
                        <p className="font-bold">{form.maxParticipants}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Format</p>
                        <p className="font-bold">{form.isElimination ? "🏆 Elimination" : "Standard"}</p>
                      </div>
                    </div>

                    <div className="border-t border-primary/20 pt-3">
                      <p className="text-xs text-muted-foreground mb-1">1st Place Prize</p>
                      <p className="font-black text-yellow-400">
                        {form.rewardXp} XP + {form.rewardCoins} 🪙
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {form.requiresPublicMeetup && <SafetyBanner variant="event" dismissible={false} />}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {stepIdx > 0 && (
            <Button variant="outline" onClick={goBack} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          )}
          {step !== "review" ? (
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 font-black"
              onClick={goNext}
              disabled={!canNext()}
            >
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 font-black"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "🚀 Launch Challenge"}
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
