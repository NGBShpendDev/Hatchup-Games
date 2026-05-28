import { Feather } from "@expo/vector-icons";
import { useGetNutritionSummary, useListNutritionPosts, useGetNutritionStreak } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
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

function MacroCircle({ label, current, target, color }: {
  label: string; current: number; target: number; color: string;
}) {
  const colors = useColors();
  const pct = Math.min(1, current / Math.max(target, 1));
  return (
    <View style={styles.macroCircle}>
      <View style={[styles.circleOuter, { borderColor: colors.border }]}>
        <View style={[styles.circleInner, { borderColor: color, borderTopColor: "transparent", transform: [{ rotate: `${pct * 360}deg` }] }]} />
        <View style={styles.circleTextBox}>
          <Text style={[styles.circleValue, { color: colors.foreground }]}>{Math.round(current)}</Text>
          <Text style={[styles.circleUnit, { color: colors.mutedForeground }]}>g</Text>
        </View>
      </View>
      <Text style={[styles.macroLabel, { color: color }]}>{label}</Text>
      <Text style={[styles.macroTarget, { color: colors.mutedForeground }]}>/{target}g</Text>
    </View>
  );
}

export default function NutritionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: summary, isLoading } = useGetNutritionSummary();
  const { data: posts } = useListNutritionPosts({ limit: 10 });
  const { data: streak } = useGetNutritionStreak();

  const calories = summary?.averages.calories ?? 0;
  const calorieTarget = summary?.targets.calories ?? 2000;
  const caloriePct = Math.min(1, calories / calorieTarget);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Nutrition</Text>
        <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]}>
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Calorie ring */}
          <View style={[styles.calorieCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={[styles.calorieValue, { color: colors.foreground }]}>{Math.round(calories)}</Text>
              <Text style={[styles.calorieLabel, { color: colors.mutedForeground }]}>of {calorieTarget} kcal</Text>
              <View style={[styles.calorieTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.calorieFill, { width: `${caloriePct * 100}%` as any, backgroundColor: caloriePct > 0.9 ? "#ef4444" : colors.primary }]} />
              </View>
            </View>
            {streak && (
              <View style={[styles.streakBadge, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b66" }]}>
                <Feather name="zap" size={14} color="#f59e0b" />
                <Text style={[styles.streakText, { color: "#f59e0b" }]}>{streak.currentStreak ?? 0}d streak</Text>
              </View>
            )}
          </View>

          {/* Macros */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Macros Today</Text>
          <View style={styles.macrosRow}>
            <MacroCircle label="Protein" current={summary?.averages.protein ?? 0} target={summary?.targets.protein ?? 150} color="#3b82f6" />
            <MacroCircle label="Carbs" current={summary?.averages.carbs ?? 0} target={summary?.targets.carbs ?? 250} color="#f59e0b" />
            <MacroCircle label="Fat" current={summary?.averages.fat ?? 0} target={summary?.targets.fat ?? 70} color="#a855f7" />
          </View>

          {/* Body Composition Scan — Premium feature promo card */}
          <View style={[styles.scanPromoCard, { backgroundColor: colors.card, borderColor: colors.primary + "55" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Text style={{ fontSize: 22 }}>🔬</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.scanPromoTitle, { color: colors.foreground }]}>Body Composition Scan</Text>
                <Text style={[styles.scanPromoSub, { color: colors.mutedForeground }]}>AI estimates body fat % from a photo · Premium</Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push("/")}
              style={[styles.scanPromoBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="camera" size={14} color="#fff" />
              <Text style={styles.scanPromoBtnText}>Scan</Text>
            </Pressable>
          </View>

          {/* Recent meals */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Meals</Text>
          {(posts?.posts?.length ?? 0) === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="coffee" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Log your first meal</Text>
            </View>
          ) : (
            (posts?.posts ?? []).slice(0, 6).map((post: any) => (
              <View key={post.id} style={[styles.mealCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.mealIcon, { backgroundColor: "#22c55e22" }]}>
                  <Feather name="coffee" size={16} color="#22c55e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mealName, { color: colors.foreground }]} numberOfLines={1}>
                    {post.mealName ?? post.description ?? "Meal"}
                  </Text>
                  <Text style={[styles.mealMeta, { color: colors.mutedForeground }]}>
                    {post.calories ?? 0} kcal · {post.protein ?? 0}g protein
                  </Text>
                </View>
                <Text style={[styles.mealTime, { color: colors.mutedForeground }]}>
                  {post.loggedAt ? new Date(post.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
              </View>
            ))
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
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  calorieCard: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  calorieValue: { fontSize: 36, fontWeight: "800" },
  calorieLabel: { fontSize: 13 },
  calorieTrack: { height: 6, width: 160, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  calorieFill: { height: 6, borderRadius: 3 },
  streakBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  streakText: { fontSize: 13, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  macrosRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 20 },
  macroCircle: { alignItems: "center", gap: 4 },
  circleOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  circleInner: { position: "absolute", width: 72, height: 72, borderRadius: 36, borderWidth: 4 },
  circleTextBox: { alignItems: "center" },
  circleValue: { fontSize: 18, fontWeight: "800" },
  circleUnit: { fontSize: 10 },
  macroLabel: { fontSize: 12, fontWeight: "700" },
  macroTarget: { fontSize: 10 },
  mealCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  mealIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  mealName: { fontSize: 13, fontWeight: "600" },
  mealMeta: { fontSize: 11 },
  mealTime: { fontSize: 11 },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13 },
  scanPromoCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 20 },
  scanPromoTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  scanPromoSub: { fontSize: 11 },
  scanPromoBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  scanPromoBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
