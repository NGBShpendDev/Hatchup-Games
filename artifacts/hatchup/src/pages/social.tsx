import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useGetGlobalLeaderboard,
  getGetGlobalLeaderboardQueryKey,
  useListEvents,
  getListEventsQueryKey,
  useListClubs,
  getListClubsQueryKey,
  useListCompetitions,
  getListCompetitionsQueryKey
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Calendar, Users, Swords, MoreVertical } from "lucide-react";
import { motion } from "framer-motion";
import { ReportBlockMenu } from "@/components/report-block-menu";
import { SafetyBanner } from "@/components/safety-banner";

export default function Social() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useGetGlobalLeaderboard(
    { limit: 10 },
    { query: { queryKey: getGetGlobalLeaderboardQueryKey({ limit: 10 }) } }
  );

  const { data: events, isLoading: isLoadingEvents } = useListEvents(
    {},
    { query: { queryKey: getListEventsQueryKey({}) } }
  );

  const { data: clubs, isLoading: isLoadingClubs } = useListClubs(
    { limit: 10 },
    { query: { queryKey: getListClubsQueryKey({ limit: 10 }) } }
  );

  const hasActiveEvent = events?.some(e => e.status === "active");

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div className="text-center max-w-2xl mx-auto py-8">
          <h1 className="text-5xl font-black tracking-tight text-primary mb-4 flex items-center justify-center gap-3">
            <Users className="w-10 h-10" /> Community
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Compete, collaborate, and connect with players around the globe.
          </p>
        </div>

        <Tabs defaultValue="leaderboard" className="w-full">
          <TabsList className="w-full grid grid-cols-4 bg-muted/50 p-1 rounded-2xl mb-8">
            <TabsTrigger value="leaderboard" className="rounded-xl font-bold">Leaderboard</TabsTrigger>
            <TabsTrigger value="events" className="rounded-xl font-bold">Events</TabsTrigger>
            <TabsTrigger value="clubs" className="rounded-xl font-bold">Clubs</TabsTrigger>
            <TabsTrigger value="competitions" className="rounded-xl font-bold">Matches</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard" className="space-y-4">
            <div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-border">
              {isLoadingLeaderboard ? (
                <div className="p-4 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {leaderboard?.map((entry, index) => (
                    <div key={entry.playerId} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <div className="w-8 text-center font-black text-xl text-muted-foreground">
                        {entry.position === 1 ? "🥇" : entry.position === 2 ? "🥈" : entry.position === 3 ? "🥉" : `#${entry.position}`}
                      </div>
                      <Avatar className="h-12 w-12 border border-border">
                        <AvatarImage src={entry.avatarUrl || undefined} />
                        <AvatarFallback className="font-bold">{entry.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-bold text-lg leading-tight">{entry.displayName || entry.username}</p>
                        <p className="text-xs font-bold text-muted-foreground uppercase">{entry.rank}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-xl">{entry.score}</div>
                        <div className="text-xs text-green-500 font-bold">{entry.wins} Wins</div>
                      </div>
                      {entry.playerId !== pid && (
                        <ReportBlockMenu
                          trigger={
                            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          }
                          targetPlayerId={entry.playerId}
                          targetName={entry.displayName ?? entry.username}
                          contentType="profile"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="events">
            {hasActiveEvent && <div className="mb-4"><SafetyBanner variant="event" compact /></div>}
            {isLoadingEvents ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
              </div>
            ) : (
              <div className="space-y-6">
                {events?.map((event) => (
                  <Card key={event.id} className="overflow-hidden border-2">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-black mb-1">{event.name}</h3>
                          <p className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> {new Date(event.startsAt).toLocaleDateString()}
                          </p>
                        </div>
                        {event.status === "active" && (
                          <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground font-medium mb-4">{event.description}</p>
                      {event.status === "active" && (
                        <p className="text-xs text-amber-400 font-bold mb-4">
                          🛡️ Meet in public locations only. Use caution when meeting new people.
                        </p>
                      )}
                      <Button className="w-full font-bold active-elevate" variant={event.status === "active" ? "default" : "secondary"}>
                        {event.status === "active" ? "Join Event" : "Starts Soon"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="clubs">
            {isLoadingClubs ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {clubs?.map((club) => (
                  <Card key={club.id} className="border-2 hover:border-primary/50 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-black">{club.name}</h3>
                        <Badge variant="secondary">Lvl {club.level}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-medium mb-4 line-clamp-2">{club.description}</p>
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="flex items-center gap-1 text-blue-500"><Users className="w-4 h-4" /> {club.memberCount}/{club.maxMembers}</span>
                        <span className="flex items-center gap-1 text-green-500"><Trophy className="w-4 h-4" /> {club.totalWins} Wins</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="competitions">
            <div className="text-center py-12 bg-card rounded-3xl border-2 border-dashed">
              <Swords className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-2xl font-black mb-2">Live Matches</h3>
              <p className="text-muted-foreground font-medium max-w-md mx-auto mb-6">
                Recent competition results and live matches will appear here.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
