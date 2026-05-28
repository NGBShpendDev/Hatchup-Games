import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { GlassCard } from "@/components/ui/glass-card";
import { AdminGate, AdminSessionChip, useAdminSession } from "@/components/admin-gate";
import { Flag, Ban, ScrollText, Settings, MessageSquareWarning, Shield } from "lucide-react";

interface HubCounts {
  openReports: number;
  pendingAppeals: number;
  suspendedUsers: number;
}

function ToolCard({
  href,
  icon: Icon,
  title,
  description,
  badge,
  testId,
}: {
  href: string;
  icon: typeof Flag;
  title: string;
  description: string;
  badge?: number | null;
  testId: string;
}) {
  return (
    <Link href={href}>
      <a className="block" data-testid={testId}>
        <GlassCard className="p-5 h-full hover:bg-white/[0.04] transition-colors">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shrink-0">
              <Icon className="w-5 h-5 text-red-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-base">{title}</h3>
                {badge != null && badge > 0 && (
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white"
                    data-testid={`${testId}-badge`}
                  >
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
        </GlassCard>
      </a>
    </Link>
  );
}

function AdminHubInner() {
  const session = useAdminSession();
  const { data: counts } = useQuery<HubCounts>({
    queryKey: ["admin-hub-counts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/hub/counts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });
  const isSuperAdmin = !!session.data?.isSuperAdmin;
  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 space-y-6">
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <Shield className="w-5 h-5 text-red-300" />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-2xl">Admin panel</h1>
            <p className="text-xs text-muted-foreground font-medium">
              Tools for keeping HatchUp safe.
            </p>
          </div>
          <AdminSessionChip />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ToolCard
            href="/admin/reports"
            icon={Flag}
            title="Reports"
            description="Review user reports of inappropriate content, harassment, and meetups."
            badge={counts?.openReports}
            testId="link-tool-reports"
          />
          <ToolCard
            href="/admin/reports"
            icon={MessageSquareWarning}
            title="Deleted & frozen posts"
            description="Restore or purge recently removed posts. Unfreeze posts that were flagged."
            testId="link-tool-deleted"
          />
          <ToolCard
            href="/admin/reports"
            icon={ScrollText}
            title="Appeals"
            description="Review and resolve suspension appeals submitted by players."
            badge={counts?.pendingAppeals}
            testId="link-tool-appeals"
          />
          <ToolCard
            href="/admin/suspended"
            icon={Ban}
            title="Suspended users"
            description="Reinstate accounts that have served their suspension."
            badge={counts?.suspendedUsers}
            testId="link-tool-suspended"
          />
          <ToolCard
            href="/admin/audit"
            icon={ScrollText}
            title="Audit log"
            description="Every moderation action, who took it, and when. Undo recent actions."
            testId="link-tool-audit"
          />
          {isSuperAdmin && (
            <ToolCard
              href="/admin/settings"
              icon={Settings}
              title="Admin settings"
              description="Manage allowlist, rotate the access code, promote and demote admins."
              testId="link-tool-settings"
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

export default function AdminHubPage() {
  return (
    <AdminGate>
      <AdminHubInner />
    </AdminGate>
  );
}
