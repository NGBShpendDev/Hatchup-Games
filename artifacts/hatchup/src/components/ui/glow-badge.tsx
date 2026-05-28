import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "yellow" | "green" | "cyan" | "violet";

const TONES: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary border-primary/40 shadow-[0_0_10px_-2px_hsl(var(--primary)/0.6)]",
  yellow:
    "bg-yellow-500/15 text-yellow-300 border-yellow-500/40 shadow-[0_0_10px_-2px_rgba(234,179,8,0.6)]",
  green:
    "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_-2px_rgba(16,185,129,0.6)]",
  cyan:
    "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_-2px_rgba(34,211,238,0.6)]",
  violet:
    "bg-violet-500/15 text-violet-300 border-violet-500/40 shadow-[0_0_10px_-2px_rgba(139,92,246,0.6)]",
};

export interface GlowBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function GlowBadge({ className, tone = "primary", ...rest }: GlowBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
