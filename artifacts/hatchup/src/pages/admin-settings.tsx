import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AdminGate, AdminSessionChip, useAdminSession } from "@/components/admin-gate";
import { Settings, Mail, KeyRound, Users, ArrowLeft, Trash2, Copy, Clock } from "lucide-react";

interface AllowlistEntry {
  id: number;
  email: string;
  addedByAdminId: number | null;
  createdAt: string;
}

interface AdminRow {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

function AllowlistSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AllowlistEntry[]>({
    queryKey: ["admin-allowlist"],
    queryFn: async () => {
      const res = await fetch("/api/admin/allowlist", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const [email, setEmail] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/allowlist", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
    },
    onSuccess: () => {
      setEmail("");
      toast({ title: "Email added to allowlist" });
      qc.invalidateQueries({ queryKey: ["admin-allowlist"] });
    },
    onError: (err: Error) => toast({ title: "Add failed", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/allowlist/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => {
      toast({ title: "Email removed from allowlist" });
      qc.invalidateQueries({ queryKey: ["admin-allowlist"] });
    },
  });
  return (
    <GlassCard className="p-5 space-y-4" data-testid="section-allowlist">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-red-300" />
        <h2 className="font-black text-base">Allowlist</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Only emails on this list can pass the admin gate, even if their player row has admin enabled.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="email@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="input-allowlist-email"
        />
        <Button onClick={() => add.mutate()} disabled={!email || add.isPending} data-testid="button-allowlist-add">
          Add
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <ul className="divide-y divide-border/40">
          {(data ?? []).map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between py-2 text-sm"
              data-testid={`row-allowlist-${row.id}`}
            >
              <span className="font-medium">{row.email}</span>
              <button
                onClick={() => {
                  if (confirm(`Remove ${row.email} from the allowlist?`)) remove.mutate(row.id);
                }}
                className="text-red-300 hover:text-red-200"
                aria-label="Remove"
                data-testid={`button-allowlist-remove-${row.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(!data || data.length === 0) && (
            <li className="py-4 text-xs text-muted-foreground text-center">No emails on the allowlist yet.</li>
          )}
        </ul>
      )}
    </GlassCard>
  );
}

function AccessCodeSection() {
  const { toast } = useToast();
  const [newCode, setNewCode] = useState<string | null>(null);
  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/access-code/rotate", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("rotate_failed");
      return (await res.json()) as { code: string };
    },
    onSuccess: (data) => {
      setNewCode(data.code);
      toast({ title: "Access code rotated", description: "Share the new code with your admins." });
    },
    onError: () => toast({ title: "Rotate failed", variant: "destructive" }),
  });
  return (
    <GlassCard className="p-5 space-y-4" data-testid="section-access-code">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-red-300" />
        <h2 className="font-black text-base">Access code</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Rotating replaces the active code. After rotation, every unlocked admin session continues until it
        expires, but the next unlock requires the new code. The new code is shown <strong>once</strong>.
      </p>
      <Button
        variant="destructive"
        onClick={() => {
          if (confirm("Rotate the admin access code? The old code stops working immediately.")) {
            rotate.mutate();
          }
        }}
        disabled={rotate.isPending}
        data-testid="button-rotate-code"
      >
        {rotate.isPending ? "Rotating…" : "Rotate access code"}
      </Button>
      {newCode && (
        <div
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
          data-testid="block-new-code"
        >
          <p className="text-xs font-bold text-amber-200 uppercase tracking-wide">New access code</p>
          <p className="font-mono text-2xl tracking-widest text-center" data-testid="text-new-code">
            {newCode}
          </p>
          <p className="text-[11px] text-amber-100/80">
            Copy this now — it will not be shown again. If lost, rotate the code again from this page.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(newCode).then(() => {
                toast({ title: "Copied to clipboard" });
              });
            }}
            data-testid="button-copy-code"
          >
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

function AdminsSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AdminRow[]>({
    queryKey: ["admin-players"],
    queryFn: async () => {
      const res = await fetch("/api/admin/players", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const update = useMutation({
    mutationFn: async (vars: { playerId: number; isAdmin?: boolean; isSuperAdmin?: boolean }) => {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
    },
    onSuccess: () => {
      toast({ title: "Admin role updated" });
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });
  return (
    <GlassCard className="p-5 space-y-4" data-testid="section-admins">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-red-300" />
        <h2 className="font-black text-base">Admins</h2>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="divide-y divide-border/40">
          {(data ?? []).map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between py-2 gap-3"
              data-testid={`row-admin-${row.id}`}
            >
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">@{row.username}</p>
                <p className="text-[11px] text-muted-foreground truncate">{row.email ?? "(no email)"}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={row.isSuperAdmin ? "default" : "secondary"}
                  onClick={() => update.mutate({ playerId: row.id, isSuperAdmin: !row.isSuperAdmin })}
                  data-testid={`button-toggle-super-${row.id}`}
                >
                  {row.isSuperAdmin ? "Demote super" : "Promote super"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Revoke admin from @${row.username}?`)) {
                      update.mutate({ playerId: row.id, isAdmin: false });
                    }
                  }}
                  data-testid={`button-revoke-admin-${row.id}`}
                >
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

interface AdminSessionRow {
  id: number;
  playerId: number;
  username: string | null;
  displayName: string | null;
  ip: string | null;
  userAgent: string | null;
  unlockedAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RecentSessionsSection() {
  const { data, isLoading } = useQuery<AdminSessionRow[]>({
    queryKey: ["admin-sessions-recent"],
    queryFn: async () => {
      const res = await fetch("/api/admin/sessions/recent", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30_000,
  });
  return (
    <GlassCard className="p-5 space-y-4" data-testid="section-recent-sessions">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-red-300" />
        <h2 className="font-black text-base">Recent unlocks</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        The last 50 admin-panel unlocks. Use this to audit who has been inside the panel and from where.
      </p>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="divide-y divide-border/40">
          {(data ?? []).map((row) => (
            <li
              key={row.id}
              className="py-2 flex items-start justify-between gap-3 text-sm"
              data-testid={`row-session-${row.id}`}
            >
              <div className="min-w-0">
                <p className="font-bold truncate">
                  @{row.username ?? `player-${row.playerId}`}
                  {row.active && (
                    <span className="ml-2 inline-block rounded-full bg-green-500/20 text-green-200 text-[10px] px-2 py-0.5 align-middle">
                      active
                    </span>
                  )}
                  {row.revokedAt && (
                    <span className="ml-2 inline-block rounded-full bg-muted text-muted-foreground text-[10px] px-2 py-0.5 align-middle">
                      locked
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {formatRelative(row.unlockedAt)} · {row.ip ?? "ip unknown"}
                </p>
                {row.userAgent && (
                  <p className="text-[10px] text-muted-foreground/70 truncate" title={row.userAgent}>
                    {row.userAgent}
                  </p>
                )}
              </div>
              <div className="text-right text-[11px] text-muted-foreground shrink-0">
                <p>expires {formatRelative(row.expiresAt)}</p>
                {row.lastSeenAt && <p>seen {formatRelative(row.lastSeenAt)}</p>}
              </div>
            </li>
          ))}
          {(!data || data.length === 0) && (
            <li className="py-4 text-xs text-muted-foreground text-center">No admin unlocks yet.</li>
          )}
        </ul>
      )}
    </GlassCard>
  );
}

function AdminSettingsInner() {
  const session = useAdminSession();
  if (!session.data?.isSuperAdmin) {
    return (
      <Layout>
        <div className="max-w-md mx-auto pt-10 text-center space-y-4">
          <h1 className="font-black text-2xl">Super-admin only</h1>
          <p className="text-sm text-muted-foreground">Admin settings are restricted to super-admins.</p>
          <Link href="/admin">
            <Button variant="secondary">Back to admin panel</Button>
          </Link>
        </div>
      </Layout>
    );
  }
  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 space-y-6">
        <div className="flex items-center gap-3 pt-2">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <Settings className="w-5 h-5 text-red-300" />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-2xl">Admin settings</h1>
            <p className="text-xs text-muted-foreground">Allowlist, code rotation, and admin roles.</p>
          </div>
          <AdminSessionChip />
        </div>
        <AllowlistSection />
        <AccessCodeSection />
        <AdminsSection />
        <RecentSessionsSection />
      </div>
    </Layout>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminGate>
      <AdminSettingsInner />
    </AdminGate>
  );
}
