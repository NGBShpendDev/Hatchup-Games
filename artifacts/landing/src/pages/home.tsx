import { motion } from "framer-motion";
import {
  Sparkles,
  Flame,
  Trophy,
  Users,
  Shield,
  HeartPulse,
  Apple,
  Egg,
  Zap,
  Star,
  ChevronRight,
  Smartphone,
} from "lucide-react";
import { FaApple, FaGooglePlay } from "react-icons/fa";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

function StoreButtons({ size = "lg" }: { size?: "lg" | "md" }) {
  const pad = size === "lg" ? "px-6 py-4" : "px-5 py-3";
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <a
        href="#"
        aria-label="Download on the App Store"
        className={`group flex items-center gap-3 ${pad} rounded-2xl bg-white text-black hover:bg-white/90 transition-colors shadow-lg`}
      >
        <FaApple className="w-7 h-7" />
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wider opacity-70 leading-none">
            Download on the
          </div>
          <div className="text-lg font-semibold leading-tight">App Store</div>
        </div>
      </a>
      <a
        href="#"
        aria-label="Get it on Google Play"
        className={`group flex items-center gap-3 ${pad} rounded-2xl bg-white text-black hover:bg-white/90 transition-colors shadow-lg`}
      >
        <FaGooglePlay className="w-6 h-6" />
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wider opacity-70 leading-none">
            Get it on
          </div>
          <div className="text-lg font-semibold leading-tight">Google Play</div>
        </div>
      </a>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 grid place-items-center neon-glow">
        <Egg className="w-5 h-5 text-white" />
      </div>
      <span className="font-display text-xl tracking-tight font-bold">HATCHUP</span>
    </div>
  );
}

function PhoneMockup() {
  const stats = [
    { label: "Happiness", value: 92, color: "from-pink-500 to-rose-500" },
    { label: "Energy", value: 78, color: "from-violet-500 to-fuchsia-500" },
    { label: "Hunger", value: 64, color: "from-amber-500 to-orange-500" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: -2 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto"
    >
      <div className="relative w-[280px] sm:w-[320px] h-[600px] rounded-[44px] bg-gradient-to-br from-zinc-900 to-zinc-950 border-[10px] border-zinc-800 shadow-2xl shadow-pink-500/20 overflow-hidden float-slow">
        {/* notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-20" />

        {/* screen */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a14] via-[#160a1f] to-[#0a0a14] p-5 pt-12 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-pink-400">Active Partner</p>
              <h3 className="font-display text-lg font-bold">Ember</h3>
            </div>
            <div className="rounded-full px-2 py-1 bg-pink-500/20 text-pink-300 text-xs font-semibold">
              Lv 14
            </div>
          </div>

          {/* creature */}
          <div className="relative aspect-square rounded-3xl bg-gradient-to-br from-pink-500/20 via-fuchsia-500/10 to-violet-600/20 border border-white/10 overflow-hidden grid place-items-center">
            <div className="absolute inset-0 grid-bg opacity-50" />
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="text-8xl drop-shadow-[0_0_20px_rgba(244,114,182,0.6)]"
            >
              🐉
            </motion.div>
            <div className="absolute top-3 right-3 flex items-center gap-1 text-xs bg-black/40 backdrop-blur rounded-full px-2 py-1 border border-white/10">
              <Star className="w-3 h-3 text-amber-300 fill-amber-300" /> Legendary
            </div>
          </div>

          {/* stats */}
          <div className="space-y-2">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">{s.label}</span>
                  <span className="text-white/90 font-semibold">{s.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.value}%` }}
                    transition={{ duration: 1.2, delay: 0.4 }}
                    className={`h-full bg-gradient-to-r ${s.color}`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* xp */}
          <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-white/70">XP to next evolution</span>
              <span className="text-pink-300 font-semibold">2,140 / 3,000</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "71%" }}
                transition={{ duration: 1.4, delay: 0.6 }}
                className="h-full bg-gradient-to-r from-pink-500 to-violet-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* floating chips */}
      <motion.div
        initial={{ opacity: 0, x: -20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="hidden md:flex absolute -left-10 top-24 card-glass rounded-2xl px-4 py-3 items-center gap-2"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 grid place-items-center">
          <Flame className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">Streak</div>
          <div className="font-semibold text-sm">12 days</div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="hidden md:flex absolute -right-12 bottom-32 card-glass rounded-2xl px-4 py-3 items-center gap-2"
      >
        <div className="w-9 h-9 rounded-xl bg-fuchsia-500/20 grid place-items-center">
          <Trophy className="w-5 h-5 text-fuchsia-300" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">City Rank</div>
          <div className="font-semibold text-sm">#7 of 1,420</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const features = [
    {
      icon: Egg,
      title: "Hatch & Evolve",
      body: "Open eggs to find creatures with randomized stats and rarity. Train them up and watch them evolve through dozens of branching paths.",
      color: "from-pink-500 to-rose-500",
    },
    {
      icon: HeartPulse,
      title: "Real-world Fitness",
      body: "Steps, workouts, and runs all power your creatures. Every move you make in the real world levels up your Pal in the game.",
      color: "from-violet-500 to-fuchsia-500",
    },
    {
      icon: Apple,
      title: "Smart Nutrition",
      body: "Log meals, hit macro targets, and earn streak rewards. Your Hatchling celebrates with you when you eat right.",
      color: "from-emerald-500 to-teal-500",
    },
    {
      icon: Trophy,
      title: "Compete & Climb",
      body: "Enter races, join tournaments, and climb city, country, and global leaderboards. Rise to the top 10 to unlock perks.",
      color: "from-amber-500 to-orange-500",
    },
    {
      icon: Users,
      title: "Clubs & Friends",
      body: "Join a club, find workout partners, and challenge friends. Group bonuses, live events, and shared rewards.",
      color: "from-cyan-500 to-blue-500",
    },
    {
      icon: Shield,
      title: "Family Safe",
      body: "Built for everyone. Privacy-first location, public-only meetups, anti-harassment filters, and parental controls.",
      color: "from-indigo-500 to-purple-500",
    },
  ];

  const steps = [
    {
      n: "01",
      title: "Hatch your first Pal",
      body: "Crack open an egg and meet your starter creature. Every Hatchling is unique.",
    },
    {
      n: "02",
      title: "Move in the real world",
      body: "Walk, run, lift, or log a meal. Every action feeds your Hatchling and grows your bond.",
    },
    {
      n: "03",
      title: "Evolve and compete",
      body: "Level up, evolve into rarer forms, race against friends, and climb the leaderboards.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--background))] text-white">
      {/* Navbar */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#how-it-works" className="hover:text-white">How it works</a>
          <a href="#safety" className="hover:text-white">Safety</a>
          <a href="/demo" className="text-pink-200 hover:text-white">Live demo</a>
          <a href="/support" className="hover:text-white">Support</a>
        </nav>
        <a
          href="/demo"
          className="hidden md:inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-sm font-medium"
        >
          Test the MVP <ChevronRight className="w-4 h-4" />
        </a>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="aurora" />
        <div className="absolute inset-0 grid-bg" />
        <div className="relative max-w-7xl mx-auto px-6 sm:px-8 pt-12 pb-24 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs uppercase tracking-wider border border-pink-400/30 bg-pink-500/10 text-pink-200 mb-6"
            >
              <Sparkles className="w-3.5 h-3.5" /> New season — Live now
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={1}
              className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
            >
              Your fitness, <br />
              <span className="neon-text">hatched.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={2}
              className="mt-6 text-lg sm:text-xl text-white/70 max-w-xl"
            >
              HATCHUP turns every step, workout, and meal into a creature-collecting
              adventure. Hatch your Pal, evolve together, and compete with friends —
              all in one playful, family-friendly universe.
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={3}
              className="mt-8"
              id="download"
            >
              <a
                href="/demo"
                className="mb-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-pink-500/25 transition-transform hover:-translate-y-0.5"
              >
                Live test the MVP <ChevronRight className="h-4 w-4" />
              </a>
              <StoreButtons />
              <p className="mt-3 text-xs text-white/50">
                Free to play. No ads. Premium unlocks customization, never advantages.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={4}
              className="mt-10 flex items-center gap-6 text-sm text-white/60"
            >
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-amber-300 fill-amber-300" />
                ))}
                <span className="ml-2 text-white/80 font-semibold">4.8</span>
              </div>
              <div className="h-4 w-px bg-white/15" />
              <span>100k+ workouts logged</span>
              <div className="hidden sm:block h-4 w-px bg-white/15" />
              <span className="hidden sm:inline">Family-friendly</span>
            </motion.div>
          </div>

          <div className="relative">
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mb-14">
            <p className="text-xs uppercase tracking-widest text-pink-300 mb-3">
              Everything in one app
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
              A whole world to <span className="neon-text">play in</span>
            </h2>
            <p className="mt-4 text-white/70 text-lg">
              Six core systems that turn healthy habits into something you actually
              look forward to.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-60px" }}
                  custom={i}
                  className="card-glass rounded-3xl p-6 hover:translate-y-[-2px] transition-transform"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} grid place-items-center mb-5 shadow-lg`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">{f.title}</h3>
                  <p className="text-white/65 text-sm leading-relaxed">{f.body}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative py-24">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative max-w-7xl mx-auto px-6 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs uppercase tracking-widest text-pink-300 mb-3">
              How it works
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
              From egg to evolution in <span className="neon-text">three steps</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                className="card-glass rounded-3xl p-8 relative overflow-hidden"
              >
                <div className="absolute top-4 right-4 font-display text-6xl font-bold text-white/[0.06]">
                  {s.n}
                </div>
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-400/30 text-pink-300 grid place-items-center mb-5">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">{s.title}</h3>
                  <p className="text-white/65 text-sm">{s.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="relative py-24">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="card-glass rounded-3xl p-8 sm:p-12 grid md:grid-cols-[1fr_auto] gap-8 items-center"
          >
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs uppercase tracking-wider border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 mb-5">
                <Shield className="w-3.5 h-3.5" /> Family-friendly by design
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">
                A safe, trusted community
              </h2>
              <p className="text-white/70">
                Privacy-first location (you choose exact, neighborhood, city, or
                hidden). Public-location-only meetups. Block and report on every
                profile. Anti-harassment filters in chat. Parental controls for
                minors. Real safety — not an afterthought.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 min-w-[240px]">
              {[
                { icon: Shield, label: "Privacy controls" },
                { icon: Users, label: "Block & Report" },
                { icon: HeartPulse, label: "Minor protections" },
                { icon: Sparkles, label: "Verified profiles" },
              ].map((b) => {
                const Icon = b.icon;
                return (
                  <div
                    key={b.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center"
                  >
                    <Icon className="w-5 h-5 mx-auto mb-2 text-emerald-300" />
                    <div className="text-xs font-medium text-white/80">{b.label}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24">
        <div className="aurora opacity-60" />
        <div className="relative max-w-4xl mx-auto px-6 sm:px-8 text-center">
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="font-display text-4xl sm:text-6xl font-bold tracking-tight"
          >
            Ready to <span className="neon-text">hatch yours?</span>
          </motion.h2>
          <p className="mt-5 text-lg text-white/70 max-w-xl mx-auto">
            Download HATCHUP free on iOS and Android. Your first egg is waiting.
          </p>
          <div className="mt-8 flex justify-center">
            <StoreButtons />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-white/50">
            <Smartphone className="w-3.5 h-3.5" /> iOS 15+ · Android 9+
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10 mt-12">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-10 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between text-sm text-white/55">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-white/30">·</span>
            <span>© {new Date().getFullYear()} HATCHUP</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="/demo" className="hover:text-white">Live demo</a>
            <a href="/support" className="hover:text-white">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
