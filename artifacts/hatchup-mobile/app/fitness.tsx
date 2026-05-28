import { Feather } from "@expo/vector-icons";
import { useGetFitnessStats, useGetActiveQuests, useGetTodayGoals } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

function GoalBar({ label, current, target, color, icon }: {
  label: string; current: number; target: number; color: string; icon: string;
}) {
  const colors = useColors();
  const pct = Math.min(1, current / Math.max(target, 1));
  return (
    <View style={styles.goalRow}>
      <View style={[styles.goalIconBg, { backgroundColor: color + "22" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.goalHeader}>
          <Text style={[styles.goalLabel, { color: colors.foreground }]}>{label}</Text>
          <Text style={[styles.goalValue, { color: colors.mutedForeground }]}>
            {current.toLocaleString()} / {target.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.goalTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.goalFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
        </View>
      </View>
      <Text style={[styles.goalPct, { color: color }]}>{Math.round(pct * 100)}%</Text>
    </View>
  );
}

export default function FitnessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const PLAYER_ID = 1;
  const { data: stats, isLoading: loadStats } = useGetFitnessStats(PLAYER_ID);
  const { data: quests, isLoading: loadQuests } = useGetActiveQuests(PLAYER_ID);
  const { data: goals } = useGetTodayGoals();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Fitness</Text>
        <View style={{ width: 34 }} />
      </View>

      {loadStats ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Today's Goals */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Today's Goals</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <GoalBar
              label="Steps"
              current={stats?.todaySteps ?? 0}
              target={goals?.goals.steps ?? 10000}
              color="#22c55e"
              icon="activity"
            />
            <GoalBar
              label="Workouts"
              current={goals?.progress.workouts ?? 0}
              target={goals?.goals.workouts ?? 1}
              color="#f59e0b"
              icon="heart"
            />
            <GoalBar
              label="Active Min"
              current={goals?.progress.steps ?? 0}
              target={goals?.goals.durationMin ?? 30}
              color="#3b82f6"
              icon="clock"
            />
          </View>

          {/* Stats Overview */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>This Week</Text>
          <View style={styles.statsGrid}>
            {[
              { label: "Total Steps", value: (stats?.totalSteps ?? 0).toLocaleString(), icon: "activity", color: "#22c55e" },
              { label: "Workouts", value: String(stats?.totalWorkouts ?? 0), icon: "heart", color: "#ef4444" },
              { label: "Fitness XP", value: (stats?.fitnessXp ?? 0).toLocaleString(), icon: "zap", color: "#f59e0b" },
              { label: "Streak", value: `${stats?.currentStreak ?? 0}d`, icon: "trending-up", color: "#a855f7" },
            ].map((s) => (
              <View key={s.label} style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "22" }]}>
                  <Feather name={s.icon as any} size={16} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Active Quests */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Quests</Text>
          {loadQuests ? (
            <ActivityIndicator color={colors.primary} />
          ) : (quests?.length ?? 0) === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="flag" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active quests</Text>
            </View>
          ) : (
            (quests ?? []).map((q) => {
              const progress = Math.min(1, (q.currentValue ?? 0) / Math.max(q.targetValue ?? 1, 1));
              return (
                <View key={q.id} style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.questHeader}>
                    <Text style={[styles.questTitle, { color: colors.foreground }]}>{q.title}</Text>
                    <Text style={[styles.questReward, { color: colors.primary }]}>+{q.xpReward} XP</Text>
                  </View>
                  <Text style={[styles.questDesc, { color: colors.mutedForeground }]}>{q.description}</Text>
                  <View style={[styles.questTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.questFill, { width: `${progress * 100}%` as any, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.questProgress, { color: colors.mutedForeground }]}>
                    {q.currentValue ?? 0} / {q.targetValue ?? 0}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10, marginTop: 4 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 14, marginBottom: 14 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  goalIconBg: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  goalHeader: { flexDirection: "row", justifyContent: "space-between" },
  goalLabel: { fontSize: 13, fontWeight: "600" },
  goalValue: { fontSize: 12 },
  goalTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  goalFill: { height: 6, borderRadius: 3 },
  goalPct: { width: 34, fontSize: 12, fontWeight: "700", textAlign: "right" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  statTile: { width: "47%", flexGrow: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 4, alignItems: "center" },
  statIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, textAlign: "center" },
  questCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6, marginBottom: 8 },
  questHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  questTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  questReward: { fontSize: 13, fontWeight: "700" },
  questDesc: { fontSize: 12 },
  questTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  questFill: { height: 4, borderRadius: 2 },
  questProgress: { fontSize: 11 },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13 },
});
