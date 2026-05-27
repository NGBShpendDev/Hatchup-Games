import { Layout } from "@/components/layout";
import { useListGameModes, getListGameModesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Link } from "wouter";

export default function Compete() {
  const { data: modes, isLoading } = useListGameModes({
    query: { queryKey: getListGameModesQueryKey() }
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-10 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Compete & Conquer</h1>
            <p className="text-lg font-medium max-w-2xl opacity-90">
              Pit your Pals against players worldwide in various game modes. Earn XP, coins, and climb the global leaderboard.
            </p>
          </div>
        </div>

        <h2 className="text-3xl font-black">Game Modes</h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {modes?.map(mode => (
              <motion.div key={mode.id} whileHover={{ y: -5 }}>
                <Card className={`overflow-hidden border-2 h-full ${mode.isLive ? 'border-primary shadow-primary/20 shadow-lg' : 'border-border'}`}>
                  <CardContent className="p-0 h-full flex flex-col sm:flex-row">
                    <div className="w-full sm:w-1/3 bg-muted flex items-center justify-center p-8 border-b sm:border-b-0 sm:border-r border-border">
                      <span className="text-6xl">{mode.iconEmoji || '🎮'}</span>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-2xl font-black">{mode.name}</h3>
                          {mode.isLive && <span className="bg-red-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-full animate-pulse">Live</span>}
                        </div>
                        <p className="text-sm text-muted-foreground font-medium mb-4">{mode.description}</p>
                        <div className="flex gap-4 text-xs font-bold text-muted-foreground mb-6">
                          <span className="bg-card-foreground/5 px-2 py-1 rounded-md">{mode.maxPlayers} Players</span>
                          <span className="bg-card-foreground/5 px-2 py-1 rounded-md">Min Lvl {mode.minLevel}</span>
                        </div>
                      </div>
                      <Link href={`/compete/race?mode=${encodeURIComponent(mode.name)}`}>
                        <Button className="w-full font-bold active-elevate" size="lg" disabled={!mode.isLive && mode.type !== 'standard'}>
                          {mode.isLive || mode.type === 'standard' ? 'Play Now' : 'Coming Soon'}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
