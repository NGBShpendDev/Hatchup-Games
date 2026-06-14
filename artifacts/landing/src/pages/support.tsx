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
    color: "text-[var(--hatchup-primary)]",
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
    color: "text-[var(--hatchup-leaf)]",
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
    color: "text-[var(--hatchup-progress)]",
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
    color: "text-[var(--hatchup-tide)]",
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
    color: "text-[var(--hatchup-highlight)]",
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
      className="overflow-hidden rounded-2xl border border-[var(--hatchup-border)] bg-[var(--hatchup-card)] shadow-sm"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--hatchup-secondary)]"
      >
        <span className="text-sm font-semibold text-[var(--hatchup-text)]">{faq.q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--hatchup-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--hatchup-muted)]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--hatchup-border)] px-5 pb-5 pt-4 text-sm leading-relaxed text-[var(--hatchup-muted)]">
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
    <div className="min-h-screen bg-[var(--hatchup-bg)] font-sans text-[var(--hatchup-text)] selection:bg-[var(--hatchup-progress)]/40">
      {/* Subtle gradient orb */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute left-[40%] top-[-20%] h-[700px] w-[700px] rounded-full bg-[var(--hatchup-highlight)]/15 blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 border-b border-[var(--hatchup-border)] bg-[var(--hatchup-card)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-6 sm:px-8">
          <a
            href="/"
            className="flex items-center gap-2 text-sm text-[var(--hatchup-muted)] transition-colors hover:text-[var(--hatchup-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to HATCHUP
          </a>
          <span className="text-[var(--hatchup-disabled)]">|</span>
          <span className="text-sm font-semibold text-[var(--hatchup-text)]">Help & Support</span>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl space-y-16 px-6 py-16 sm:px-8">

        {/* Hero */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            How can we <span className="bg-gradient-to-r from-[var(--hatchup-primary)] via-[var(--hatchup-highlight)] to-[var(--hatchup-progress)] bg-clip-text text-transparent">help you?</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--hatchup-muted)]">
            Browse our FAQs below, or reach out directly — we're here for you.
          </p>
          <a
            href="mailto:support@hatchup.app"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-[var(--hatchup-border)] bg-[var(--hatchup-card)] px-5 py-3 text-sm font-bold text-[var(--hatchup-primary)] transition-all hover:bg-[var(--hatchup-secondary)]"
          >
            <Mail className="h-4 w-4 text-[var(--hatchup-highlight)]" />
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
            className="mb-4 text-center text-xs uppercase tracking-widest text-[var(--hatchup-muted)]"
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
                  className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center text-xs font-bold transition-all ${
                    active
                      ? "border-[var(--hatchup-primary)]/25 bg-[var(--hatchup-active-nav)] text-[var(--hatchup-primary)]"
                      : "border-[var(--hatchup-border)] bg-[var(--hatchup-card)] text-[var(--hatchup-muted)] hover:bg-[var(--hatchup-secondary)] hover:text-[var(--hatchup-primary)]"
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
          className="flex gap-4 rounded-2xl border border-[var(--hatchup-leaf)]/30 bg-[var(--hatchup-secondary)] p-6"
        >
          <Shield className="mt-0.5 h-6 w-6 shrink-0 text-[var(--hatchup-leaf)]" />
          <div>
            <p className="mb-1 font-semibold text-[var(--hatchup-primary)]">Health-data trust</p>
            <p className="text-sm leading-relaxed text-[var(--hatchup-muted)]">
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
          className="rounded-2xl border border-[var(--hatchup-border)] bg-[var(--hatchup-card)] p-8 text-center shadow-lg shadow-[#12201F]/5"
        >
          <Mail className="mx-auto mb-4 h-10 w-10 text-[var(--hatchup-highlight)]" />
          <h3 className="text-xl font-bold mb-2">Still need help?</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-[var(--hatchup-muted)]">
            Our support team is available Monday–Friday. We aim to respond within 24 hours.
          </p>
          <a
            href="mailto:support@hatchup.app"
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--hatchup-primary)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#004F46]/20 transition-all hover:bg-[var(--hatchup-primary-deep)]"
          >
            <Mail className="h-4 w-4" />
            Email Support
          </a>
        </motion.div>

        {/* Footer */}
        <p className="pb-4 text-center text-xs text-[var(--hatchup-muted)]">
          © 2026 HATCHUP · <a href="mailto:support@hatchup.app" className="transition-colors hover:text-[var(--hatchup-primary)]">support@hatchup.app</a>
        </p>
      </div>
    </div>
  );
}
