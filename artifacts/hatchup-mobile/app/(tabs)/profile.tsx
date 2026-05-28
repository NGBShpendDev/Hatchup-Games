import { Feather } from "@expo/vector-icons";
import { useGetPlayer, useGetFitnessStats } from "@workspace/api-client-react";
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

const PLAYER_ID = 1;

const RANK_COLORS: Record<string, string> = {
  Bronze: "#cd7f32",
  Silver: "#9ca3af",
  Gold: "#f59e0b",
  Platinum: "#38bdf8",
  Diamond: "#818cf8",
  Master: "#ee2b8c",
  Legend: "#e2e8f0",
};

const MENU_ITEMS = [
  { label: "Fitness Stats", icon: "activity", color: "#22c55e", route: "/fitness" },
  { label: "Training Plan", icon: "activity", color: "#3b82f6", route: "/training" },
  { label: "Nutrition", icon: "coffee", color: "#f59e0b", route: "/nutrition" },
  { label: "AI Coach", icon: "cpu", color: "#ee2b8c", route: "/coach" },
  { label: "Nearby Players", icon: "map-pin", color: "#22c55e", route: "/nearby" },
  { label: "Social Feed", icon: "rss", color: "#3b82f6", route: "/feed" },
  { label: "Clubs", icon: "users", color: "#a855f7", route: "/clubs" },
  { label: "Leaderboard", icon: "award", color: "#f59e0b", route: "/leaderboard" },
  { label: "Events", icon: "calendar", color: "#6366f1", route: "/events" },
  { label: "Notifications", icon: "bell", color: "#ee2b8c", route: "/notifications" },
  { label: "Subscription", icon: "star", color: "#f59e0b", route: "/subscription" },
  { label: "Privacy & Settings", icon: "shield", color: "#9ca3af", route: "/settings" },
];

function MenuItem({ item }: { item: typeof MENU_ITEMS[0] }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(item.route as any)}
      style={[styles.menuItem, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.color + "22" }]}>
        <Feather name={item.icon as any} size={16} color={item.color} />
      </View>
      <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: player, isLoading } = useGetPlayer(PLAYER_ID);
  const { data: fitnessStats } = useGetFitnessStats(PLAYER_ID);

  const rankLabel = player?.rank ?? "Unranked";
  const rankColor = Object.entries(RANK_COLORS).find(([key]) => rankLabel.includes(key))?.[1] ?? colors.mutedForeground;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
          <View style={[styles.avatarInner, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="user" size={40} color={colors.primary} />
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : (
          <>
            <Text style={[styles.username, { color: colors.foreground }]}>
              {player?.username ?? "DragonMaster"}
            </Text>
            {player?.displayName && (
              <Text style={[styles.displayName, { color: colors.mutedForeground }]}>{player.displayName}</Text>
            )}
            <View style={styles.badgeRow}>
              <View style={[styles.levelBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>Lv {player?.level ?? 1}</Text>
              </View>
              <View style={[styles.rankBadge, { backgroundColor: rankColor + "28", borderColor: rankColor + "66" }]}>
                <View style={[styles.rankDot, { backgroundColor: rankColor }]} />
                <Text style={[styles.rankText, { color: rankColor }]}>{rankLabel}</Text>
              </View>
            </View>
          </>
        )}

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          {[
            { label: "XP", value: (player?.xp ?? 0).toLocaleString() },
            { label: "Wins", value: String(player?.totalWins ?? 0) },
            { label: "Streak", value: `${player?.currentStreak ?? 0}d` },
            { label: "Steps", value: (player?.totalSteps ?? 0).toLocaleString() },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
              <View style={styles.quickStat}>
                <Text style={[styles.quickStatValue, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {MENU_ITEMS.map((item, i) => (
          <React.Fragment key={item.label}>
            <MenuItem item={item} />
          </React.Fragment>
        ))}
      </View>

      {player?.createdAt && (
        <Text style={[styles.joinedAt, { color: colors.mutedForeground }]}>
          Trainer since {new Date(player.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, marginBottom: 16 },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, padding: 4, marginBottom: 12 },
  avatarInner: { flex: 1, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  username: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  displayName: { fontSize: 14, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" },
  levelBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  rankDot: { width: 7, height: 7, borderRadius: 4 },
  rankText: { fontSize: 12, fontWeight: "700" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  verifiedText: { fontSize: 11, fontWeight: "600" },
  quickStats: { flexDirection: "row", alignItems: "center", marginTop: 16, width: "100%" },
  quickStat: { flex: 1, alignItems: "center", gap: 2 },
  quickStatValue: { fontSize: 18, fontWeight: "800" },
  quickStatLabel: { fontSize: 10 },
  statDivider: { width: 1, height: 28 },
  menuCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  joinedAt: { textAlign: "center", fontSize: 12, marginTop: 16 },
});
