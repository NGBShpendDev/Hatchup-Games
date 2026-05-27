import { useState } from "react";
import { Layout } from "@/components/layout";
import { PLAYER_ID } from "@/lib/constants";
import { useGetPlayerDashboard, getGetPlayerDashboardQueryKey, useLogActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Zap, Flame, Trophy, Activity, Footprints, ChevronRight, PlusCircle, Star, Badge, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: dashboard, isLoading } = useGetPlayerDashboard(PLAYER_ID, {
    query: { queryKey: getGetPlayerDashboardQueryKey(PLAYER_ID) }
  });

  const logActivity = useLogActivity();
  
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [activityType, setActivityType] = useState("steps");
  const [activityValue, setActivityValue] = useState("");

  const handleLogActivity = () => {
    if (!activityValue || isNaN(Number(activityValue))) return;
    
    logActivity.mutate(
      { data: { playerId: PLAYER_ID, type: activityType, value: Number(activityValue), unit: activityType === 'steps' ? 'count' : 'minutes', realm: "strength" } },
      {
        onSuccess: (res) => {
          toast({ title: "Activity Logged!", description: `Earned ${res.xpEarned} XP!` });
          setLogModalOpen(false);
          setActivityValue("");
          queryClient.invalidateQueries({ queryKey: getGetPlayerDashboardQueryKey(PLAYER_ID) });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </Layout>
    );
  }

  if (!dashboard) return null;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        {/* Top Bar */}
        <header className="flex justify-between items-center py-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
              <span className="font-black text-primary text-xl">L{dashboard.player.level}</span>
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight leading-none">{dashboard.player.displayName || dashboard.player.username}</h1>
              <div className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1 mt-1">
                <Trophy className="w-3 h-3 text-yellow-500" /> {dashboard.player.rank}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-card/80 backdrop-blur px-3 py-1.5 rounded-full border border-border">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="font-black text-sm">{dashboard.fitness.currentStreak} Day Streak</span>
          </div>
        </header>

        {/* Hero Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary to-purple-800 rounded-3xl p-6 text-white relative overflow-hidden shadow-2xl neon-glow"
        >
          <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-20 pointer-events-none">
            <Zap className="w-64 h-64" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between gap-6">
            <div>
              <h2 className="text-3xl font-black mb-1 drop-shadow-md">Keep Moving!</h2>
              <p className="text-white/80 font-medium text-sm">Your creatures are waiting to evolve.</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-bold">
                <span className="flex items-center gap-1"><Footprints className="w-4 h-4"/> Today's Steps</span>
                <span>{dashboard.fitness.todaySteps.toLocaleString()} / {dashboard.fitness.dailyStepGoal.toLocaleString()}</span>
              </div>
              <Progress value={dashboard.fitness.stepGoalPct} className="h-4 bg-black/20 [&>div]:bg-white" />
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/hatch">
            <Card className="bg-card border-2 hover:border-primary/50 transition-colors cursor-pointer group active-elevate h-full">
              <CardContent className="p-4 flex flex-col items-center text-center gap-2 h-full justify-center">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <EggIcon className="w-6 h-6" />
                  </div>
                  {dashboard.eggs.readyCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white animate-pulse">
                      {dashboard.eggs.readyCount}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm">Incubator</h3>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase mt-1">{dashboard.eggs.totalActive} Active Eggs</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
            <DialogTrigger asChild>
              <Card className="bg-card border-2 hover:border-accent/50 transition-colors cursor-pointer group active-elevate h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2 h-full justify-center">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                    <PlusCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Log Activity</h3>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase mt-1">Earn Quick XP</p>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black">Log Activity</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-3 gap-2">
                  {['steps', 'running', 'weightlifting', 'yoga', 'cycling'].map(type => (
                    <Button 
                      key={type} 
                      variant={activityType === type ? 'default' : 'outline'} 
                      onClick={() => setActivityType(type)}
                      className="capitalize font-bold text-xs h-12"
                    >
                      {type}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase text-muted-foreground">Amount ({activityType === 'steps' ? 'count' : 'minutes'})</label>
                  <Input 
                    type="number" 
                    value={activityValue} 
                    onChange={e => setActivityValue(e.target.value)} 
                    placeholder="e.g. 5000" 
                    className="h-14 text-xl font-bold font-mono"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleLogActivity} disabled={logActivity.isPending} className="w-full font-black text-lg h-14 active-elevate">
                  {logActivity.isPending ? "Logging..." : "Log & Earn XP"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Top Hatchling */}
        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-black flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" /> Star Creature</h2>
            <Link href="/hatchlings" className="text-xs font-bold text-primary flex items-center hover:underline">View All <ChevronRight className="w-3 h-3" /></Link>
          </div>
          
          {dashboard.topHatchling ? (
            <Link href={`/hatchlings/${dashboard.topHatchling.id}`}>
              <Card className="bg-card border-2 hover:border-primary/30 transition-colors cursor-pointer overflow-hidden group">
                <div className="flex p-4 gap-4 items-center relative">
                  <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                    {dashboard.topHatchling.imageUrl ? (
                      <img src={dashboard.topHatchling.imageUrl} alt={dashboard.topHatchling.name} className="w-16 h-16 object-contain" />
                    ) : (
                      <Sparkles className="w-10 h-10 text-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-2xl leading-none mb-1">{dashboard.topHatchling.name}</h3>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">{dashboard.topHatchling.species}</p>
                    <div className="flex gap-2">
                      <Badge className="bg-primary/20 text-primary border-0 font-black">Lvl {dashboard.topHatchling.level}</Badge>
                      <Badge variant="outline" className="font-bold">{dashboard.topHatchling.category}</Badge>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ) : (
            <Card className="bg-card border-dashed">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground font-bold mb-3">No creatures yet!</p>
                <Link href="/hatch"><Button size="sm" className="font-bold">Hatch your first</Button></Link>
              </CardContent>
            </Card>
          )}
        </section>

      </div>
    </Layout>
  );
}

// Temporary inline EggIcon since lucide-react might not export Egg
function EggIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z" />
    </svg>
  );
}
