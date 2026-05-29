import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  Shield,
  Egg,
  Activity,
  CreditCard,
  Users,
  ArrowLeft,
  MessageCircle,
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
    label: "Hatchlings & Gameplay",
    color: "text-pink-400",
    faqs: [
      {
        q: "What are Hatchlings?",
        a: "Hatchlings are digital creatures you earn by staying active. Complete workouts, hit step goals, and log meals to earn eggs — then hatch them to get randomized creatures with unique stats, abilities, and rarity.",
      },
      {
        q: "How do creatures evolve?",
        a: "Your Hatchlings gain XP every time you exercise. Reach milestone levels to trigger evolutions. Check the Evolutions page in the app for all possible evolution paths.",
      },
      {
        q: "How many Hatchlings can I keep?",
        a: "Free accounts support up to 6 Hatchlings. Premium members get unlimited storage.",
      },
    ],
  },
  {
    icon: Activity,
    label: "Fitness Tracking",
    color: "text-emerald-400",
    faqs: [
      {
        q: "Which health platforms does HATCHUP support?",
        a: "HATCHUP connects with Apple Health, Google Fit, Fitbit, Garmin, and Oura. Go to Health Settings in the app to link your preferred platform.",
      },
      {
        q: "How is XP calculated from workouts?",
        a: "XP is based on workout duration, intensity, and verification level. Camera-verified reps earn a 3× XP bonus. Premium members earn 2× XP on all meal logs.",
      },
      {
        q: "My steps aren't syncing — what do I do?",
        a: "Open Health Settings and re-check your connected platform. On iOS, confirm HATCHUP has Steps and Workout read permissions in the Health app. Sync can take up to 30 minutes.",
      },
    ],
  },
  {
    icon: CreditCard,
    label: "Premium & Billing",
    color: "text-amber-400",
    faqs: [
      {
        q: "Is HATCHUP free?",
        a: "Yes — HATCHUP is free to download and play. All new accounts include a 7-day free Premium trial with no credit card required.",
      },
      {
        q: "What's included in Premium?",
        a: "Premium unlocks 2× XP on meals, unlimited Hatchlings, unlimited AI Coach messages, all leaderboard scopes, AI Food Scanner, AI Body Fat Scanner, premium cosmetics, and more.",
      },
      {
        q: "How do I cancel my subscription?",
        a: "Go to the Subscription page inside the app and tap 'Manage Subscription'. You can cancel, change plans, or update billing via the Stripe portal at any time.",
      },
      {
        q: "What is the Top-10 City exemption?",
        a: "Top 10 players in any city for XP, steps, workouts, battle wins, streaks, or artifacts automatically receive free Premium. This is recalculated every 24 hours.",
      },
    ],
  },
  {
    icon: Users,
    label: "Community & Social",
    color: "text-blue-400",
    faqs: [
      {
        q: "How do clubs work?",
        a: "Clubs let you team up with other players, compete in group leaderboards, and share achievements. Each player belongs to one club at a time. Browse public clubs or create your own.",
      },
      {
        q: "How do I report or block someone?",
        a: "Tap the three-dot (⋯) menu on any player's profile, post, or message. Choose 'Report' to flag content for moderation or 'Block' to hide them from your experience entirely.",
      },
      {
        q: "Are chats moderated?",
        a: "Yes. All group messages are automatically scanned. Flagged content is hidden and replaced with 'Message removed'. Repeated violations can result in suspension.",
      },
    ],
  },
  {
    icon: Shield,
    label: "Safety & Privacy",
    color: "text-purple-400",
    faqs: [
      {
        q: "How do you protect my location?",
        a: "GPS data is AES-256 encrypted and never shared without your consent. You control your visibility in Privacy Settings — Exact, Neighborhood, City (default), or Hidden.",
      },
      {
        q: "Is HATCHUP safe for kids?",
        a: "HATCHUP is family-friendly. Minor accounts automatically enforce City-level location visibility and require workout partner approval. Parent accounts can manage these settings.",
      },
      {
        q: "Tips for meeting other users safely?",
        a: "Always meet workout partners in public locations — gyms, parks, or recreation centers. Never share your home address. Report any suspicious behavior immediately using the in-app report tool.",
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

        {/* Safety note */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 flex gap-4"
        >
          <Shield className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300 mb-1">Safety reminder</p>
            <p className="text-sm text-white/60 leading-relaxed">
              Always meet workout partners and event participants in public locations — gyms, parks, or recreation centers.
              Never share your home address. Report suspicious behavior immediately using the in-app report tool.
              HatchUp is a safe, trusted, and family-friendly community.
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
          <MessageCircle className="w-10 h-10 text-pink-400 mx-auto mb-4" />
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
