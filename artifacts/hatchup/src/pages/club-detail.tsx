import { Link, useRoute } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetClub,
  getGetClubQueryKey,
  useListClubMembers,
  getListClubMembersQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Crown, Shield, ShieldCheck, Trophy, Users } from "lucide-react";
import { motion } from "framer-motion";

function roleStyle(role: string | null | undefined) {
  if (role === "owner") {
    return {
      icon: <Crown className="w-3.5 h-3.5" />,
      label: "Owner",
      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    };
  }
  if (role === "officer") {
    return {
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      label: "Officer",
      className: "bg-blue-500/15 text-blue-400 border-blue-500/40",
    };
  }
  return null;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function ClubDetail() {
  const [, params] = useRoute("/clubs/:id");
  const id = Number(params?.id);

  const { data: club, isLoading: clubLoading } = useGetClub(id, {
    query: { queryKey: getGetClubQueryKey(id), enabled: Number.isFinite(id) },
  });
  const { data: members, isLoading: membersLoading } = useListClubMembers(id, {
    query: { queryKey: getListClubMembersQueryKey(id), enabled: Number.isFinite(id) },
  });

  const sortedMembers = [...(members ?? [])].sort((a, b) => {
    const rank = (r: string | null | undefined) => (r === "owner" ? 0 : r === "officer" ? 1 : 2);
    const diff = rank(a.clubRole) - rank(b.clubRole);
    if (diff !== 0) return diff;
    return b.level - a.level;
  });

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <Link href="/club">
          <a className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Club Hub
          </a>
        </Link>

        {clubLoading || !club ? (
          <Skeleton className="h-40 w-full rounded-3xl" />
        ) : (
          <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="w-8 h-8 text-primary" />
                  <h1 className="text-4xl font-black tracking-tight">{club.name}</h1>
                  <Badge variant="secondary" className="font-bold uppercase">{club.rank}</Badge>
                </div>
                <p className="text-muted-foreground font-medium max-w-2xl">{club.description}</p>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center text-blue-500 font-bold">
                    <Users className="w-4 h-4" />
                    <span className="text-2xl">{club.memberCount}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Members</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center text-green-500 font-bold">
                    <Trophy className="w-4 h-4" />
                    <span className="text-2xl">{club.totalXp.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Total XP</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Members
          </h2>

          {membersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : sortedMembers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground font-medium">
                No members in this club yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedMembers.map((member, index) => {
                const role = roleStyle(member.clubRole);
                const name = member.displayName || member.username;
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Link href={`/players/${member.id}`}>
                      <a className="block">
                        <Card className="hover:border-primary transition-colors border-2 cursor-pointer">
                          <CardContent className="p-4 flex items-center gap-4">
                            <Avatar className="h-12 w-12 border-2 border-border">
                              {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={name} />}
                              <AvatarFallback className="font-bold">{initials(name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold truncate">{name}</span>
                                {role && (
                                  <Badge variant="outline" className={`gap-1 font-bold uppercase text-[10px] ${role.className}`}>
                                    {role.icon}
                                    {role.label}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground font-bold mt-1">
                                <span>Lvl {member.level}</span>
                                <span>•</span>
                                <span>{member.rank}</span>
                                <span>•</span>
                                <span>{member.totalWins} wins</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </a>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
