import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, ArrowLeft, Mail, MessageCircle, Shield, HelpCircle, CreditCard, Egg, Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
        q: "How do I hatch a new creature?",
        a: "Go to the Hatch page from the bottom navigation. You'll earn eggs by completing workouts, hitting step goals, and logging meals. Tap an egg to hatch it and get a randomized Hatchling with unique stats and rarity.",
      },
      {
        q: "How many Hatchlings can I have?",
        a: "Free accounts can hold up to 6 Hatchlings. Premium members get unlimited storage. You can manage your roster on the Hatchlings page.",
      },
      {
        q: "How do evolutions work?",
        a: "Hatchlings evolve by gaining XP from your workouts and reaching milestone levels. Check the Evolutions page to see all possible evolution paths for your creatures.",
      },
      {
        q: "What is an Active Pal?",
        a: "Your Active Pal is the Hatchling bonded to your current workout session. Set one from the My Pal page. It earns bonus XP whenever you log fitness activity.",
      },
    ],
  },
  {
    icon: Activity,
    label: "Fitness & Tracking",
    color: "text-emerald-400",
    faqs: [
      {
        q: "How do I log a workout?",
        a: "Tap the training section on the home screen, or navigate to Training. You can log manual workouts, use the rep counter, or connect a health platform like Apple Health, Google Fit, Fitbit, Garmin, or Oura for automatic sync.",
      },
      {
        q: "Why aren't my steps syncing?",
        a: "Go to Health Settings and confirm your health provider is connected. On iOS, open the Health app and verify HATCHUP has permission to read Steps and Workouts. It may take up to 30 minutes for a sync to appear.",
      },
      {
        q: "What is the rep counter?",
        a: "The rep counter uses your phone's camera and AI to detect and count exercise reps in real time. Camera-verified reps earn a 3× XP bonus. Access it from the home screen's Train section.",
      },
      {
        q: "Why was my fitness data flagged?",
        a: "HATCHUP uses anti-cheat validation to keep leaderboards fair. Very high step counts, unrealistic GPS speeds, or implausible workout durations may be flagged. If you believe this is an error, contact support.",
      },
    ],
  },
  {
    icon: CreditCard,
    label: "Premium & Billing",
    color: "text-amber-400",
    faqs: [
      {
        q: "What does Premium include?",
        a: "Premium unlocks 2× meal and workout XP, unlimited Hatchlings, unlimited AI Coach messages, unlimited battle entries, all leaderboard scopes (state, national, global), AI Food Scanner, AI Body Fat Scanner, premium cosmetics, and 12 customization slots.",
      },
      {
        q: "How does the 7-day free trial work?",
        a: "All new accounts start with a 7-day Premium trial automatically — no credit card required. After the trial ends you move to the free tier unless you subscribe.",
      },
      {
        q: "How do I manage or cancel my subscription?",
        a: "Go to your Subscription page (accessible from the home menu) and tap 'Manage Subscription'. This opens the Stripe customer portal where you can update payment, change plans, or cancel at any time.",
      },
      {
        q: "What is the Top-10 City exemption?",
        a: "If you rank in the top 10 players in your city for any of 6 fitness metrics — XP, steps, workouts, battle wins, streaks, or artifacts — you automatically receive free Premium. This resets every 24 hours.",
      },
    ],
  },
  {
    icon: Users,
    label: "Clubs & Social",
    color: "text-blue-400",
    faqs: [
      {
        q: "How do I join or create a club?",
        a: "Navigate to the Club page. You can browse public clubs and tap Join, or create your own club. Each player can belong to one club at a time.",
      },
      {
        q: "How do I find other players?",
        a: "Use the Explore or Find Players section to search by username. You can follow players, send workout partner requests, and view their public profiles.",
      },
      {
        q: "How do I block or report someone?",
        a: "Tap the three-dot (⋯) menu on any player's profile card, post, or group message. Select 'Report' to flag content for moderation or 'Block' to hide them from your feed entirely.",
      },
      {
        q: "Are group chats moderated?",
        a: "Yes. All group messages are scanned for inappropriate content. Flagged messages are hidden and replaced with a 'Message removed' placeholder. Repeated violations can result in account suspension.",
      },
    ],
  },
  {
    icon: Shield,
    label: "Safety & Privacy",
    color: "text-purple-400",
    faqs: [
      {
        q: "How is my location data handled?",
        a: "Your GPS coordinates are encrypted on the server and never shared without your consent. You control your location visibility in Privacy Settings — options are Exact, Neighborhood, City, or Hidden. The default is City.",
      },
      {
        q: "I'm under 18. Is there special protection?",
        a: "Yes. Accounts marked as minors automatically get City-level location visibility and require workout partner approval. These settings can only be relaxed by a parent or guardian with an admin account.",
      },
      {
        q: "How do I set up an emergency contact?",
        a: "Go to Privacy Settings and scroll to the Emergency Contact section. Add a name and phone number. This information is surfaced during live events as an extra safety measure.",
      },
      {
        q: "What are the rules for meeting other users in person?",
        a: "Always meet workout partners and event participants in public locations such as gyms, parks, or recreation centers. Never share your home address. Report any suspicious behavior immediately through the app.",
      },
    ],
  },
];

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{faq.q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
          {faq.a}
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState(0);

  const cat = CATEGORIES[activeCategory];
  const Icon = cat.icon;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-base leading-tight">Help & Support</h1>
            <p className="text-xs text-muted-foreground">Find answers or contact us</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">

        {/* Contact banner */}
        <div className="rounded-2xl bg-gradient-to-r from-pink-500/20 to-red-500/10 border border-pink-500/30 p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-pink-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Need direct help?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Email us at{" "}
              <a
                href="mailto:support@hatchup.app"
                className="text-pink-400 hover:text-pink-300 underline underline-offset-2"
              >
                support@hatchup.app
              </a>{" "}
              and we'll get back to you within 24 hours.
            </p>
          </div>
        </div>

        {/* Category tabs */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Browse by topic
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map((c, i) => {
              const CIcon = c.icon;
              const active = i === activeCategory;
              return (
                <button
                  key={c.label}
                  onClick={() => setActiveCategory(i)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-sm font-medium transition-all ${
                    active
                      ? "bg-white/10 border-white/20 text-foreground"
                      : "bg-card border-border text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  <CIcon className={`w-4 h-4 ${active ? c.color : ""}`} />
                  <span className="leading-tight">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FAQ list */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Icon className={`w-5 h-5 ${cat.color}`} />
            <h2 className="font-semibold text-base">{cat.label}</h2>
            <Badge variant="secondary" className="text-xs">{cat.faqs.length} articles</Badge>
          </div>
          <div className="space-y-2">
            {cat.faqs.map((faq) => (
              <FAQItem key={faq.q} faq={faq} />
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">Quick links</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Safety Guidelines", icon: Shield, href: "/safety/guidelines" },
              { label: "Privacy Settings", icon: HelpCircle, href: "/settings/privacy" },
              { label: "Subscription", icon: CreditCard, href: "/subscription" },
              { label: "AI Coach", icon: MessageCircle, href: "/coach" },
            ].map(({ label, icon: LIcon, href }) => (
              <button
                key={label}
                onClick={() => setLocation(href)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border text-sm text-muted-foreground hover:text-foreground transition-all text-left"
              >
                <LIcon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Safety reminder */}
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex gap-3 items-start">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-300 leading-relaxed">
            <span className="font-semibold">Safety first.</span>{" "}
            Meet in public locations only. Use caution when meeting new people. Report suspicious behavior immediately through the app.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-2">
          HATCHUP · Version 1.0 · <a href="mailto:support@hatchup.app" className="hover:text-foreground transition-colors">support@hatchup.app</a>
        </p>
      </div>
    </div>
  );
}
