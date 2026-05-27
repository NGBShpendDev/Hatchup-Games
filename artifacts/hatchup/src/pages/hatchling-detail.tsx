import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useGetHatchling, getGetHatchlingQueryKey, useDeleteHatchling, getDeleteHatchlingMutationOptions, useUpdateHatchling } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Heart, Coffee, Shield, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

export default function HatchlingDetail() {
  const { id } = useParams<{ id: string }>();
  const hatchlingId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: hatchling, isLoading } = useGetHatchling(hatchlingId, {
    query: { enabled: !!hatchlingId, queryKey: getGetHatchlingQueryKey(hatchlingId) }
  });

  const updateMutation = useUpdateHatchling();
  const deleteMutation = useDeleteHatchling();

  const handleFeed = () => {
    if (!hatchling) return;
    updateMutation.mutate(
      { id: hatchlingId, data: { hunger: Math.min(100, hatchling.hunger + 20) } },
      { onSuccess: () => toast({ title: "Yum!", description: `${hatchling.name} enjoyed the meal!` }) }
    );
  };

  const handlePlay = () => {
    if (!hatchling) return;
    updateMutation.mutate(
      { id: hatchlingId, data: { happiness: Math.min(100, hatchling.happiness + 20), energy: Math.max(0, hatchling.energy - 10) } },
      { onSuccess: () => toast({ title: "Fun!", description: `${hatchling.name} had a great time playing!` }) }
    );
  };

  const handleRelease = () => {
    if (!hatchling) return;
    if (confirm(`Are you sure you want to release ${hatchling.name}? This cannot be undone.`)) {
      deleteMutation.mutate(
        { id: hatchlingId },
        { 
          onSuccess: () => {
            toast({ title: "Released", description: `${hatchling.name} has been released into the wild.` });
            setLocation("/hatchlings");
          }
        }
      );
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-[500px] w-full rounded-3xl" />
            <div className="space-y-6">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!hatchling) return <Layout><div className="p-8 text-center font-bold">Hatchling not found</div></Layout>;

  const getFallbackImage = (category?: string) => {
    switch(category?.toLowerCase()) {
      case 'dragons': return lavaDragonImg;
      case 'cyber': return cyberCreatureImg;
      case 'shadow': return shadowBeastImg;
      case 'candy': return candyMonsterImg;
      case 'cosmic': return cosmicEntityImg;
      case 'crystal': return crystalGuardianImg;
      default: return lavaDragonImg;
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto pb-12">
        <Link href="/hatchlings">
          <Button variant="ghost" className="mb-6 font-bold">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Hatchlings
          </Button>
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card/50 backdrop-blur border-2 border-border rounded-3xl p-8 flex items-center justify-center relative overflow-hidden shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-500/10" />
            <motion.img 
              src={hatchling.imageUrl || getFallbackImage(hatchling.category)} 
              alt={hatchling.name}
              className="w-full max-w-md object-contain drop-shadow-2xl relative z-10"
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            />
            {hatchling.isShiny && (
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-300/20 to-transparent pointer-events-none" />
            )}
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="space-y-8"
          >
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-5xl font-black tracking-tight text-foreground mb-2">{hatchling.name}</h1>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge variant="outline" className="text-lg font-bold px-3 py-1 uppercase">{hatchling.species}</Badge>
                    <Badge className="text-lg font-bold px-3 py-1 bg-primary/20 text-primary border-0">Level {hatchling.level}</Badge>
                    {hatchling.isShiny && <Badge className="bg-yellow-500 text-black font-black">SHINY</Badge>}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Personality</p>
                <p className="text-lg font-black capitalize">{hatchling.personality}</p>
              </div>
              <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Mood</p>
                <p className="text-lg font-black capitalize">{hatchling.mood}</p>
              </div>
            </div>

            <div className="space-y-6 bg-card p-6 rounded-3xl border border-border shadow-md">
              <h3 className="font-black text-xl mb-4">Vitals</h3>
              <div className="space-y-2">
                <div className="flex justify-between font-bold text-sm">
                  <span className="flex items-center gap-2 text-green-500"><Heart className="w-4 h-4"/> Happiness</span>
                  <span>{hatchling.happiness}%</span>
                </div>
                <Progress value={hatchling.happiness} className="h-3 [&>div]:bg-green-500 bg-green-500/20" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between font-bold text-sm">
                  <span className="flex items-center gap-2 text-orange-500"><Coffee className="w-4 h-4"/> Hunger</span>
                  <span>{hatchling.hunger}%</span>
                </div>
                <Progress value={hatchling.hunger} className="h-3 [&>div]:bg-orange-500 bg-orange-500/20" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between font-bold text-sm">
                  <span className="flex items-center gap-2 text-blue-500"><Zap className="w-4 h-4"/> Energy</span>
                  <span>{hatchling.energy}%</span>
                </div>
                <Progress value={hatchling.energy} className="h-3 [&>div]:bg-blue-500 bg-blue-500/20" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 p-6 rounded-3xl border border-primary/20">
              <h3 className="font-black text-xl mb-2 flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Special Ability</h3>
              <p className="font-bold text-lg">{hatchling.abilityName || "Unknown Ability"}</p>
              <p className="text-muted-foreground font-medium mt-1">{hatchling.abilityDesc || "This hatchling hasn't discovered its true power yet."}</p>
            </div>

            <div className="flex flex-wrap gap-4 pt-4 border-t border-border">
              <Button size="lg" className="flex-1 font-bold active-elevate" onClick={handlePlay} disabled={updateMutation.isPending}>
                Play
              </Button>
              <Button size="lg" variant="secondary" className="flex-1 font-bold active-elevate" onClick={handleFeed} disabled={updateMutation.isPending}>
                Feed
              </Button>
              <Button size="lg" variant="destructive" className="w-full mt-4 font-bold" onClick={handleRelease}>
                <Trash2 className="w-4 h-4 mr-2" /> Release
              </Button>
            </div>

          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
