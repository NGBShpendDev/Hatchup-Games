import { getRarityTokens } from "@/lib/rarityTokens";

interface RarityBadgeProps {
  rarity: string;
  className?: string;
}

export function RarityBadge({ rarity, className = "" }: RarityBadgeProps) {
  const t = getRarityTokens(rarity);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border uppercase tracking-wider ${t.badgeCls} ${className}`}
    >
      {rarity}
    </span>
  );
}
