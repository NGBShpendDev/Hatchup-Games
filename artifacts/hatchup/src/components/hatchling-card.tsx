import { motion } from "framer-motion";
import { Hatchling } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, Heart, Coffee, Shield } from "lucide-react";
import { Link } from "wouter";

import lavaDragonImg from "@/assets/images/lava-dragon.png";
import cyberCreatureImg from "@/assets/images/cyber-creature.png";
import shadowBeastImg from "@/assets/images/shadow-beast.png";
import candyMonsterImg from "@/assets/images/candy-monster.png";
import cosmicEntityImg from "@/assets/images/cosmic-entity.png";
import crystalGuardianImg from "@/assets/images/crystal-guardian.png";

interface HatchlingCardProps {
  hatchling: Hatchling;
  onClick?: () => void;
}

export function HatchlingCard({ hatchling, onClick }: HatchlingCardProps) {
  const getRarityColor = (rarity?: string) => {
    switch(rarity?.toLowerCase()) {
      case 'mythic': return 'border-pink-500 shadow-pink-500/50 bg-pink-500/10 text-pink-500';
      case 'legendary': return 'border-yellow-500 shadow-yellow-500/50 bg-yellow-500/10 text-yellow-500';
      case 'epic': return 'border-purple-500 shadow-purple-500/50 bg-purple-500/10 text-purple-500';
      case 'rare': return 'border-blue-500 shadow-blue-500/50 bg-blue-500/10 text-blue-500';
      default: return 'border-gray-500 shadow-gray-500/50 bg-gray-500/10 text-gray-400';
    }
  };

  const getFallbackImage = (category?: string) => {
    switch(category?.toLowerCase()) {
      case 'dragons': return lavaDragonImg;
      case 'cyber': return cyberCreatureImg;
      case 'shadow': return shadowBeastImg;
      case 'candy': return candyMonsterImg;
      case 'cosmic': return cosmicEntityImg;
      case 'crystal': return crystalGuardianImg;
      default: return lavaDragonImg; // fallback
    }
  };

  const rarityStyle = getRarityColor(hatchling.rarity);
  const imageSrc = hatchling.imageUrl || getFallbackImage(hatchling.category);

  const CardContent = (
    <motion.div 
      whileHover={{ y: -8, scale: 1.02 }}
      className={`relative overflow-hidden rounded-2xl border-2 ${rarityStyle.split(' ')[0]} bg-card p-4 shadow-lg transition-all hover:shadow-2xl cursor-pointer group`}
      onClick={onClick}
      data-testid={`hatchling-card-${hatchling.id}`}
    >
      {/* Background glow */}
      <div className={`absolute -inset-4 opacity-0 group-hover:opacity-20 transition-opacity blur-2xl ${rarityStyle.split(' ')[2]}`} />

      {/* Header */}
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <h3 className="font-black text-lg text-foreground tracking-tight leading-none">{hatchling.name}</h3>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">{hatchling.species}</p>
        </div>
        <Badge variant="outline" className={`font-black uppercase ${rarityStyle}`}>
          {hatchling.rarity || 'Common'}
        </Badge>
      </div>

      {/* Image */}
      <div className="relative aspect-square w-full mb-4 flex items-center justify-center bg-black/20 rounded-xl overflow-hidden border border-border">
        {hatchling.isShiny && (
          <div className="absolute inset-0 bg-gradient-to-tr from-yellow-300/20 via-transparent to-transparent z-10 mix-blend-overlay" />
        )}
        <motion.img 
          src={imageSrc} 
          alt={hatchling.name}
          className="w-full h-full object-contain p-2 relative z-0 drop-shadow-2xl"
          initial={{ y: 0 }}
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        />
        <div className="absolute bottom-2 left-2 flex gap-1 z-20">
          <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 bg-background/80 backdrop-blur">Lvl {hatchling.level}</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-3 relative z-10">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="flex items-center gap-1 text-green-500"><Heart className="w-3 h-3"/> Happiness</span>
            <span>{hatchling.happiness}%</span>
          </div>
          <Progress value={hatchling.happiness} className="h-1.5" />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="flex items-center gap-1 text-blue-500"><Zap className="w-3 h-3"/> Energy</span>
            <span>{hatchling.energy}%</span>
          </div>
          <Progress value={hatchling.energy} className="h-1.5" />
        </div>
      </div>

    </motion.div>
  );

  if (onClick) return CardContent;

  return (
    <Link href={`/hatchlings/${hatchling.id}`}>
      {CardContent}
    </Link>
  );
}
