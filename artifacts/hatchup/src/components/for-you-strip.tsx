import { ReactNode } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { GlowBadge } from "@/components/ui/glow-badge";

export interface ForYouItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: ReactNode;
  tone?: "primary" | "yellow" | "green" | "cyan" | "violet";
  tag?: string;
}

export function ForYouStrip({
  items,
  heading = "For You",
}: {
  items: ForYouItem[];
  heading?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">{heading}</h2>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 pb-2 snap-x snap-mandatory">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="snap-start flex-shrink-0 w-44"
            >
              <Link href={item.href}>
                <div className="group h-full rounded-2xl border border-white/10 bg-card/70 backdrop-blur p-3 hover:border-primary/50 hover:bg-card/90 transition-all cursor-pointer active:scale-[0.97]">
                  <div className="flex items-center justify-between mb-2">
                    {item.icon && <span className="text-primary">{item.icon}</span>}
                    {item.tag && <GlowBadge tone={item.tone ?? "primary"}>{item.tag}</GlowBadge>}
                  </div>
                  <p className="font-black text-sm leading-tight line-clamp-2">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{item.subtitle}</p>
                  )}
                  <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider group-hover:translate-x-0.5 transition-transform">
                    Open <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
