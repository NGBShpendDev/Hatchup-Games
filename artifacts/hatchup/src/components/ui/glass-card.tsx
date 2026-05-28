import * as React from "react";
import { cn } from "@/lib/utils";

type Glow = "none" | "primary" | "accent" | "yellow" | "cyan";

const GLOW: Record<Glow, string> = {
  none: "",
  primary: "shadow-[0_0_24px_-4px_hsl(var(--primary)/0.5)]",
  accent: "shadow-[0_0_24px_-4px_hsl(var(--accent)/0.5)]",
  yellow: "shadow-[0_0_24px_-4px_rgba(234,179,8,0.5)]",
  cyan: "shadow-[0_0_24px_-4px_rgba(34,211,238,0.5)]",
};

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: Glow;
  interactive?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glow = "none", interactive = false, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl",
        "before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none",
        "before:bg-gradient-to-br before:from-white/5 before:to-transparent",
        GLOW[glow],
        interactive &&
          "transition-all duration-200 active:scale-[0.98] hover:border-primary/40 hover:bg-card/80 cursor-pointer",
        className,
      )}
      {...rest}
    />
  ),
);
GlassCard.displayName = "GlassCard";
