import { Layout } from "@/components/layout";
import {
  useListRealms,
  getListRealmsQueryKey,
  useListNearbyPlayers,
  getListNearbyPlayersQueryKey,
} from "@workspace/api-client-react";
import { usePlayer } from "@/lib/playerContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Map, Lock, Zap, Egg, Sparkles, Trophy, Users, Eye, EyeOff, X, MapPin, ChevronDown } from "lucide-react";
import { ForYouStrip } from "@/components/for-you-strip";
import { GlassCard } from "@/components/ui/glass-card";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const NEARBY_PREV_VIS_KEY = "hatchup:nearby:prevVisibility";
const NEARBY_HIDDEN_REMINDER_DISMISSED_KEY = "hatchup:nearby:hiddenReminderDismissedAt";
const DEFAULT_VISIBILITY = "city";
const HIDDEN_REMINDER_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
const HIDDEN_REMINDER_DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export default function Explore() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: realms, isLoading } = useListRealms(
    { playerId: pid },
    { query: { queryKey: getListRealmsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

  const nearbyParams = { limit: 8 };
  const { data: nearby, isLoading: nearbyLoading } = useListNearbyPlayers(
    nearbyParams,
    { query: { queryKey: getListNearbyPlayersQueryKey(nearbyParams), enabled: !!playerId } }
  );
  const nearbyEntries = nearby?.entries ?? [];
  const locationRequired = nearby?.locationRequired ?? false;

  const [visibility, setVisibility] = useState<string | null>(null);
  const [hiddenSince, setHiddenSince] = useState<string | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityInput, setCityInput] = useState("");
  const [pickerSaving, setPickerSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(NEARBY_HIDDEN_REMINDER_DISMISSED_KEY);
    const ts = raw ? Number(raw) : 0;
    if (ts && Date.now() - ts < HIDDEN_REMINDER_DISMISS_COOLDOWN_MS) {
      setReminderDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    fetch(`/api/players/${playerId}/privacy-settings`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setVisibility(data.locationVisibility ?? DEFAULT_VISIBILITY);
        setHiddenSince(data.locationHiddenSince ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId]);

  const isHidden = visibility === "hidden";
  const hiddenForMs = hiddenSince ? Date.now() - new Date(hiddenSince).getTime() : 0;
  const showHiddenReminder =
    isHidden && !reminderDismissed && hiddenSince !== null && hiddenForMs >= HIDDEN_REMINDER_THRESHOLD_MS;
  const hiddenForDays = Math.max(1, Math.floor(hiddenForMs / (24 * 60 * 60 * 1000)));

  const dismissHiddenReminder = () => {
    setReminderDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NEARBY_HIDDEN_REMINDER_DISMISSED_KEY, String(Date.now()));
    }
  };

  const handleToggleHidden = async () => {
    if (!playerId || toggling || visibility === null) return;
    const prev = visibility;
    let next: string;
    if (prev === "hidden") {
      next = (typeof window !== "undefined" && window.localStorage.getItem(NEARBY_PREV_VIS_KEY)) || DEFAULT_VISIBILITY;
      if (next === "hidden") next = DEFAULT_VISIBILITY;
    } else {
      if (typeof window !== "undefined") window.localStorage.setItem(NEARBY_PREV_VIS_KEY, prev);
      next = "hidden";
    }
    setToggling(true);
    setVisibility(next);
    try {
      const res = await fetch(`/api/players/${playerId}/privacy-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationVisibility: next }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json().catch(() => null);
      const applied = data?.locationVisibility ?? next;
      setVisibility(applied);
      if (applied === "hidden") {
        // The server stamps locationHiddenSince on the transition; mirror it
        // locally so the 14-day reminder timer starts from now. Also reset
        // any prior dismissal so a future long-hidden state can re-prompt.
        setHiddenSince(new Date().toISOString());
        setReminderDismissed(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(NEARBY_HIDDEN_REMINDER_DISMISSED_KEY);
        }
      } else {
        setHiddenSince(null);
      }
      await queryClient.invalidateQueries({ queryKey: getListNearbyPlayersQueryKey(nearbyParams) });
      toast({
        title: applied === "hidden" ? "You're hidden from nearby" : "You're visible nearby again",
        description: applied === "hidden"
          ? "Other players in your city won't see you in the nearby strip."
          : "Players in your city can see you in the nearby strip.",
      });
    } catch {
      setVisibility(prev);
      toast({ title: "Couldn't update visibility", description: "Please try again.", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };
  const handleCityPickerSave = async () => {
    const city = cityInput.trim();
    if (!playerId || pickerSaving || !city) return;
    setPickerSaving(true);
    try {
      const res = await fetch("/api/players/me/location", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, visibility: "city" }),
      });
      if (!res.ok) throw new Error("save failed");
      setCityPickerOpen(false);
      setCityInput("");
      await queryClient.invalidateQueries({ queryKey: getListNearbyPlayersQueryKey(nearbyParams) });
      toast({
        title: "City set!",
        description: `You'll now appear in the Players Nearby strip for ${city}.`,
      });
    } catch {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    } finally {
      setPickerSaving(false);
    }
  };

  const distanceLabel: Record<string, string> = {
    under_1km: "< 1 km away",
    under_5km: "< 5 km away",
    under_25km: "< 25 km away",
    same_city: nearby?.city ? `In ${nearby.city}` : "In your city",
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-28">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <Map className="w-10 h-10" /> Fitness Realms
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Explore diverse environments to unlock specialized Pal evolutions and powerful stat bonuses.
          </p>
        </div>

        {(nearbyLoading || nearbyEntries.length > 0 || isHidden || locationRequired) && (
          <section>
            <div className="flex justify-between items-center mb-2 gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Players Nearby
              </h2>
              {visibility !== null && (
                <button
                  type="button"
                  onClick={handleToggleHidden}
                  disabled={toggling}
                  data-testid="button-toggle-nearby-visibility"
                  aria-pressed={isHidden}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-card/70 backdrop-blur px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
                >
                  {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {isHidden ? "Show me" : "Hide me"}
                </button>
              )}
            </div>
            {showHiddenReminder && (
              <div
                className="mb-3 rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur p-4 text-sm text-foreground flex items-start gap-3"
                data-testid="banner-nearby-hidden-reminder"
              >
                <Eye className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold mb-1">Still hidden from nearby?</p>
                  <p className="text-muted-foreground">
                    You've been hidden from the Players Nearby strip for {hiddenForDays} days. You're missing out on local discovery and city leaderboards.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleToggleHidden}
                      disabled={toggling}
                      data-testid="button-nearby-hidden-reminder-show"
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-[11px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" /> Show me
                    </button>
                    <button
                      type="button"
                      onClick={dismissHiddenReminder}
                      data-testid="button-nearby-hidden-reminder-dismiss"
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-card/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Not now
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissHiddenReminder}
                  aria-label="Dismiss"
                  data-testid="button-nearby-hidden-reminder-close"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {isHidden ? (
              <div
                className="rounded-2xl border border-dashed border-white/10 bg-card/40 backdrop-blur p-4 text-sm text-muted-foreground"
                data-testid="text-nearby-hidden-state"
              >
                You're hidden from the nearby strip. Tap <span className="font-bold text-foreground">Show me</span> to appear to players in your city again.
              </div>
            ) : locationRequired ? (
              <div
                className="rounded-2xl border border-dashed border-white/10 bg-card/40 backdrop-blur p-4 text-sm text-muted-foreground"
                data-testid="text-nearby-location-required"
              >
                <div className="flex items-center gap-3">
                  <Map className="w-4 h-4 shrink-0 text-primary" />
                  <span className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setCityPickerOpen(o => !o)}
                      data-testid="button-set-city"
                      className="font-bold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                    >
                      Set your city
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${cityPickerOpen ? "rotate-180" : ""}`} />
                    </button>
                    {" "}to see players nearby.
                  </span>
                </div>
                {cityPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 space-y-2"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your city</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={cityInput}
                          onChange={e => setCityInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleCityPickerSave(); }}
                          placeholder="e.g. San Francisco"
                          data-testid="input-city"
                          autoFocus
                          className="w-full rounded-xl border border-border bg-background/80 pl-9 pr-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCityPickerSave}
                        disabled={pickerSaving || !cityInput.trim()}
                        data-testid="button-city-picker-save"
                        className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-black hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {pickerSaving ? "…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCityPickerOpen(false); setCityInput(""); }}
                        data-testid="button-city-picker-cancel"
                        className="rounded-xl border border-white/10 bg-card/70 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Only your city name is stored — never your exact address.{" "}
                      <Link href="/settings/privacy#location-visibility" className="underline hover:text-foreground transition-colors">Privacy settings</Link>.
                    </p>
                  </motion.div>
                )}
              </div>
            ) : (
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 pb-2 snap-x snap-mandatory">
                {nearbyLoading
                  ? [...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="snap-start flex-shrink-0 w-36 h-24 rounded-2xl" />
                    ))
                  : nearbyEntries.map((entry) => {
                      const name = entry.displayName ?? entry.username;
                      return (
                        <Link
                          key={entry.id}
                          href={`/players/${entry.id}`}
                          className="snap-start flex-shrink-0 w-36"
                          data-testid={`link-profile-${entry.id}`}
                        >
                          <div className="group h-full rounded-2xl border border-white/10 bg-card/70 backdrop-blur p-3 hover:border-primary/50 hover:bg-card/90 transition-all active:scale-[0.97]">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center text-sm font-black shrink-0">
                                {entry.avatarUrl ? (
                                  <img src={entry.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-sm truncate group-hover:text-primary transition-colors">{name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">@{entry.username}</p>
                              </div>
                            </div>
                            <p
                              className="mt-2 text-[10px] font-bold uppercase tracking-wider text-primary truncate"
                              data-testid={`text-distance-${entry.id}`}
                            >
                              {distanceLabel[entry.distanceBucket] ?? "Nearby"}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
              </div>
            </div>
            )}
          </section>
        )}

        <ForYouStrip
          heading="Grow Your Pals"
          items={[
            { id: "hatch", title: "Hatch a new egg", subtitle: "Open a fresh Pal for your collection.", href: "/hatch", icon: <Egg className="w-4 h-4" />, tone: "yellow", tag: "Hatch" },
            { id: "evolve", title: "Browse evolutions", subtitle: "Plan what your Pals can become.", href: "/explore", icon: <Sparkles className="w-4 h-4" />, tone: "violet", tag: "Plan" },
            { id: "compete", title: "Take them to battle", subtitle: "Test your strongest Pal.", href: "/compete/battle", icon: <Trophy className="w-4 h-4" />, tone: "primary", tag: "Compete" },
          ]}
        />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {realms?.map((realm) => {
              const isLocked = !realm.isUnlocked;
              return (
                <motion.div
                  key={realm.id}
                  whileHover={!isLocked ? { y: -5 } : {}}
                  className="h-full"
                >
                  <GlassCard
                    glow={isLocked ? "none" : "primary"}
                    className={`overflow-hidden h-full transition-all duration-300 ${
                      isLocked ? "opacity-60 grayscale" : ""
                    }`}
                  >
                    <div 
                      className="h-32 relative"
                      style={{ 
                        background: `linear-gradient(135deg, ${realm.color}40, transparent)`,
                        borderBottom: `2px solid ${realm.color}20`
                      }}
                    >
                      <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px]" />
                      <div className="absolute inset-0 p-6 flex justify-between items-start">
                        <div 
                          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shadow-lg"
                          style={{ backgroundColor: `${realm.color}20`, color: realm.color }}
                        >
                          {realm.icon}
                        </div>
                        {isLocked && (
                          <Badge variant="secondary" className="font-bold flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Locked
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <CardContent className="p-6">
                      <h2 className="text-2xl font-black mb-2 flex items-center gap-2" style={{ color: !isLocked ? realm.color : undefined }}>
                        {realm.name}
                      </h2>
                      <p className="text-muted-foreground font-medium mb-6 min-h-[3rem]">
                        {realm.description}
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Evolution Bonus</p>
                          <div className="bg-card-foreground/5 p-3 rounded-xl border border-border/50 flex items-center gap-3">
                            <Zap className="w-5 h-5 text-yellow-500" />
                            <span className="font-bold text-sm">{realm.evolutionBonus}</span>
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Activities</p>
                          <div className="flex flex-wrap gap-2">
                            {realm.fitnessTypes?.map((type, idx) => (
                              <Badge key={idx} variant="outline" className="font-bold capitalize bg-background">
                                {type.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
