import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListClubs, getListClubsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Users, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function ClubHub() {
  const { data: clubs, isLoading } = useListClubs(
    { limit: 20 },
    { query: { queryKey: getListClubsQueryKey({ limit: 20 }) } }
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-card border border-border p-8 rounded-3xl shadow-sm">
          <div>
            <h1 className="text-4xl font-black tracking-tight flex items-center gap-3 mb-2">
              <Shield className="text-primary w-8 h-8" /> Club Hub
            </h1>
            <p className="text-muted-foreground font-medium">Join a club to compete in team events and earn shared rewards.</p>
          </div>
          <Button size="lg" className="font-bold px-8 active-elevate shrink-0">Create Club</Button>
        </div>

        {isLoading ? (
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
                <Card className="hover:border-primary transition-colors border-2 cursor-pointer group h-full flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-2xl font-black group-hover:text-primary transition-colors">{club.name}</CardTitle>
                      <Badge variant="secondary" className="font-bold uppercase">{club.rank}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <p className="text-sm text-muted-foreground font-medium mb-6 line-clamp-2 flex-1">{club.description}</p>
                    
                    <div className="flex justify-between items-center pt-4 border-t border-border mt-auto">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Users className="w-4 h-4 text-blue-500" />
                        <span>{club.memberCount} / {club.maxMembers || 50}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold text-green-500">
                        <Trophy className="w-4 h-4" />
                        <span>{club.totalXp.toLocaleString()} XP</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
