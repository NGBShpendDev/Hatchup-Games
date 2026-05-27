import { motion } from "framer-motion";
import { Link } from "wouter";
import { Egg, Zap, Trophy, Users, Activity, ChevronRight, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Egg, title: "Hatch Your Pals", desc: "Walk, run, and train to hatch unique Fitness Pals from eggs powered by your real activity." },
  { icon: Activity, title: "Real Fitness Goals", desc: "Log steps, workouts, sleep, and nutrition — every rep evolves your Pals and unlocks new abilities." },
  { icon: Heart, title: "Fitness Is Better With Pals", desc: "Your Pals cheer you on, grow stronger when you do, and need you to keep moving." },
  { icon: Trophy, title: "Compete & Rank", desc: "Battle other Trainers, climb leaderboards, and win exclusive rewards with your Pals." },
  { icon: Users, title: "Train Together. Evolve Together.", desc: "Join clubs, tackle events, and grow stronger as a community." },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-[#050508] text-white overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ff2d55] to-[#bf00ff] flex items-center justify-center">
            <Egg size={16} className="text-white" />
          </div>
          <span className="font-black text-lg tracking-tight">HatchUp Fitness Pals</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" className="text-white/70 hover:text-white">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white border-0 hover:opacity-90">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-16 pb-20 text-center max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-white/70 mb-6">
            <Zap size={12} className="text-[#ff2d55]" />
            Every Step Evolves You.
          </div>
          <h1 className="text-5xl font-black leading-tight mb-4">
            Your Fitness
            <span className="block bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] bg-clip-text text-transparent">
              Hatches Pals
            </span>
          </h1>
          <p className="text-white/60 text-lg mb-3 leading-relaxed">
            HatchUp Fitness Pals is the fitness RPG where your real workouts hatch and evolve your Pals.
            Walk to hatch eggs. Train to evolve. Compete to become legend.
          </p>
          <p className="text-white/40 text-sm mb-8 font-medium">Fitness Is Better With Pals.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white border-0 hover:opacity-90 text-base font-bold px-8">
                Start Hatching Free
                <ChevronRight size={18} />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white/5 text-base px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Floating egg orbs */}
        <div className="relative mt-16 h-48 pointer-events-none">
          {[
            { x: "20%", color: "#3b82f6", delay: 0, size: 60 },
            { x: "50%", color: "#ff2d55", delay: 0.3, size: 80 },
            { x: "75%", color: "#f97316", delay: 0.6, size: 55 },
          ].map((orb, i) => (
            <motion.div
              key={i}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: orb.x }}
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
            >
              <div
                className="rounded-full opacity-80 flex items-center justify-center"
                style={{
                  width: orb.size, height: orb.size * 1.2,
                  background: `radial-gradient(circle at 35% 35%, ${orb.color}aa, ${orb.color}44)`,
                  border: `2px solid ${orb.color}66`,
                  boxShadow: `0 0 30px ${orb.color}44`,
                }}
              >
                <Egg size={orb.size * 0.4} color={orb.color} />
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-20 max-w-2xl mx-auto">
        <div className="space-y-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex items-start gap-4 bg-white/5 border border-white/10 rounded-2xl p-4"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff2d55]/20 to-[#bf00ff]/20 flex items-center justify-center shrink-0">
                <f.icon size={20} className="text-[#ff2d55]" />
              </div>
              <div>
                <div className="font-bold text-sm">{f.title}</div>
                <div className="text-white/50 text-sm mt-0.5">{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-20 text-center">
        <div className="bg-gradient-to-r from-[#ff2d55]/10 to-[#bf00ff]/10 border border-white/10 rounded-3xl p-8 max-w-md mx-auto">
          <h2 className="text-2xl font-black mb-2">Ready to Meet Your Pals?</h2>
          <p className="text-white/50 text-sm mb-1">Sign up free with Google or Apple ID — no credit card needed.</p>
          <p className="text-white/30 text-xs mb-6">Train Together. Evolve Together.</p>
          <Link href="/sign-up">
            <Button size="lg" className="w-full bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white border-0 hover:opacity-90 font-bold">
              Join HatchUp Fitness Pals
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 pb-8 text-center border-t border-white/5 pt-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#ff2d55] to-[#bf00ff] flex items-center justify-center">
            <Egg size={12} className="text-white" />
          </div>
          <span className="font-black text-sm tracking-tight">HatchUp Fitness Pals</span>
        </div>
        <p className="text-white/30 text-xs">Every Step Evolves You.</p>
      </footer>
    </div>
  );
}
