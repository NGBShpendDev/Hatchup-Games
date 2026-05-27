import { Layout } from "@/components/layout";
import { PLAYER_ID } from "@/lib/constants";
import { HatchlingCard } from "@/components/hatchling-card";
import { useListHatchlings, getListHatchlingsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Hatchlings() {
  const { data: hatchlings, isLoading } = useListHatchlings(
    { playerId: PLAYER_ID },
    { query: { enabled: true, queryKey: getListHatchlingsQueryKey({ playerId: PLAYER_ID }) } }
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-primary">My Hatchlings</h1>
            <p className="text-muted-foreground font-medium mt-1">Manage, train, and evolve your creatures.</p>
          </div>
          <Link href="/hatch">
            <Button size="lg" variant="secondary" className="font-bold active-elevate">Hatch New</Button>
          </Link>
        </div>

        {isLoading ? (
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
          <div className="text-center p-16 bg-card rounded-3xl border-4 border-dashed border-border mt-10">
            <h2 className="text-2xl font-black mb-4">No Hatchlings Yet!</h2>
            <p className="text-muted-foreground mb-8">Start your journey by hatching your first creature.</p>
            <Link href="/hatch">
              <Button size="lg" className="font-bold text-lg px-8 active-elevate">Hatch Now</Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
