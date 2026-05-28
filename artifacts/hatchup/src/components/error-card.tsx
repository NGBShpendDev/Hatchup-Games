import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorCard({
  title,
  description,
  onRetry,
  className,
}: {
  title: string;
  description?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3 ${className ?? ""}`}>
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm text-red-200">{title}</p>
        <p className="text-[11px] text-red-300/80 mt-0.5">
          {description ?? "We couldn't reach the server. Check your connection and try again."}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-red-500/40 text-red-200 hover:bg-red-500/20 text-xs font-black gap-1.5"
        onClick={onRetry}
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </Button>
    </div>
  );
}
