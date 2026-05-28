import { Layout } from "@/components/layout";
import { useListRealms, getListRealmsQueryKey } from "@workspace/api-client-react";
import { usePlayer } from "@/lib/playerContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Map, Lock, Zap, Egg, Sparkles, Trophy } from "lucide-react";
import { ForYouStrip } from "@/components/for-you-strip";
import { GlassCard } from "@/components/ui/glass-card";

export default function Explore() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { data: realms, isLoading } = useListRealms(
    { playerId: pid },
    { query: { queryKey: getListRealmsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

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
