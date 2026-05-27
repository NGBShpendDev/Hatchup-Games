import { useState } from "react";
import { useLocation } from "wouter";
import { Layout, PLAYER_ID } from "@/components/layout";
import { useCreateHatchling } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Hatch() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<'name' | 'egg' | 'result'>('name');
  const [name, setName] = useState("");
  const [newHatchlingId, setNewHatchlingId] = useState<number | null>(null);

  const createMutation = useCreateHatchling();

  const startHatching = () => {
    if (!name.trim()) return;
    setStep('egg');
    
    createMutation.mutate(
      { data: { playerId: PLAYER_ID, name: name.trim() } },
      {
        onSuccess: (hatchling) => {
          setNewHatchlingId(hatchling.id);
          // Wait for animation to play before showing result
          setTimeout(() => {
            setStep('result');
          }, 3000);
        },
        onError: () => {
          toast({ title: "Failed to hatch", description: "Something went wrong.", variant: "destructive" });
          setStep('name');
        }
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto min-h-[80vh] flex items-center justify-center">
        <AnimatePresence mode="wait">
          
          {step === 'name' && (
            <motion.div 
              key="name"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-full text-center space-y-8 bg-card border-2 border-border p-12 rounded-[3rem] shadow-2xl"
            >
              <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Sparkles className="w-12 h-12 text-primary" />
              </div>
              <h1 className="text-4xl font-black">Find an Egg</h1>
              <p className="text-lg text-muted-foreground font-medium">What will you name your new companion?</p>
              
              <div className="max-w-sm mx-auto space-y-4">
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Enter a name..." 
                  className="text-2xl font-bold h-16 text-center rounded-2xl bg-muted/50 border-2 focus-visible:ring-primary"
                  autoFocus
                />
                <Button 
                  size="lg" 
                  className="w-full h-16 text-xl font-black rounded-2xl active-elevate"
                  disabled={!name.trim() || createMutation.isPending}
                  onClick={startHatching}
                >
                  Confirm & Incubate <ArrowRight className="ml-2 w-6 h-6" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'egg' && (
            <motion.div 
              key="egg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center w-full"
            >
              <h2 className="text-3xl font-black mb-16 animate-pulse text-primary">Hatching...</h2>
              
              <div className="relative w-64 h-80 mx-auto">
                {/* Glowing backdrop */}
                <motion.div 
                  className="absolute inset-0 bg-primary/30 blur-[100px] rounded-full"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                
                {/* The Egg */}
                <motion.div 
                  className="relative w-full h-full bg-gradient-to-b from-white to-gray-300 rounded-[50%_50%_50%_50%_/_60%_60%_40%_40%] shadow-2xl border-4 border-gray-200"
                  animate={{ 
                    rotate: [0, -10, 10, -10, 10, 0],
                    scale: [1, 1.05, 1.05, 1.05, 1.05, 1]
                  }}
                  transition={{ 
                    duration: 0.5, 
                    repeat: 5,
                    repeatType: "reverse",
                    ease: "easeInOut"
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-[50%_50%_50%_50%_/_60%_60%_40%_40%]">
                    <motion.div 
                      className="w-full h-full border-b-[8px] border-primary/20"
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 0.2, delay: 2.5 }}
                    />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {step === 'result' && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="text-center bg-card border-4 border-primary p-12 rounded-[3rem] shadow-2xl shadow-primary/20 relative overflow-hidden w-full max-w-lg"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 to-transparent pointer-events-none" />
              
              <h2 className="text-4xl font-black mb-8 relative z-10">It's a success!</h2>
              
              <div className="w-48 h-48 mx-auto bg-black/10 rounded-full flex items-center justify-center mb-8 relative z-10">
                <Sparkles className="w-20 h-20 text-primary" />
              </div>

              <p className="text-2xl font-bold text-muted-foreground mb-8 relative z-10">
                <span className="text-foreground">{name}</span> has joined your collection.
              </p>

              <Button 
                size="lg" 
                className="w-full h-16 text-xl font-black rounded-2xl relative z-10 active-elevate"
                onClick={() => setLocation(`/hatchlings/${newHatchlingId}`)}
              >
                Meet {name} <ArrowRight className="ml-2 w-6 h-6" />
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </Layout>
  );
}
