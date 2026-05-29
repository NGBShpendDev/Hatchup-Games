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
import { Map, Lock, Zap, Egg, Sparkles, Trophy, Users, Eye, EyeOff, X, MapPin, ChevronDown, Dumbbell, Mic, Target, History, Utensils } from "lucide-react";
import { ForYouStrip } from "@/components/for-you-strip";
import { GlassCard } from "@/components/ui/glass-card";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      <div className="max-w-5xl mx-auto pb-28">
        <div className="pt-6 pb-2">
          <h1 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2 mb-1">
            <Sparkles className="w-7 h-7" /> Hatchlings
          </h1>
          <p className="text-sm text-muted-foreground">Explore, train, and evolve your Pals.</p>
        </div>

        <Tabs defaultValue="explore" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-muted/50 p-1 rounded-2xl mb-6">
            <TabsTrigger value="explore" className="rounded-xl font-bold flex items-center gap-2">
              <Map className="w-4 h-4" /> Explore
            </TabsTrigger>
            <TabsTrigger value="train" className="rounded-xl font-bold flex items-center gap-2">
              <Dumbbell className="w-4 h-4" /> Train
            </TabsTrigger>
          </TabsList>

          {/* ── Explore tab ──────────────────────────────────────────────── */}
          <TabsContent value="explore" className="space-y-8">

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
                      className="h-16 relative"
                      style={{ 
                        background: `linear-gradient(135deg, ${realm.color}30, transparent)`,
                        borderBottom: `1px solid ${realm.color}15`
                      }}
                    >
                      <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px]" />
                      <div className="absolute inset-0 px-4 py-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-lg font-black shadow"
                            style={{ backgroundColor: `${realm.color}20`, color: realm.color }}
                          >
                            {realm.icon}
                          </div>
                          <h2 className="text-base font-black" style={{ color: !isLocked ? realm.color : undefined }}>
                            {realm.name}
                          </h2>
                        </div>
                        {isLocked && (
                          <Badge variant="secondary" className="font-bold flex items-center gap-1 text-[10px]">
                            <Lock className="w-2.5 h-2.5" /> Locked
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <CardContent className="p-3">
                      <p className="text-muted-foreground text-xs mb-2 line-clamp-2">
                        {realm.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 text-xs text-yellow-500 font-semibold">
                          <Zap className="w-3 h-3" />{realm.evolutionBonus}
                        </div>
                        {realm.fitnessTypes?.slice(0, 3).map((type, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] font-semibold capitalize bg-background px-1.5 py-0">
                            {type.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}

          </TabsContent>

          {/* ── Train tab ────────────────────────────────────────────────── */}
          <TabsContent value="train" className="space-y-4">

            {/* Rep Counter — featured card */}
            <Link href="/workout">
              <div className="rounded-2xl border border-pink-500/30 bg-gradient-to-r from-pink-900/30 to-purple-900/30 p-4 flex items-center gap-4 hover:border-pink-500/60 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-pink-500/20 flex items-center justify-center shrink-0">
                  <Mic className="w-6 h-6 text-pink-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground flex items-center gap-2">
                    Rep Counter
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-semibold">NEW</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Voice &amp; camera counting · Verified reps hatch eggs faster</div>
                </div>
                <div className="text-yellow-400 font-bold text-xs text-right shrink-0">
                  up to 3×<br />
                  <span className="text-muted-foreground font-normal">XP bonus</span>
                </div>
              </div>
            </Link>

            {/* Training hub grid */}
            <div className="grid grid-cols-2 gap-3">
              {([
                { href: "/training", label: "AI Coach",  desc: "Personalized workout plan",  icon: <Dumbbell className="w-5 h-5 text-blue-400" />,   color: "blue" },
                { href: "/training", label: "Quests",    desc: "Daily fitness challenges",    icon: <Target    className="w-5 h-5 text-yellow-400" />,  color: "yellow" },
                { href: "/training", label: "History",   desc: "Your workout log",            icon: <History   className="w-5 h-5 text-zinc-400" />,    color: "zinc" },
                { href: "/nutrition", label: "Nutrition", desc: "Meal plan & tracking",       icon: <Utensils  className="w-5 h-5 text-green-400" />,   color: "green" },
              ] as const).map(card => (
                <Link key={card.href + card.label} href={card.href}>
                  <div className="rounded-xl border border-white/10 bg-card/60 backdrop-blur p-4 hover:border-white/20 hover:bg-card/80 transition-all cursor-pointer h-full">
                    {card.icon}
                    <div className="font-bold text-sm text-foreground mt-2">{card.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{card.desc}</div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Grow Your Pals strip in train tab too */}
            <ForYouStrip
              heading="Grow Your Pals"
              items={[
                { id: "hatch2",   title: "Hatch a new egg",     subtitle: "Open a fresh Pal.",       href: "/hatch",          icon: <Egg      className="w-4 h-4" />, tone: "yellow",  tag: "Hatch" },
                { id: "compete2", title: "Battle with your Pal", subtitle: "Test your strongest.",    href: "/compete/battle", icon: <Trophy   className="w-4 h-4" />, tone: "primary", tag: "Compete" },
                { id: "zap2",     title: "Check your Pals",     subtitle: "View stats & evolutions.", href: "/hatchlings",     icon: <Sparkles className="w-4 h-4" />, tone: "violet",  tag: "Pals" },
              ]}
            />

          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}
