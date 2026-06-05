import { motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  ChevronRight,
  Egg,
  Flame,
  HeartPulse,
  Leaf,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Waves,
  Zap,
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
    <div className="flex flex-col gap-3 sm:flex-row">
      <span
        aria-label="App Store beta access coming soon"
        className={`flex items-center gap-3 ${pad} rounded-2xl border border-[#EADCC8] bg-white text-[#20312A] shadow-lg shadow-[#0B6F5C]/10`}
      >
        <FaApple className="h-7 w-7" />
        <div className="text-left">
          <div className="text-[10px] uppercase leading-none tracking-wider text-[#718078]">
            Beta access
          </div>
          <div className="text-lg font-semibold leading-tight">iOS coming soon</div>
        </div>
      </span>
      <span
        aria-label="Google Play beta access coming soon"
        className={`flex items-center gap-3 ${pad} rounded-2xl border border-[#EADCC8] bg-white text-[#20312A] shadow-lg shadow-[#0B6F5C]/10`}
      >
        <FaGooglePlay className="h-6 w-6" />
        <div className="text-left">
          <div className="text-[10px] uppercase leading-none tracking-wider text-[#718078]">
            Beta access
          </div>
          <div className="text-lg font-semibold leading-tight">Android coming soon</div>
        </div>
      </span>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#0B6F5C] to-[#79A66A] shadow-lg shadow-[#0B6F5C]/20">
        <Egg className="h-5 w-5 text-white" />
      </div>
      <span className="font-display text-xl font-bold tracking-tight text-[#20312A]">
        HATCHUP
      </span>
    </div>
  );
}

function MiniProgress({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold text-[#718078]">{label}</span>
        <span className="font-black text-[#0B6F5C]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#DDF4EC]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.2, delay: 0.35 }}
          className="h-full rounded-full bg-gradient-to-r from-[#0B6F5C] to-[#E8B84A]"
        />
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: -2 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto"
    >
      <div className="float-slow relative h-[610px] w-[280px] overflow-hidden rounded-[44px] border-[10px] border-[#20312A] bg-[#20312A] shadow-2xl shadow-[#0B6F5C]/25 sm:w-[320px]">
        <div className="absolute left-1/2 top-2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-[#111B17]" />
        <div className="absolute inset-0 flex flex-col gap-4 bg-[#FBF4E6] p-5 pt-12 text-[#20312A]">
          <div className="rounded-3xl border border-[#EADCC8] bg-white p-4 shadow-lg shadow-[#0B6F5C]/10">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0B6F5C]">
              Today's Journey
            </p>
            <h3 className="mt-1 font-display text-2xl font-black">Grow Ember</h3>
            <p className="mt-1 text-xs leading-5 text-[#718078]">
              Move, sync, hatch, and return tomorrow.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-[#EADCC8] bg-[#FFF3D8] p-4">
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#E8B84A]/25 blur-2xl" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0B6F5C]">
                  Active Pal
                </p>
                <h4 className="mt-1 text-lg font-black">Ember Sprout</h4>
                <p className="text-xs font-bold text-[#FF9B5F]">Rare Ember | Baby</p>
              </div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="grid h-24 w-24 place-items-center rounded-[28px] border border-[#EADCC8] bg-white text-5xl shadow-inner"
              >
                <Flame className="h-12 w-12 fill-[#FF9B5F] text-[#FF9B5F]" />
              </motion.div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#0B6F5C]/30 bg-[#DDF4EC] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0B6F5C]">
              Next Action
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-black">Sync movement</h4>
                <p className="text-xs leading-5 text-[#4F6259]">
                  Convert today's activity into egg progress and Pal XP.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-[#0B6F5C]" />
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-[#EADCC8] bg-white p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-black">Today Progress</h4>
              <span className="rounded-full bg-[#FFF3D8] px-2 py-1 text-[10px] font-black text-[#8A641D]">
                +42 XP
              </span>
            </div>
            <MiniProgress label="Steps" progress={68} value="6.8k / 10k" />
            <MiniProgress label="Egg progress" progress={82} value="82%" />
            <MiniProgress label="Collection" progress={31} value="5 / 16" />
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, x: -20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="absolute -left-10 top-24 hidden items-center gap-2 rounded-2xl border border-[#EADCC8] bg-white px-4 py-3 shadow-xl shadow-[#0B6F5C]/10 md:flex"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFF3D8]">
          <Sparkles className="h-5 w-5 text-[#E8B84A]" />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-[#718078]">
            Streak
          </div>
          <div className="text-sm font-black text-[#20312A]">Return tomorrow</div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="absolute -right-12 bottom-32 hidden items-center gap-2 rounded-2xl border border-[#EADCC8] bg-white px-4 py-3 shadow-xl shadow-[#0B6F5C]/10 md:flex"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#DDF4EC]">
          <BookOpen className="h-5 w-5 text-[#0B6F5C]" />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-[#718078]">
            Collection
          </div>
          <div className="text-sm font-black text-[#20312A]">Leaf, Ember, Tide, Storm</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const features = [
    {
      icon: Activity,
      title: "Movement-powered hatching",
      body: "Steps, distance, workouts, and active energy push your eggs closer to hatching.",
      color: "bg-[#DDF4EC] text-[#0B6F5C]",
    },
    {
      icon: HeartPulse,
      title: "Hatch and grow Pals",
      body: "Hatch elemental Pals, train your active companion, build bond, and unlock Baby, Teen, and Final forms.",
      color: "bg-[#FFF3D8] text-[#B16F1A]",
    },
    {
      icon: BookOpen,
      title: "Collection book",
      body: "Discover Leaf, Ember, Tide, and Storm Pals across rarity tiers and track what is still missing.",
      color: "bg-[#EAF7D9] text-[#5E8D4C]",
    },
    {
      icon: Sparkles,
      title: "Daily journey",
      body: "Home gives you one clear next action so today’s movement turns into progress, rewards, and a reason to return tomorrow.",
      color: "bg-[#FFF3D8] text-[#8A641D]",
    },
    {
      icon: Trophy,
      title: "Optional weekly ranks",
      body: "Compare public weekly scores only when you choose. Private health details stay off rankings.",
      color: "bg-[#F0ECFF] text-[#7F67D8]",
    },
    {
      icon: ShieldCheck,
      title: "Trust and data controls",
      body: "HatchUp explains what health data is used, what is private, and how ranking sharing works.",
      color: "bg-[#DDF4EC] text-[#064E43]",
    },
  ];

  const steps = [
    {
      icon: Activity,
      n: "01",
      title: "Move your body",
      body: "Walk, work out, or complete daily activity.",
    },
    {
      icon: Zap,
      n: "02",
      title: "Sync progress",
      body: "Movement becomes egg progress, Pal XP, streak progress, and rewards.",
    },
    {
      icon: Egg,
      n: "03",
      title: "Hatch and grow",
      body: "Hatch Pals, train your active companion, and expand your collection.",
    },
    {
      icon: Sparkles,
      n: "04",
      title: "Return tomorrow",
      body: "Keep your streak alive and continue growing your Pal.",
    },
  ];

  const trustItems = [
    { icon: ShieldCheck, label: "Read-only health access" },
    { icon: Activity, label: "Movement data powers gameplay" },
    { icon: Trophy, label: "Ranks are optional" },
    { icon: Smartphone, label: "Support links stay accessible" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FBF4E6] text-[#20312A]">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#718078] md:flex">
          <a href="#features" className="hover:text-[#0B6F5C]">Features</a>
          <a href="#how-it-works" className="hover:text-[#0B6F5C]">How it works</a>
          <a href="#trust" className="hover:text-[#0B6F5C]">Trust</a>
          <a href="/support" className="hover:text-[#0B6F5C]">Support</a>
        </nav>
        <a
          href="/support"
          className="hidden items-center gap-1 rounded-full border border-[#0B6F5C]/20 bg-white px-4 py-2 text-sm font-black text-[#0B6F5C] shadow-sm transition hover:bg-[#DDF4EC] md:inline-flex"
        >
          Get beta updates <ChevronRight className="h-4 w-4" />
        </a>
      </header>

      <section className="relative">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-[#E8B84A]/25 blur-3xl" />
        <div className="absolute -right-32 top-40 h-[32rem] w-[32rem] rounded-full bg-[#DDF4EC] blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-12 sm:px-8 lg:grid-cols-2 lg:py-24">
          <div>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E8B84A]/40 bg-[#FFF3D8] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#8A641D]"
            >
              <Sparkles className="h-3.5 w-3.5" /> Advanced beta in progress
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={1}
              className="font-display text-5xl font-black leading-[1.05] tracking-tight text-[#20312A] sm:text-6xl lg:text-7xl"
            >
              Move your body.
              <br />
              <span className="text-[#0B6F5C]">Hatch your Pal.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={2}
              className="mt-6 max-w-xl text-lg leading-8 text-[#4F6259] sm:text-xl"
            >
              HatchUp turns real-world movement into egg progress, Pal growth,
              collection goals, and daily rewards. Sync your activity, hatch
              creatures, grow your team, and return tomorrow.
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={3}
              className="mt-8"
              id="download"
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/support"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B6F5C] px-6 py-4 text-sm font-black text-white shadow-lg shadow-[#0B6F5C]/25 transition-transform hover:-translate-y-0.5"
                >
                  Get beta updates <ChevronRight className="h-4 w-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#EADCC8] bg-white px-6 py-4 text-sm font-black text-[#0B6F5C] transition hover:bg-[#DDF4EC]"
                >
                  Learn how it works
                </a>
              </div>
              <StoreButtons />
              <p className="mt-3 text-xs font-semibold text-[#718078]">
                Mobile beta access is rolling out through test builds first. Store
                links will be added when public listings are ready.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={4}
              className="mt-10 grid max-w-xl gap-3 text-sm sm:grid-cols-3"
            >
              {[
                "Health sync",
                "Pal evolution",
                "Daily rewards",
              ].map((item) => (
                <div
                  className="rounded-2xl border border-[#EADCC8] bg-white px-4 py-3 font-black text-[#0B6F5C] shadow-sm"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </motion.div>
          </div>

          <div className="relative">
            <PhoneMockup />
          </div>
        </div>
      </section>

      <section id="features" className="relative py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <div className="mb-14 max-w-2xl">
            <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#0B6F5C]">
              Current mobile app
            </p>
            <h2 className="font-display text-4xl font-black tracking-tight text-[#20312A] sm:text-5xl">
              A cozy creature loop powered by real movement.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#718078]">
              Move your body → hatch Pals → grow your collection → return tomorrow.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-60px" }}
                  custom={i}
                  className="rounded-3xl border border-[#EADCC8] bg-white p-6 shadow-lg shadow-[#0B6F5C]/5 transition-transform hover:-translate-y-0.5"
                >
                  <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${feature.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-black text-[#20312A]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#718078]">
                    {feature.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative py-24">
        <div className="absolute inset-x-0 top-20 h-64 bg-[#FFF3D8]" />
        <div className="relative mx-auto max-w-7xl px-6 sm:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#8A641D]">
              How it works
            </p>
            <h2 className="font-display text-4xl font-black tracking-tight text-[#20312A] sm:text-5xl">
              The daily loop is simple on purpose.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.n}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i}
                  className="relative overflow-hidden rounded-3xl border border-[#EADCC8] bg-white p-6 shadow-lg shadow-[#0B6F5C]/5"
                >
                  <div className="absolute right-4 top-4 font-display text-5xl font-black text-[#EADCC8]/60">
                    {step.n}
                  </div>
                  <div className="relative">
                    <div className="mb-5 grid h-10 w-10 place-items-center rounded-xl bg-[#DDF4EC] text-[#0B6F5C]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-xl font-black text-[#20312A]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#718078]">
                      {step.body}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative py-20">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <div className="rounded-[2rem] border border-[#EADCC8] bg-white p-8 shadow-xl shadow-[#0B6F5C]/10 sm:p-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#0B6F5C]">
                  Creature collection
                </p>
                <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
                  Leaf, Ember, Tide, and Storm Pals grow from Baby to Final forms.
                </h2>
                <p className="mt-4 text-lg leading-8 text-[#718078]">
                  Each Pal has element, rarity, level, bond, stats, training,
                  and memories. The Collection book helps players see what they
                  have discovered and what is still waiting to hatch.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Leaf, label: "Leaf", color: "bg-[#EAF7D9] text-[#79A66A]" },
                  { icon: Flame, label: "Ember", color: "bg-[#FFF0E6] text-[#FF9B5F]" },
                  { icon: Waves, label: "Tide", color: "bg-[#E5F8FE] text-[#2BA4C7]" },
                  { icon: Zap, label: "Storm", color: "bg-[#F0ECFF] text-[#8B73E6]" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      className="rounded-3xl border border-[#EADCC8] bg-[#FBF4E6] p-5"
                      key={item.label}
                    >
                      <div className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl ${item.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <p className="font-display text-xl font-black">{item.label}</p>
                      <p className="mt-1 text-xs font-semibold text-[#718078]">
                        Common → Epic rarity tiers
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="relative py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid items-center gap-8 rounded-[2rem] border border-[#0B6F5C]/20 bg-[#DDF4EC] p-8 sm:p-12 md:grid-cols-[1fr_auto]"
          >
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0B6F5C]/20 bg-white px-3 py-1 text-xs font-black uppercase tracking-wider text-[#0B6F5C]">
                <ShieldCheck className="h-3.5 w-3.5" /> Health-data trust
              </div>
              <h2 className="font-display text-3xl font-black tracking-tight text-[#20312A] sm:text-4xl">
                Private movement data should stay understandable.
              </h2>
              <p className="mt-4 leading-8 text-[#4F6259]">
                HatchUp reads movement data only to power gameplay. Health details
                are not sold or used for ads. Weekly ranks are optional, and
                players choose whether to share a public ranking name and score.
                Support and privacy links stay accessible from the app and site.
              </p>
            </div>
            <div className="grid min-w-[240px] grid-cols-2 gap-3">
              {trustItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-[#0B6F5C]/15 bg-white p-4 text-center"
                  >
                    <Icon className="mx-auto mb-2 h-5 w-5 text-[#0B6F5C]" />
                    <div className="text-xs font-black text-[#20312A]">{item.label}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative py-24">
        <div className="absolute inset-x-0 bottom-0 h-72 bg-[#FFF3D8]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center sm:px-8">
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="font-display text-4xl font-black tracking-tight text-[#20312A] sm:text-6xl"
          >
            Follow the beta as HatchUp gets ready for launch.
          </motion.h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#718078]">
            The mobile app is being shaped around a tighter daily creature loop,
            clearer onboarding, richer collection goals, and privacy-first health
            sync.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href="/support"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B6F5C] px-6 py-4 text-sm font-black text-white shadow-lg shadow-[#0B6F5C]/25 transition-transform hover:-translate-y-0.5"
            >
              Contact support <ChevronRight className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[#718078]">
            <Smartphone className="h-3.5 w-3.5" /> iOS and Android beta access coming soon
          </div>
        </div>
      </section>

      <footer className="relative border-t border-[#EADCC8] bg-[#FBF4E6]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 text-sm text-[#718078] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-[#B9AA96]">·</span>
            <span>© {new Date().getFullYear()} HATCHUP</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="/support" className="hover:text-[#0B6F5C]">Privacy</a>
            <a href="/support" className="hover:text-[#0B6F5C]">Terms</a>
            <a href="/support" className="hover:text-[#0B6F5C]">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
