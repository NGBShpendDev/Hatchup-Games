import { Layout } from "@/components/layout";
import { useListEvolutions, getListEvolutionsQueryKey, useGetEvolutionCategories, getGetEvolutionCategoriesQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

export default function Evolutions() {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  
  const { data: categories } = useGetEvolutionCategories({
    query: { queryKey: getGetEvolutionCategoriesQueryKey() }
  });

  const { data: evolutions, isLoading } = useListEvolutions(
    { category: selectedCategory },
    { query: { queryKey: getListEvolutionsQueryKey({ category: selectedCategory }) } }
  );

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
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <Zap className="w-10 h-10" /> Evolution Atlas
          </h1>
          <p className="text-lg text-muted-foreground font-medium">Discover all the magical forms your Pals can take.</p>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <Button 
            variant={selectedCategory === undefined ? "default" : "outline"} 
            onClick={() => setSelectedCategory(undefined)}
            className="rounded-full font-bold px-6"
          >
            All Types
          </Button>
          {categories?.map(cat => (
            <Button 
              key={cat.category}
              variant={selectedCategory === cat.category ? "default" : "outline"} 
              onClick={() => setSelectedCategory(cat.category)}
              className="rounded-full font-bold px-6 capitalize"
            >
              {cat.category} ({cat.count})
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.05 } }
            }}
          >
            {evolutions?.map(evo => (
              <motion.div key={evo.id} variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}>
                <Card className="overflow-hidden border-2 border-border hover:border-primary transition-colors hover:shadow-xl group">
                  <div className="h-48 bg-muted relative flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-10" />
                    <img 
                      src={evo.imageUrl || getFallbackImage(evo.category)} 
                      alt={evo.name}
                      className="w-full h-full object-contain relative z-0 group-hover:scale-110 transition-transform duration-500"
                    />
                    <Badge className="absolute top-4 right-4 z-20 font-black uppercase">
                      {evo.rarity}
                    </Badge>
                  </div>
                  <CardContent className="p-6 relative z-20">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{evo.category}</p>
                    <h3 className="text-2xl font-black mb-2 leading-none">{evo.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{evo.description}</p>
                    {evo.abilityName && (
                      <div className="bg-primary/10 text-primary p-3 rounded-xl border border-primary/20">
                        <p className="text-xs font-bold uppercase mb-1">Signature Move</p>
                        <p className="font-bold">{evo.abilityName}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
