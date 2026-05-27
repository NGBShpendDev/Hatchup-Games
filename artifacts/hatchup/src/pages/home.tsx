import { useGetPlayerDashboard, getGetPlayerDashboardQueryKey } from "@workspace/api-client-react";
import { Layout, PLAYER_ID } from "@/components/layout";
import { HatchlingCard } from "@/components/hatchling-card";
import { RankBadge } from "@/components/rank-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Trophy, Calendar, Zap, Swords } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: dashboard, isLoading } = useGetPlayerDashboard(PLAYER_ID, {
    query: { enabled: true, queryKey: getGetPlayerDashboardQueryKey(PLAYER_ID) }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 w-full rounded-2xl lg:col-span-1" />
            <Skeleton className="h-96 w-full rounded-2xl lg:col-span-2" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!dashboard) return null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        
        {/* Welcome Hero */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary to-purple-600 rounded-3xl p-8 text-primary-foreground relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-20 pointer-events-none">
            <Zap className="w-64 h-64" />
          </div>
          <div className="relative z-10">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">
              Welcome back, {dashboard.player.displayName || dashboard.player.username}!
            </h1>
            <p className="text-primary-foreground/80 font-medium text-lg max-w-xl mb-6">
              Your hatchlings are energized and ready for action. There are {dashboard.activeEvents.length} live events happening right now!
            </p>
            <div className="flex gap-4">
              <Link href="/hatch">
                <Button size="lg" variant="secondary" className="font-bold rounded-xl active-elevate" data-testid="button-hatch-new">
                  Hatch New Egg
                </Button>
              </Link>
              <Link href="/compete">
                <Button size="lg" className="bg-black/20 hover:bg-black/30 text-white border-0 font-bold rounded-xl active-elevate" data-testid="button-compete">
                  <Swords className="w-4 h-4 mr-2" /> Compete Now
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Top Hatchling & Rank */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-8"
          >
            <section>
              <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
                <StarIcon className="text-yellow-500" /> Top Hatchling
              </h2>
              {dashboard.topHatchling ? (
                <HatchlingCard hatchling={dashboard.topHatchling} />
              ) : (
                <Card className="bg-card/50 border-dashed">
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground font-medium mb-4">No hatchlings yet!</p>
                    <Link href="/hatch">
                      <Button>Hatch Your First</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </section>

            <section>
              <Card className="bg-card border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl font-black">
                    <Trophy className="text-yellow-500 w-6 h-6" /> Your Rank
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center pb-8">
                  <RankBadge rank={dashboard.player.rank} size="lg" showLabel />
                  <div className="mt-6 w-full text-center">
                    <p className="text-sm text-muted-foreground font-bold uppercase tracking-wider mb-2">Rank Score</p>
                    <p className="text-3xl font-black">{dashboard.player.rankScore || 0}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 w-full text-center">
                    <div className="bg-muted p-3 rounded-xl">
                      <p className="text-xs text-muted-foreground font-bold">Total Wins</p>
                      <p className="text-xl font-black text-green-500">{dashboard.totalWins}</p>
                    </div>
                    <div className="bg-muted p-3 rounded-xl">
                      <p className="text-xs text-muted-foreground font-bold">Win Rate</p>
                      <p className="text-xl font-black text-blue-500">{Math.round((dashboard.winRate || 0) * 100)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </motion.div>

          {/* Activity & Events */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 space-y-8"
          >
            <section>
              <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
                <Calendar className="text-primary" /> Live Events
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.activeEvents.length > 0 ? (
                  dashboard.activeEvents.map(event => (
                    <Card key={event.id} className="overflow-hidden border-2 hover:border-primary transition-colors group cursor-pointer" data-testid={`event-${event.id}`}>
                      <div className="h-32 bg-muted relative">
                        {event.imageUrl && <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                        <div className="absolute top-2 right-2">
                          <span className="bg-red-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded-full animate-pulse">
                            Live Now
                          </span>
                        </div>
                      </div>
                      <CardContent className="p-4 relative z-10 -mt-6">
                        <h3 className="font-black text-xl mb-1">{event.name}</h3>
                        <p className="text-sm text-muted-foreground font-medium line-clamp-2">{event.description}</p>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-2 text-center p-8 bg-card rounded-2xl border-2 border-dashed">
                    <p className="text-muted-foreground font-bold">No live events right now. Check back later!</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex justify-between items-end mb-4">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <Swords className="text-blue-500" /> Recent Matches
                </h2>
                <Link href="/compete" className="text-sm font-bold text-primary hover:underline">View All</Link>
              </div>
              <Card className="bg-card shadow-md">
                <div className="divide-y divide-border">
                  {dashboard.recentCompetitions.length > 0 ? (
                    dashboard.recentCompetitions.map(comp => (
                      <div key={comp.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg
                            ${comp.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' : 
                              comp.rank === 2 ? 'bg-gray-400/20 text-gray-400' : 
                              comp.rank === 3 ? 'bg-orange-700/20 text-orange-700' : 'bg-muted text-muted-foreground'}
                          `}>
                            #{comp.rank || '-'}
                          </div>
                          <div>
                            <p className="font-bold">{comp.mode}</p>
                            <p className="text-xs text-muted-foreground font-medium">with {comp.hatchlingName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-green-500">+{comp.xpEarned} XP</p>
                          <p className="text-xs text-yellow-500 font-bold">+{comp.coinsEarned} Coins</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground font-medium">
                      No recent matches. Time to compete!
                    </div>
                  )}
                </div>
              </Card>
            </section>

          </motion.div>
        </div>
      </div>
    </Layout>
  );
}

function StarIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}