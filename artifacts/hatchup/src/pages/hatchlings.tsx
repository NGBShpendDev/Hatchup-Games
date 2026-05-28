import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { HatchlingCard } from "@/components/hatchling-card";
import { useListHatchlings, getListHatchlingsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { ErrorCard } from "@/components/error-card";

export default function Hatchlings() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { data: hatchlings, isLoading, isError, refetch } = useListHatchlings(
    { playerId: pid },
    { query: { enabled: !!playerId, queryKey: getListHatchlingsQueryKey({ playerId: pid }) } }
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-primary">My Pals</h1>
            <p className="text-muted-foreground font-medium mt-1">Manage, train, and evolve your Fitness Pals.</p>
          </div>
          <Link href="/hatch">
            <NeonButton variant="secondary" size="md">Hatch a Pal</NeonButton>
          </Link>
        </div>

        {isError && !hatchlings ? (
          <ErrorCard
            title="Couldn't load your Pals"
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
        ) : hatchlings && hatchlings.length > 0 ? (
          <motion.div 
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.1 }
              }
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {hatchlings.map((hatchling) => (
              <motion.div key={hatchling.id} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
                <HatchlingCard hatchling={hatchling} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <GlassCard glow="primary" className="text-center p-16 mt-10">
            <h2 className="text-2xl font-black mb-4">No Pals Yet!</h2>
            <p className="text-muted-foreground mb-8">Start your journey by hatching your first Fitness Pal.</p>
            <Link href="/hatch">
              <NeonButton variant="primary" size="lg">Hatch Your First Pal</NeonButton>
            </Link>
          </GlassCard>
        )}
      </div>
    </Layout>
  );
}
