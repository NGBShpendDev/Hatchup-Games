import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_0_18px_-4px_hsl(var(--primary)/0.7)] hover:shadow-[0_0_28px_-2px_hsl(var(--primary)/0.9)]",
  secondary:
    "bg-card/80 border border-white/15 text-foreground hover:bg-card hover:border-primary/40",
  ghost: "bg-transparent text-foreground/80 hover:text-foreground hover:bg-white/5",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const NeonButton = React.forwardRef<HTMLButtonElement, NeonButtonProps>(
  ({ className, variant = "primary", size = "md", ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-wide",
        "transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  ),
);
NeonButton.displayName = "NeonButton";
