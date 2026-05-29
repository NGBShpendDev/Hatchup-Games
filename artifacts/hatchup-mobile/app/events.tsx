import { Feather } from "@expo/vector-icons";
import { useListEvents, useJoinLiveEvent, useGetPlayer, useGetHatchling } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useCurrentPlayerId } from "@/providers/CurrentPlayerProvider";
import { usePalMilestoneShare } from "@/hooks/usePalMilestoneShare";


export default function EventsScreen() {
  const PLAYER_ID = useCurrentPlayerId();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: events, isLoading } = useListEvents();
  const joinMutation = useJoinLiveEvent();
  const shareMilestone = usePalMilestoneShare();

  const { data: player } = useGetPlayer(PLAYER_ID);
  const activePalId = player?.activeHatchlingId ?? 0;
  const { data: activePal } = useGetHatchling(activePalId);

  const liveEvent = (events ?? []).find((e) => e.status === "live" || e.status === "active");
  const upcoming = (events ?? []).filter((e) => e.status !== "ended" && e.status !== "live" && e.status !== "active");
  const past = (events ?? []).filter((e) => e.status === "ended").slice(0, 5);

  function handleJoin(eventId: number) {
    joinMutation.mutate(
      { id: eventId },
      {
        onSuccess: async (result) => {
          if (result?.palXpResult) {
            await shareMilestone(result.palXpResult, activePal?.name);
          }
        },
      },
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Events</Text>
        <View style={{ width: 34 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[
            ...(liveEvent ? [{ type: "live", event: liveEvent }] : []),
            ...upcoming.map((e) => ({ type: "upcoming", event: e })),
            ...(past.length > 0 ? [{ type: "sectionPast" }] : []),
            ...past.map((e) => ({ type: "past", event: e })),
          ]}
          keyExtractor={(item, i) => {
            if ("event" in item) return `${item.type}-${item.event.id}`;
            return `section-${i}`;
          }}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="calendar" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No events right now</Text>
            </View>
          }
          renderItem={({ item }) => {
            if ("type" in item && item.type === "sectionPast") {
              return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Past Events</Text>;
            }
            if (!("event" in item)) return null;
            const ev = item.event;
            const isLive = item.type === "live";
            const isPast = item.type === "past";
            const isJoining = joinMutation.isPending && joinMutation.variables?.id === ev.id;
            return (
              <View style={[styles.eventCard, { backgroundColor: colors.card, borderColor: isLive ? colors.primary : colors.border }]}>
                {isLive && (
                  <View style={[styles.liveBadge, { backgroundColor: colors.primary }]}>
                    <View style={[styles.liveDot, { backgroundColor: "#fff" }]} />
                    <Text style={styles.liveText}>LIVE NOW</Text>
                  </View>
                )}
                <Text style={[styles.eventName, { color: colors.foreground }]}>{ev.name}</Text>
                <Text style={[styles.eventDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {ev.description}
                </Text>
                <View style={styles.eventMeta}>
                  {ev.rewardXp && (
                    <View style={styles.metaChip}>
                      <Feather name="zap" size={11} color={colors.primary} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>+{ev.rewardXp} XP</Text>
                    </View>
                  )}
                  {ev.endTime && (
                    <View style={styles.metaChip}>
                      <Feather name="clock" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {new Date(ev.endTime).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                </View>
                {!isPast && (
                  <Pressable
                    onPress={() => handleJoin(ev.id)}
                    disabled={isJoining}
                    style={[
                      styles.joinBtn,
                      { backgroundColor: isLive ? colors.primary : colors.card, borderColor: colors.primary },
                      isJoining && styles.joinBtnDisabled,
                    ]}
                  >
                    {isJoining ? (
                      <ActivityIndicator size="small" color={isLive ? "#fff" : colors.primary} />
                    ) : (
                      <Text style={[styles.joinText, { color: isLive ? "#fff" : colors.primary }]}>
                        {isLive ? "Join Now" : "View Event"}
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginVertical: 10 },
  eventCard: { borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 12, gap: 8 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  eventName: { fontSize: 16, fontWeight: "700" },
  eventDesc: { fontSize: 13, lineHeight: 18 },
  eventMeta: { flexDirection: "row", gap: 12 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11 },
  joinBtn: { borderRadius: 10, paddingVertical: 9, alignItems: "center", borderWidth: 1.5, marginTop: 4 },
  joinBtnDisabled: { opacity: 0.6 },
  joinText: { fontSize: 13, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 14 },
});
