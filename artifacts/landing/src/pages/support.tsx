import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  Shield,
  Egg,
  Activity,
  BookOpen,
  ArrowLeft,
  Trophy,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

interface FAQ {
  q: string;
  a: string;
}

interface Category {
  icon: React.ElementType;
  label: string;
  color: string;
  faqs: FAQ[];
}

const CATEGORIES: Category[] = [
  {
    icon: Egg,
    label: "Pals & Gameplay",
    color: "text-emerald-400",
    faqs: [
      {
        q: "What are Pals?",
        a: "Pals are collectible creature companions you hatch from eggs. Each Pal can have an element, rarity, level, bond, stats, training progress, and memories.",
      },
      {
        q: "How do Pals grow?",
        a: "Pals gain progress from movement rewards and training. The current build supports Baby, Teen, and Final visual stages so players can see their companions grow over time.",
      },
      {
        q: "What is the core loop?",
        a: "Move your body, sync progress, hatch Pals, grow your collection, and return tomorrow to keep building momentum.",
      },
    ],
  },
  {
    icon: Activity,
    label: "Health Sync",
    color: "text-emerald-400",
    faqs: [
      {
        q: "Which health data does HatchUp use?",
        a: "The mobile build is designed around read-only movement data: steps, distance, workouts, and active energy. This activity powers egg progress, Pal XP, rewards, and streaks.",
      },
      {
        q: "Does HatchUp write data back to health apps?",
        a: "No. HatchUp is designed as read-only for Apple Health and Health Connect in the current mobile beta.",
      },
      {
        q: "My steps are not syncing. What should I check?",
        a: "Open the app's Trust & Data or health connection area and confirm health permissions are enabled. On iOS, make sure Steps, Workouts, and Active Energy read permissions are allowed.",
      },
    ],
  },
  {
    icon: BookOpen,
    label: "Collection",
    color: "text-amber-400",
    faqs: [
      {
        q: "What is the Collection book?",
        a: "The Collection book tracks discovered and missing Pals across Leaf, Ember, Tide, and Storm elements and rarity tiers.",
      },
      {
        q: "What are rarity tiers?",
        a: "The current beta uses common, uncommon, rare, and epic rarity tiers for eggs and Pals.",
      },
      {
        q: "Can I choose my starter egg?",
        a: "The current onboarding direction lets new players begin by choosing a starter egg type before discovering more eggs through milestones and daily progress.",
      },
    ],
  },
  {
    icon: Trophy,
    label: "Ranks & Profile",
    color: "text-blue-400",
    faqs: [
      {
        q: "How do weekly ranks work?",
        a: "Ranks are optional. Players can choose to share a public ranking name and weekly score while keeping private health details off the board.",
      },
      {
        q: "What can I show on my profile?",
        a: "The profile area includes a trainer card, selected profile Pal, collection progress, milestones, badges, and privacy controls.",
      },
      {
        q: "Can I stay private?",
        a: "Yes. Ranking sharing is opt-in, and the app keeps Trust & Data controls visible so players understand what is shared.",
      },
    ],
  },
  {
    icon: Shield,
    label: "Trust & Privacy",
    color: "text-purple-400",
    faqs: [
      {
        q: "Do you sell health data?",
        a: "No. HatchUp's privacy promise is that movement data is used to power gameplay, not sold or used for ads.",
      },
      {
        q: "What data is public?",
        a: "Only the public ranking name and score are shared when a player chooses to opt into weekly ranks. Private health details stay off rankings.",
      },
      {
        q: "How do I contact support?",
        a: "Email support@hatchup.app for account, privacy, beta access, or app feedback questions.",
      },
    ],
  },
];

function FAQItem({ faq, index }: { faq: FAQ; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      custom={index}
      className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-medium text-white/90">{faq.q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-white/60 leading-relaxed border-t border-white/10 pt-4">
          {faq.a}
        </div>
      )}
    </motion.div>
  );
}

export default function SupportPage() {
  const [activeCategory, setActiveCategory] = useState(0);
  const cat = CATEGORIES[activeCategory];
  const Icon = cat.icon;

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-pink-500/30">
      {/* Subtle gradient orb */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[40%] w-[700px] h-[700px] rounded-full bg-pink-600/10 blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 h-16 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to HATCHUP
          </a>
          <span className="text-white/20">|</span>
          <span className="font-semibold text-white text-sm">Help & Support</span>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-16 space-y-16">

        {/* Hero */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            How can we <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-red-400">help you?</span>
          </h1>
          <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">
            Browse our FAQs below, or reach out directly — we're here for you.
          </p>
          <a
            href="mailto:support@hatchup.app"
            className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-sm font-medium transition-all"
          >
            <Mail className="w-4 h-4 text-pink-400" />
            support@hatchup.app
          </a>
        </motion.div>

        {/* Category picker */}
        <div>
          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-xs uppercase tracking-widest text-white/40 mb-4 text-center"
          >
            Browse by topic
          </motion.p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {CATEGORIES.map((c, i) => {
              const CIcon = c.icon;
              const active = i === activeCategory;
              return (
                <motion.button
                  key={c.label}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i}
                  onClick={() => setActiveCategory(i)}
                  className={`flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border text-center text-xs font-medium transition-all ${
                    active
                      ? "bg-white/10 border-white/25 text-white"
                      : "bg-white/[0.03] border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                  }`}
                >
                  <CIcon className={`w-5 h-5 ${active ? c.color : ""}`} />
                  {c.label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* FAQ section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Icon className={`w-6 h-6 ${cat.color}`} />
            <h2 className="text-xl font-bold">{cat.label}</h2>
          </div>
          <div className="space-y-3">
            {cat.faqs.map((faq, i) => (
              <FAQItem key={faq.q} faq={faq} index={i} />
            ))}
          </div>
        </div>

        {/* Trust note */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 flex gap-4"
        >
          <Shield className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300 mb-1">Health-data trust</p>
            <p className="text-sm text-white/60 leading-relaxed">
              HatchUp reads movement data only to power gameplay. Health details
              are not sold or used for ads, and weekly ranking sharing is optional.
            </p>
          </div>
        </motion.div>

        {/* Contact card */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center"
        >
          <Mail className="w-10 h-10 text-pink-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Still need help?</h3>
          <p className="text-white/60 text-sm mb-6 max-w-md mx-auto">
            Our support team is available Monday–Friday. We aim to respond within 24 hours.
          </p>
          <a
            href="mailto:support@hatchup.app"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-400 hover:to-red-400 font-semibold text-sm transition-all shadow-lg"
          >
            <Mail className="w-4 h-4" />
            Email Support
          </a>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-white/30 pb-4">
          © 2026 HATCHUP · <a href="mailto:support@hatchup.app" className="hover:text-white/60 transition-colors">support@hatchup.app</a>
        </p>
      </div>
    </div>
  );
}
