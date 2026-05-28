import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { Shield, Lock, KeyRound, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface AdminSessionStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  whitelisted: boolean;
  unlocked: boolean;
  expiresAt: string | null;
  remainingMs: number;
  accessCodeConfigured: boolean;
  ttlMs: number;
}

export function useAdminSession() {
  return useQuery<AdminSessionStatus>({
    queryKey: ["admin-session"],
    queryFn: async () => {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load admin session");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function AdminSessionChip() {
  const { data } = useAdminSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const lock = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/session/lock", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Lock failed");
    },
    onSuccess: () => {
      toast({ title: "Admin session locked" });
      qc.invalidateQueries({ queryKey: ["admin-session"] });
    },
  });
  if (!data?.unlocked) return null;
  const mins = Math.max(0, Math.floor(data.remainingMs / 60_000));
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs"
      data-testid="admin-session-chip"
    >
      <Shield className="w-3.5 h-3.5 text-red-300" />
      <span className="font-bold text-red-200">Admin · {mins}m left</span>
      <button
        onClick={() => lock.mutate()}
        className="ml-1 px-2 py-0.5 rounded-full bg-red-500/20 hover:bg-red-500/40 font-bold text-red-100"
        data-testid="button-admin-lock"
      >
        Lock
      </button>
    </div>
  );
}

function UnlockPrompt({ status }: { status: AdminSessionStatus }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlock = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/session/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "unlock_failed");
      }
      return body;
    },
    onSuccess: () => {
      toast({ title: "Admin panel unlocked" });
      qc.invalidateQueries({ queryKey: ["admin-session"] });
    },
    onError: (err: Error) => {
      const message =
        err.message === "invalid_code"
          ? "That code is not correct. Check it with a super-admin."
          : err.message === "too_many_attempts"
            ? "Too many attempts. Try again in 15 minutes."
            : err.message === "no_code_configured"
              ? "No access code is configured yet. A super-admin must rotate one first."
              : "Unable to unlock. Try again.";
      setError(message);
    },
  });
  return (
    <Layout>
      <div className="max-w-md mx-auto pt-10 space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/30">
            <KeyRound className="w-7 h-7 text-red-300" />
          </div>
          <h1 className="font-black text-2xl">Admin access code</h1>
          <p className="text-sm text-muted-foreground">
            Enter the rotating admin code to unlock moderation tools for the next{" "}
            {Math.round(status.ttlMs / 60_000)} minutes.
          </p>
        </div>
        <GlassCard className="p-5 space-y-4">
          <Input
            placeholder="ACCESS CODE"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            data-testid="input-admin-code"
            autoFocus
            className="font-mono tracking-widest text-center text-lg"
          />
          {error && (
            <p className="text-sm text-red-300 flex items-start gap-2" data-testid="text-admin-code-error">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!code || unlock.isPending}
            onClick={() => unlock.mutate()}
            data-testid="button-admin-unlock"
          >
            {unlock.isPending ? "Unlocking…" : "Unlock admin panel"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Tip: super-admins can rotate the code from the admin settings page if it's lost.
          </p>
        </GlassCard>
      </div>
    </Layout>
  );
}

function DeniedScreen({ title, body, ctaHref }: { title: string; body: string; ctaHref?: string }) {
  return (
    <Layout>
      <div className="max-w-md mx-auto pt-10 space-y-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center border border-border">
          <Lock className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="font-black text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        {ctaHref && (
          <Link href={ctaHref}>
            <Button>Back to app</Button>
          </Link>
        )}
      </div>
    </Layout>
  );
}

/**
 * Wraps any admin page. Renders children only when the viewer is signed in,
 * has `isAdmin=true`, is on the email allowlist, and has a non-expired
 * admin-panel session cookie. Otherwise renders the appropriate gate UI:
 * "Not authorized" for non-admins / non-whitelisted, and an access-code
 * prompt for whitelisted admins without an unlocked session.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useAdminSession();
  if (isLoading || !data) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Loading admin panel…
        </div>
      </Layout>
    );
  }
  if (!data.isAdmin || !data.whitelisted) {
    return (
      <DeniedScreen
        title="Not authorized"
        body="Your account is not permitted to access the admin panel."
        ctaHref="/"
      />
    );
  }
  if (!data.unlocked) {
    return <UnlockPrompt status={data} />;
  }
  return <>{children}</>;
}
