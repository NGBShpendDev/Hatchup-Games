import { Feather } from "@expo/vector-icons";
import {
  useListCompetitions,
  useListGameModes,
  useSubmitCompetitionResult,
  useGetPlayer,
  useGetHatchling,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { usePalMilestoneShare } from "@/hooks/usePalMilestoneShare";

const PLAYER_ID = 1;

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  pending: "#f59e0b",
  completed: "#9ca3af",
};

export default function CompeteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "completed">("active");

  const { data: gameModes, isLoading: loadingModes } = useListGameModes();
  const { data: competitions, isLoading: loadingComps, refetch } = useListCompetitions({
    status: statusFilter,
    limit: 20,
  });

  const submitResult = useSubmitCompetitionResult();
  const shareMilestone = usePalMilestoneShare();

  const { data: player } = useGetPlayer(PLAYER_ID);
  const activePalId = player?.activeHatchlingId ?? 0;
  const { data: activePal } = useGetHatchling(activePalId);

  function handleSubmitResult(competitionId: number) {
    submitResult.mutate(
      {
        id: competitionId,
        data: { score: 100, duration: 300, rank: 1, playerId: PLAYER_ID },
      },
      {
        onSuccess: async (result) => {
          await refetch();
          if (result?.hatchlingEvolutionSharePrompt) {
            const palXpLike = {
              evolutionSharePrompt: result.hatchlingEvolutionSharePrompt,
              newLevel: result.hatchlingNewLevel,
              hatchlingId: result.hatchlingId,
            };
            await shareMilestone(palXpLike, activePal?.name ?? result.hatchlingName);
          }
        },
      },
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Battle</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/leaderboard")}
            style={[styles.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="award" size={14} color="#f59e0b" />
            <Text style={[styles.headerBtnText, { color: "#f59e0b" }]}>Ranks</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/events")}
            style={[styles.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="calendar" size={14} color="#6366f1" />
            <Text style={[styles.headerBtnText, { color: "#6366f1" }]}>Events</Text>
          </Pressable>
        </View>
      </View>

      {/* Game Modes */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Game Modes</Text>
      {loadingModes ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : (
        <FlatList
          horizontal
          data={gameModes ?? []}
          keyExtractor={(m) => String(m.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modesRow}
          scrollEnabled={!!(gameModes && gameModes.length > 0)}
          renderItem={({ item: mode }) => {
            const isLive = mode.isLive === true;
            return (
              <Pressable style={[styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.modeIconBg, { backgroundColor: colors.primary + "22" }]}>
                  <Feather name="zap" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.modeName, { color: colors.foreground }]} numberOfLines={1}>{mode.name}</Text>
                {isLive && <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />}
              </Pressable>
            );
          }}
        />
      )}

      {/* Status Filter */}
      <View style={styles.filterRow}>
        {(["active", "pending", "completed"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setStatusFilter(s)}
            style={[styles.filterPill, {
              backgroundColor: statusFilter === s ? colors.primary : colors.card,
              borderColor: statusFilter === s ? colors.primary : colors.border,
            }]}
          >
            <Text style={[styles.filterText, { color: statusFilter === s ? "#fff" : colors.mutedForeground }]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Competitions */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Competitions</Text>
      {loadingComps ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : (competitions?.length ?? 0) === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="calendar" size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No {statusFilter} competitions</Text>
        </View>
      ) : (
        (competitions ?? []).map((comp) => {
          const statusColor = STATUS_COLORS[comp.status ?? "pending"] ?? colors.mutedForeground;
          const isSubmitting = submitResult.isPending && submitResult.variables?.id === comp.id;
          return (
            <View key={comp.id} style={[styles.compCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.compHeader}>
                <View style={styles.compTitleRow}>
                  <Text style={[styles.compMode, { color: colors.foreground }]}>{comp.mode}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {(comp.status ?? "pending").charAt(0).toUpperCase() + (comp.status ?? "pending").slice(1)}
                    </Text>
                  </View>
                </View>
                <View style={styles.compMeta}>
                  <Feather name="award" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.compMetaText, { color: colors.mutedForeground }]}>
                    Rank: {comp.rank ?? "—"} · Score: {comp.score ?? 0}
                  </Text>
                </View>
              </View>
              {comp.status === "active" && (
                <Pressable
                  onPress={() => handleSubmitResult(comp.id)}
                  disabled={isSubmitting}
                  style={[styles.submitBtn, { borderColor: "#22c55e" }, isSubmitting && styles.submitBtnDisabled]}
                  testID={`button-submit-result-${comp.id}`}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#22c55e" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={14} color="#22c55e" />
                      <Text style={[styles.submitBtnText, { color: "#22c55e" }]}>Submit Result</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginBottom: 8 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  headerBtnText: { fontSize: 12, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },
  modesRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  modeCard: { width: 100, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 8, position: "relative" },
  modeIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modeName: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  liveDot: { position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 4 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginVertical: 14 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: "600" },
  emptyCard: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 28, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontWeight: "500" },
  compCard: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 10 },
  compHeader: { gap: 6 },
  compTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  compMode: { fontSize: 15, fontWeight: "700" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },
  compMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  compMetaText: { fontSize: 12 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 9, borderWidth: 1.5 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 13, fontWeight: "700" },
});
