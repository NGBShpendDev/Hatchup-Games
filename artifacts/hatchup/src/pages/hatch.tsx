import { useState } from "react";
import { Layout } from "@/components/layout";
import { PLAYER_ID } from "@/lib/constants";
import { 
  useListEggs, getListEggsQueryKey,
  useHatchEgg,
  useAddEgg,
  useListHatchlings, getListHatchlingsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Egg as EggIcon, Sparkles, Plus, Footprints } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Hatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: eggs, isLoading: isLoadingEggs } = useListEggs(
    { playerId: PLAYER_ID, hatched: false },
    { query: { queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, hatched: false }) } }
  );

  const { data: hatchlings, isLoading: isLoadingHatchlings } = useListHatchlings(
    { playerId: PLAYER_ID },
    { query: { queryKey: getListHatchlingsQueryKey({ playerId: PLAYER_ID }) } }
  );

  const hatchMutation = useHatchEgg();
  const addEggMutation = useAddEgg();

  const [selectedEgg, setSelectedEgg] = useState<number | null>(null);
  const [hatchName, setHatchName] = useState("");
  const [showHatchModal, setShowHatchModal] = useState(false);
  const [hatchResult, setHatchResult] = useState<any>(null);

  const handleHatchClick = (eggId: number) => {
    setSelectedEgg(eggId);
    setHatchName("");
    setShowHatchModal(true);
    setHatchResult(null);
  };

  const submitHatch = () => {
    if (!selectedEgg) return;
    hatchMutation.mutate(
      { data: { eggId: selectedEgg, name: hatchName || "Mystery Hatchling" } },
      {
        onSuccess: (res) => {
          setHatchResult(res);
          queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, hatched: false }) });
          queryClient.invalidateQueries({ queryKey: getListHatchlingsQueryKey({ playerId: PLAYER_ID }) });
        },
        onError: () => {
          toast({ title: "Failed to hatch", variant: "destructive" });
        }
      }
    );
  };

  const handleAddEgg = () => {
    addEggMutation.mutate(
      { data: { playerId: PLAYER_ID, eggType: "balanced" } },
      {
        onSuccess: () => {
          toast({ title: "New egg found!" });
          queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, hatched: false }) });
        }
      }
    );
  };

  const closeHatchModal = () => {
    setShowHatchModal(false);
    setTimeout(() => setHatchResult(null), 300);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-12 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8 relative">
          <motion.div 
            className="absolute top-0 right-0 -mr-10 -mt-10 opacity-10 pointer-events-none text-primary"
            animate={{ rotate: 360 }}
            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="w-64 h-64" />
          </motion.div>
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <EggIcon className="w-10 h-10" /> Incubator
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Walk, run, and train to hatch your eggs. Every step counts!
          </p>
          <Button onClick={handleAddEgg} disabled={addEggMutation.isPending} variant="outline" className="mt-6 font-bold border-primary text-primary hover:bg-primary/10">
            <Plus className="w-4 h-4 mr-2" /> Find New Egg
          </Button>
        </div>

        <div>
          <h2 className="text-2xl font-black mb-6">Active Eggs</h2>
          {isLoadingEggs ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-3xl" />)}
            </div>
          ) : eggs?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {eggs.map(egg => (
                <motion.div key={egg.id} whileHover={{ y: -5 }}>
                  <Card className={`overflow-hidden border-2 h-full relative ${egg.isReady ? 'border-primary shadow-lg shadow-primary/20 neon-glow' : 'border-border/50'}`}>
                    {egg.isReady && (
                      <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
                    )}
                    <CardContent className="p-6 flex flex-col items-center text-center">
                      <Badge variant="outline" className="mb-4 font-bold uppercase tracking-wider">{egg.eggType}</Badge>
                      
                      <div className="relative w-32 h-32 mb-6">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="64" cy="64" r="56" className="stroke-muted fill-none" strokeWidth="8" />
                          <motion.circle 
                            cx="64" cy="64" r="56" 
                            className={`fill-none ${egg.isReady ? 'stroke-primary' : 'stroke-accent'}`}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray="351.86"
                            strokeDashoffset={351.86 - (351.86 * (egg.progressPct / 100))}
                            initial={{ strokeDashoffset: 351.86 }}
                            animate={{ strokeDashoffset: 351.86 - (351.86 * (egg.progressPct / 100)) }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <motion.div 
                            animate={egg.isReady ? { scale: [1, 1.1, 1], rotate: [0, -5, 5, -5, 0] } : {}} 
                            transition={egg.isReady ? { repeat: Infinity, duration: 1 } : {}}
                          >
                            <EggIcon className={`w-12 h-12 ${egg.isReady ? 'text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]' : 'text-muted-foreground'}`} />
                          </motion.div>
                        </div>
                      </div>

                      <div className="w-full">
                        <div className="flex justify-between text-xs font-bold mb-2">
                          <span className="flex items-center text-muted-foreground"><Footprints className="w-3 h-3 mr-1"/> {egg.stepsProgress.toLocaleString()}</span>
                          <span className="text-muted-foreground">{egg.stepsRequired.toLocaleString()} req</span>
                        </div>
                      </div>

                      {egg.isReady ? (
                        <Button className="w-full font-black text-lg h-12 mt-4 active-elevate bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => handleHatchClick(egg.id)}>
                          HATCH NOW!
                        </Button>
                      ) : (
                        <Button className="w-full font-bold mt-4" variant="secondary" disabled>
                          Incubating ({Math.round(egg.progressPct)}%)
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center p-12 bg-card/50 rounded-3xl border-2 border-dashed">
              <p className="text-muted-foreground font-bold text-lg mb-4">Your incubator is empty.</p>
              <Button onClick={handleAddEgg} disabled={addEggMutation.isPending} className="font-bold">Find an Egg</Button>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-black mb-6">Creature Collection</h2>
          {isLoadingHatchlings ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
            </div>
          ) : hatchlings?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {hatchlings.map(h => (
                <Link key={h.id} href={`/hatchlings/${h.id}`}>
                  <Card className="border-2 hover:border-primary/50 cursor-pointer transition-colors overflow-hidden bg-card/50">
                    <CardContent className="p-4 flex flex-col items-center text-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        {h.imageUrl ? (
                          <img src={h.imageUrl} alt={h.name} className="w-12 h-12 object-contain" />
                        ) : (
                          <Sparkles className="w-8 h-8 text-primary" />
                        )}
                      </div>
                      <h3 className="font-bold text-sm truncate w-full">{h.name}</h3>
                      <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mt-1">Lvl {h.level}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground font-medium">No creatures hatched yet.</p>
          )}
        </div>
      </div>

      <Dialog open={showHatchModal} onOpenChange={setShowHatchModal}>
        <DialogContent className="sm:max-w-md bg-card border-2 border-primary/50 shadow-[0_0_50px_rgba(var(--primary),0.2)]">
          <AnimatePresence mode="wait">
            {!hatchResult ? (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DialogHeader>
                  <DialogTitle className="text-3xl font-black text-center text-primary mb-4">Oh! The egg is hatching!</DialogTitle>
                </DialogHeader>
                <div className="py-6 flex flex-col items-center">
                  <motion.div 
                    animate={{ rotate: [-10, 10, -10], scale: [1, 1.1, 1] }} 
                    transition={{ repeat: Infinity, duration: 0.5 }}
                    className="mb-8"
                  >
                    <EggIcon className="w-24 h-24 text-primary" />
                  </motion.div>
                  <p className="text-center font-bold mb-4 text-lg">Give your new companion a name:</p>
                  <Input 
                    value={hatchName} 
                    onChange={e => setHatchName(e.target.value)} 
                    placeholder="Enter name..." 
                    className="text-center text-xl h-14 font-bold border-2 focus-visible:ring-primary"
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button className="w-full h-14 text-xl font-black active-elevate" onClick={submitHatch} disabled={hatchMutation.isPending}>
                    {hatchMutation.isPending ? "Hatching..." : "Confirm & Hatch!"}
                  </Button>
                </DialogFooter>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-8">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 to-transparent pointer-events-none" />
                <h2 className="text-4xl font-black mb-8 relative z-10 text-primary drop-shadow-md">It's a {hatchResult.hatchling.species}!</h2>
                
                <div className="w-48 h-48 mx-auto bg-black/20 rounded-full flex items-center justify-center mb-8 relative z-10 border-4 border-primary shadow-[0_0_30px_rgba(var(--primary),0.5)]">
                  {hatchResult.hatchling.imageUrl ? (
                    <img src={hatchResult.hatchling.imageUrl} alt={hatchResult.hatchling.name} className="w-32 h-32 object-contain" />
                  ) : (
                    <Sparkles className="w-20 h-20 text-primary animate-pulse" />
                  )}
                </div>

                <p className="text-2xl font-bold text-foreground mb-8 relative z-10">
                  {hatchResult.hatchling.name}
                </p>

                <div className="flex gap-4 relative z-10">
                  <Button variant="outline" className="flex-1 h-12 font-bold" onClick={closeHatchModal}>
                    Close
                  </Button>
                  <Link href={`/hatchlings/${hatchResult.hatchling.id}`}>
                    <Button className="flex-1 h-12 font-black active-elevate">
                      View Stats
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
