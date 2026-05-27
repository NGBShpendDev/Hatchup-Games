import { motion } from "framer-motion";
import { Shield } from "lucide-react";

interface RankBadgeProps {
  rank: string;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
}

export function RankBadge({ rank, size = "md", showLabel = false }: RankBadgeProps) {
  const getRankStyles = (r: string) => {
    switch (r.toLowerCase()) {
      case 'bronze': return { color: 'text-orange-700', bg: 'bg-orange-700/20', border: 'border-orange-700', glow: 'shadow-orange-700/50' };
      case 'silver': return { color: 'text-gray-400', bg: 'bg-gray-400/20', border: 'border-gray-400', glow: 'shadow-gray-400/50' };
      case 'gold': return { color: 'text-yellow-400', bg: 'bg-yellow-400/20', border: 'border-yellow-400', glow: 'shadow-yellow-400/50' };
      case 'diamond': return { color: 'text-cyan-400', bg: 'bg-cyan-400/20', border: 'border-cyan-400', glow: 'shadow-cyan-400/50' };
      case 'master': return { color: 'text-purple-500', bg: 'bg-purple-500/20', border: 'border-purple-500', glow: 'shadow-purple-500/50' };
      case 'cosmic': return { color: 'text-indigo-400', bg: 'bg-indigo-400/20', border: 'border-indigo-400', glow: 'shadow-indigo-400/50' };
      case 'legendary': return { color: 'text-pink-500', bg: 'bg-pink-500/20', border: 'border-pink-500', glow: 'shadow-pink-500/50' };
      default: return { color: 'text-gray-500', bg: 'bg-gray-500/20', border: 'border-gray-500', glow: 'shadow-gray-500/50' };
    }
  };

  const styles = getRankStyles(rank);
  
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16 border-2",
    xl: "w-24 h-24 border-4",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-5 h-5",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div 
        className={`rounded-full flex items-center justify-center border shadow-lg ${styles.bg} ${styles.border} ${sizeClasses[size]}`}
        animate={rank.toLowerCase() === 'legendary' || rank.toLowerCase() === 'cosmic' ? {
          boxShadow: [
            `0 0 10px var(--tw-shadow-color)`,
            `0 0 20px var(--tw-shadow-color)`,
            `0 0 10px var(--tw-shadow-color)`
          ]
        } : {}}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{ '--tw-shadow-color': styles.glow.replace('shadow-', '') } as any}
      >
        <Shield className={`${styles.color} ${iconSizes[size]}`} fill="currentColor" />
      </motion.div>
      {showLabel && (
        <span className={`font-black uppercase tracking-widest ${styles.color} text-sm`}>
          {rank}
        </span>
      )}
    </div>
  );
}
