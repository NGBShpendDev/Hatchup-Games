import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListClubs, getListClubsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Shield, Users, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { ErrorCard } from "@/components/error-card";

export default function ClubHub() {
  const { data: clubs, isLoading, isError, refetch } = useListClubs(
    { limit: 20 },
    { query: { queryKey: getListClubsQueryKey({ limit: 20 }) } }
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <GlassCard glow="primary" className="flex flex-col md:flex-row justify-between items-center gap-6 p-8">
          <div className="relative z-10">
            <h1 className="text-4xl font-black tracking-tight flex items-center gap-3 mb-2">
              <Shield className="text-primary w-8 h-8" /> Club Hub
            </h1>
            <p className="text-muted-foreground font-medium">Join a club to compete in team events and earn shared rewards.</p>
          </div>
          <NeonButton size="lg" className="relative z-10 shrink-0">Create Club</NeonButton>
        </GlassCard>

        {isError && !clubs ? (
          <ErrorCard title="Couldn't load clubs" onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubs?.map((club, index) => (
              <motion.div
                key={club.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/clubs/${club.id}`}>
                  <a className="block h-full">
                    <GlassCard interactive glow="primary" className="group h-full flex flex-col p-6">
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-2">
                          <h2 className="text-2xl font-black group-hover:text-primary transition-colors">{club.name}</h2>
                          <GlowBadge tone="primary">{club.rank}</GlowBadge>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium mb-6 line-clamp-2 flex-1">{club.description}</p>

                        <div className="flex justify-between items-center pt-4 border-t border-white/10 mt-auto">
                          <div className="flex items-center gap-2 text-sm font-bold">
                            <Users className="w-4 h-4 text-blue-500" />
                            <span>{club.memberCount} / {club.maxMembers || 50}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-bold text-green-500">
                            <Trophy className="w-4 h-4" />
                            <span>{club.totalXp.toLocaleString()} XP</span>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </a>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
