import { useState } from "react";
import { Shield, X, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";

interface SafetyBannerProps {
  variant?: "default" | "meetup" | "event";
  dismissible?: boolean;
  compact?: boolean;
}

const MESSAGES: Record<string, string> = {
  default: "Meet in public locations only. Use caution when meeting new people.",
  meetup: "Meet in public locations only. Use caution when meeting new people.",
  event: "This is a public event. Meet only in the listed public location. Report suspicious behavior immediately.",
};

export function SafetyBanner({ variant = "default", dismissible = true, compact = false }: SafetyBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          className="overflow-hidden"
        >
          <div className={`flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 ${compact ? "p-3" : "p-4"}`}>
            <Shield className={`text-amber-400 shrink-0 mt-0.5 ${compact ? "w-4 h-4" : "w-5 h-5"}`} />
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-amber-300 ${compact ? "text-xs" : "text-sm"}`}>
                Safety Reminder
              </p>
              <p className={`text-amber-200/80 font-medium mt-0.5 ${compact ? "text-[11px]" : "text-xs"}`}>
                {MESSAGES[variant]}
              </p>
              {!compact && (
                <Link href="/settings/privacy">
                  <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1 mt-1.5 hover:text-amber-300 transition-colors">
                    Safety Guidelines <ExternalLink className="w-3 h-3" />
                  </span>
                </Link>
              )}
            </div>
            {dismissible && (
              <button
                onClick={() => setDismissed(true)}
                className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
