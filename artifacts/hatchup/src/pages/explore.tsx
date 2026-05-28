import { Layout } from "@/components/layout";
import {
  useListRealms,
  getListRealmsQueryKey,
  useGetScopedLeaderboard,
  getGetScopedLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { usePlayer } from "@/lib/playerContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Map, Lock, Zap, Egg, Sparkles, Trophy, Users } from "lucide-react";
import { ForYouStrip } from "@/components/for-you-strip";
import { GlassCard } from "@/components/ui/glass-card";
import { Link } from "wouter";

export default function Explore() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { data: realms, isLoading } = useListRealms(
    { playerId: pid },
    { query: { queryKey: getListRealmsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

  const nearbyParams = { scope: "nearby" as const, metric: "xp" as const, limit: 8 };
  const { data: nearby, isLoading: nearbyLoading } = useGetScopedLeaderboard(
    nearbyParams,
    { query: { queryKey: getGetScopedLeaderboardQueryKey(nearbyParams), enabled: !!playerId } }
  );
  const nearbyEntries = nearby?.entries?.filter((e) => !e.isMe).slice(0, 6) ?? [];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <Map className="w-10 h-10" /> Fitness Realms
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Explore diverse environments to unlock specialized Pal evolutions and powerful stat bonuses.
          </p>
        </div>

        {(nearbyLoading || nearbyEntries.length > 0) && (
          <section>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Players Nearby
              </h2>
            </div>
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
                          key={entry.playerId}
                          href={`/players/${entry.playerId}`}
                          className="snap-start flex-shrink-0 w-36"
                          data-testid={`link-profile-${entry.playerId}`}
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
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                              #{entry.position} · {entry.metricValue.toLocaleString()} XP
                            </p>
                          </div>
                        </Link>
                      );
                    })}
              </div>
            </div>
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
