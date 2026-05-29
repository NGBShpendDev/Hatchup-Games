import { Feather } from "@expo/vector-icons";
import { useGetWorkoutPlan, useGetMealPlan, useLogWorkoutSession, useGetPlayer, useGetHatchling } from "@workspace/api-client-react";
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
import { useCurrentPlayerId } from "@/providers/CurrentPlayerProvider";
import { usePalMilestoneShare } from "@/hooks/usePalMilestoneShare";


const WORKOUT_TYPES = ["strength", "cardio", "flexibility", "hiit", "yoga", "sport"] as const;
type WorkoutType = typeof WORKOUT_TYPES[number];

export default function TrainingScreen() {
  const PLAYER_ID = useCurrentPlayerId();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [tab, setTab] = useState<"workout" | "meal">("workout");
  const [selectedType, setSelectedType] = useState<WorkoutType>("cardio");
  const { data: workout, isLoading: loadW } = useGetWorkoutPlan({ playerId: PLAYER_ID });
  const { data: meal, isLoading: loadM } = useGetMealPlan({ playerId: PLAYER_ID });
  const logSession = useLogWorkoutSession();
  const shareMilestone = usePalMilestoneShare();

  const { data: player } = useGetPlayer(PLAYER_ID);
  const activePalId = player?.activeHatchlingId ?? 0;
  const { data: activePal } = useGetHatchling(activePalId);

  const isLoading = tab === "workout" ? loadW : loadM;

  function handleLogSession() {
    logSession.mutate(
      {
        data: {
          playerId: PLAYER_ID,
          workoutType: selectedType,
          durationMinutes: 30,
          exercisesCompleted: 5,
        },
      },
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
        <Text style={[styles.title, { color: colors.foreground }]}>Training</Text>
        <View style={{ width: 34 }} />
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(["workout", "meal"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, { borderBottomColor: tab === t ? colors.primary : "transparent" }]}
          >
            <Feather name={t === "workout" ? "activity" : "coffee"} size={14} color={tab === t ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "workout" ? "Workout Plan" : "Meal Plan"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : tab === "workout" ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Log a Session */}
          <View style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.logCardHeader}>
              <Feather name="check-circle" size={16} color={colors.primary} />
              <Text style={[styles.logCardTitle, { color: colors.foreground }]}>Log a Workout</Text>
            </View>
            <Text style={[styles.logCardHint, { color: colors.mutedForeground }]}>
              Earn XP for your Pal — if they hit level 5 or 15 you'll get a share moment!
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {WORKOUT_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setSelectedType(t)}
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: selectedType === t ? colors.primary : colors.background,
                      borderColor: selectedType === t ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.typePillText, { color: selectedType === t ? "#fff" : colors.mutedForeground }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={handleLogSession}
              disabled={logSession.isPending}
              style={[styles.logBtn, { backgroundColor: colors.primary }, logSession.isPending && styles.logBtnDisabled]}
              testID="button-log-workout-session"
            >
              {logSession.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="zap" size={14} color="#fff" />
                  <Text style={styles.logBtnText}>Log 30-min {selectedType}</Text>
                </>
              )}
            </Pressable>
          </View>

          {workout ? (
            <>
              <View style={[styles.planHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.planTitle, { color: colors.foreground }]}>{workout.goal ?? "Your Workout Plan"}</Text>
                <Text style={[styles.planSub, { color: colors.mutedForeground }]}>Week {workout.weekNumber} · {workout.fitnessLevel}</Text>
              </View>
              {(workout.days ?? []).map((day: any, i: number) => (
                <View key={i} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.dayTitle, { color: colors.primary }]}>Day {day.day ?? i + 1} — {day.focus ?? ""}</Text>
                  {(day.exercises ?? []).map((ex: any, j: number) => (
                    <View key={j} style={[styles.exerciseRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.exDot, { backgroundColor: colors.primary }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.exName, { color: colors.foreground }]}>{ex.name}</Text>
                        <Text style={[styles.exDetail, { color: colors.mutedForeground }]}>
                          {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.duration && ex.duration].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </>
          ) : (
            <View style={styles.empty}>
              <Feather name="activity" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No workout plan yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Ask your AI Coach to create one</Text>
            </View>
          )}
        </ScrollView>
      ) : meal ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.planHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.planTitle, { color: colors.foreground }]}>{meal.goal ?? "Your Meal Plan"}</Text>
            <Text style={[styles.planSub, { color: colors.mutedForeground }]}>{meal.calorieTarget} kcal · {meal.proteinTarget}g protein</Text>
          </View>
          {(meal.days ?? []).map((day: any, i: number) => (
            <View key={i} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.dayTitle, { color: "#22c55e" }]}>Day {day.day ?? i + 1}</Text>
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((mealType) => {
                const m = day[mealType];
                if (!m) return null;
                return (
                  <View key={mealType} style={[styles.exerciseRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.exDot, { backgroundColor: "#22c55e" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.exName, { color: colors.foreground }]}>
                        {mealType.charAt(0).toUpperCase() + mealType.slice(1)}: {m.name ?? m}
                      </Text>
                      {m.calories && (
                        <Text style={[styles.exDetail, { color: colors.mutedForeground }]}>{m.calories} kcal</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Feather name="coffee" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No meal plan yet</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Ask your AI Coach to create one</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: "700" },
  logCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14, gap: 10 },
  logCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  logCardTitle: { fontSize: 14, fontWeight: "700" },
  logCardHint: { fontSize: 12, lineHeight: 17 },
  typeScroll: { flexGrow: 0 },
  typePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 6 },
  typePillText: { fontSize: 12, fontWeight: "600" },
  logBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10 },
  logBtnDisabled: { opacity: 0.6 },
  logBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  planHeader: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 4 },
  planTitle: { fontSize: 16, fontWeight: "700" },
  planSub: { fontSize: 13, lineHeight: 18 },
  dayCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 8 },
  dayTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  exerciseRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6, borderBottomWidth: 1 },
  exDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  exName: { fontSize: 13, fontWeight: "600" },
  exDetail: { fontSize: 11 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptyHint: { fontSize: 13 },
});
