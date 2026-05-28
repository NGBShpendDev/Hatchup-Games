import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useListEvents, getListEventsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Calendar, Clock, Gift, Users, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { SafetyBanner } from "@/components/safety-banner";
import { ErrorCard } from "@/components/error-card";

export default function Events() {
  const { player } = usePlayer();
  const { data: events, isLoading, isError, refetch } = useListEvents(
    {},
    { query: { queryKey: getListEventsQueryKey({}) } }
  );

  const hasActiveEvent = events?.some(e => e.status === "active");
  const hasEmergencyContact =
    player &&
    ((player as { emergencyContactName?: string }).emergencyContactName ||
      (player as { emergencyContactPhone?: string }).emergencyContactPhone);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <Calendar className="w-10 h-10" /> Live Events
          </h1>
          <p className="text-lg text-muted-foreground font-medium">Massive community events with exclusive rewards.</p>
        </div>

        {/* Safety reminder shown when any active live event exists */}
        {hasActiveEvent && (
          <SafetyBanner variant="event" dismissible />
        )}

        {/* Emergency contact reminder for active events */}
        {hasActiveEvent && !hasEmergencyContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 rounded-2xl border border-green-500/20 bg-green-950/10 p-4"
          >
            <Phone className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm text-green-300">No emergency contact set</p>
              <p className="text-xs text-green-200/70 font-medium mt-0.5">
                Before attending live events, add an emergency contact in your{" "}
                <a href="/settings/privacy" className="underline text-green-400 hover:text-green-300">
                  Privacy Settings
                </a>
                .
              </p>
            </div>
          </motion.div>
        )}

        {/* Emergency contact display when set */}
        {hasActiveEvent && hasEmergencyContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-950/20 px-4 py-3"
          >
            <Phone className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-xs text-green-300 font-medium">
              Emergency contact:{" "}
              <span className="font-black">
                {(player as { emergencyContactName?: string }).emergencyContactName ?? ""}{" "}
                {(player as { emergencyContactPhone?: string }).emergencyContactPhone
                  ? `(${(player as { emergencyContactPhone?: string }).emergencyContactPhone})`
                  : ""}
              </span>
            </p>
          </motion.div>
        )}

        {isError && !events ? (
          <ErrorCard title="Couldn't load events" onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {events?.map(event => (
              <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <GlassCard
                  glow={event.status === "active" ? "primary" : "none"}
                  className={`overflow-hidden ${event.status === "active" ? "" : "opacity-75"}`}
                >
                  <div className="relative z-10 flex flex-col md:flex-row">
                    <div className="w-full md:w-1/3 h-48 md:h-auto bg-muted relative">
                      {event.imageUrl && <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/90 md:bg-gradient-to-l" />
                      {event.status === "active" && (
                        <div className="absolute top-4 left-4 animate-pulse">
                          <GlowBadge tone="primary">Live Now</GlowBadge>
                        </div>
                      )}
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(event.startTime).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="text-primary">{event.type}</span>
                        </div>
                        <h2 className="text-3xl font-black mb-3">{event.name}</h2>
                        <p className="text-muted-foreground font-medium mb-4">{event.description}</p>

                        {event.status === "active" && (
                          <p className="text-xs text-amber-400 font-bold mb-4 flex items-center gap-1">
                            🛡️ Meet in public locations only. Use caution when meeting new people.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 items-center justify-between mt-auto">
                        <div className="flex gap-6">
                          <div className="flex items-center gap-2 text-sm font-bold">
                            <Users className="w-5 h-5 text-blue-500" />
                            <span>{(event.participantCount ?? 0).toLocaleString()} players</span>
                          </div>
                          {event.rewardXp != null && (
                            <div className="flex items-center gap-2 text-sm font-bold">
                              <Gift className="w-5 h-5 text-yellow-500" />
                              <span>{event.rewardXp} XP</span>
                            </div>
                          )}
                        </div>
                        {event.status === "active" ? (
                          <NeonButton size="lg" className="w-full md:w-auto">
                            Join Event
                          </NeonButton>
                        ) : (
                          <Button
                            size="lg"
                            variant="secondary"
                            className="font-bold w-full md:w-auto active-elevate"
                            disabled
                          >
                            Starts Soon
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
