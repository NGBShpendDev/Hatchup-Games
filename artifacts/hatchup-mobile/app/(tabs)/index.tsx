import { Feather } from "@expo/vector-icons";
import {
  useGetActiveQuests,
  useGetPlayerDashboard,
  useListHatchlings,
  useGetUnreadNotificationCount,
} from "@workspace/api-client-react";
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
import { getRarityColor, capitalize } from "@/constants/rarity";

const PLAYER_ID = 1;

interface QuickLinkProps {
  label: string;
  icon: string;
  color: string;
  route: string;
}

function QuickLink({ label, icon, color, route }: QuickLinkProps) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(route as any)}
      style={[styles.quickLink, { backgroundColor: colors.card, borderColor: color + "44" }]}
    >
      <View style={[styles.quickLinkIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.quickLinkLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function XPBar({ current, max }: { current: number; max: number }) {
  const colors = useColors();
  const pct = Math.min(1, current / Math.max(max, 1));
  return (
    <View style={[styles.xpTrack, { backgroundColor: colors.border }]}>
      <View style={[styles.xpFill, { width: `${pct * 100}%` as any, backgroundColor: colors.primary }]} />
    </View>
  );
}

const QUICK_LINKS: QuickLinkProps[] = [
  { label: "Social", icon: "rss", color: "#3b82f6", route: "/feed" },
  { label: "Clubs", icon: "users", color: "#a855f7", route: "/clubs" },
  { label: "Events", icon: "calendar", color: "#f59e0b", route: "/events" },
  { label: "Nearby", icon: "map-pin", color: "#22c55e", route: "/nearby" },
  { label: "Leaderboard", icon: "award", color: "#f59e0b", route: "/leaderboard" },
  { label: "AI Coach", icon: "cpu", color: "#ee2b8c", route: "/coach" },
  { label: "Training", icon: "activity", color: "#3b82f6", route: "/training" },
  { label: "Nutrition", icon: "coffee", color: "#22c55e", route: "/nutrition" },
  { label: "Fitness", icon: "heart", color: "#ef4444", route: "/fitness" },
  { label: "My Pal", icon: "star", color: "#f59e0b", route: "/my-pal" },
  { label: "Evolutions", icon: "trending-up", color: "#6366f1", route: "/evolutions" },
  { label: "Subscription", icon: "zap", color: "#ee2b8c", route: "/subscription" },
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: dashboard, isLoading: loadingDash } = useGetPlayerDashboard(PLAYER_ID);
  const { data: hatchlings } = useListHatchlings({ playerId: PLAYER_ID, limit: 1 });
  const { data: quests } = useGetActiveQuests(PLAYER_ID);
  const { data: unread } = useGetUnreadNotificationCount();

  const activePal = hatchlings?.[0];
  const rarityColor = activePal ? getRarityColor(activePal.rarity) : colors.primary;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.appTitle, { color: colors.primary }]}>HatchUp</Text>
          <Text style={[styles.welcomeSub, { color: colors.mutedForeground }]}>
            {loadingDash ? "Loading..." : `Welcome back, ${dashboard?.player.username ?? "Trainer"}`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/notifications")}
          style={[styles.iconBtn, { borderColor: colors.border }]}
        >
          <Feather name="bell" size={20} color={colors.mutedForeground} />
          {(unread?.count ?? 0) > 0 && (
            <View style={[styles.badgeDot, { backgroundColor: colors.primary }]} />
          )}
        </Pressable>
      </View>

      {/* Player Card */}
      {loadingDash ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : dashboard ? (
        <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
            <Feather name="user" size={32} color={colors.primary} />
          </View>
          <View style={styles.playerInfo}>
            <View style={styles.playerRow}>
              <Text style={[styles.playerName, { color: colors.foreground }]}>{dashboard.player.username}</Text>
              <View style={[styles.levelBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.levelText}>Lv {dashboard.player.level}</Text>
              </View>
            </View>
            <Text style={[styles.rankLabel, { color: colors.mutedForeground }]}>{dashboard.player.rank ?? "Unranked"}</Text>
            <XPBar current={dashboard.player.xp ?? 0} max={(dashboard.player.level ?? 1) * 500} />
            <Text style={[styles.xpText, { color: colors.mutedForeground }]}>{dashboard.player.xp ?? 0} XP</Text>
          </View>
        </View>
      ) : null}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Steps", value: (dashboard?.fitnessStats.todaySteps ?? 0).toLocaleString(), icon: "activity" },
          { label: "Streak", value: `${dashboard?.fitnessStats.currentStreak ?? 0}d`, icon: "zap" },
          { label: "Wins", value: String(dashboard?.totalWins ?? 0), icon: "award" },
        ].map((s) => (
          <View key={s.label} style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={s.icon as any} size={14} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Active Pal */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Pal</Text>
      {activePal ? (
        <Pressable
          onPress={() => router.push(`/hatchling/${activePal.id}` as any)}
          style={[styles.palCard, { backgroundColor: colors.card, borderColor: rarityColor + "66" }]}
        >
          <View style={[styles.palAura, { backgroundColor: rarityColor + "18" }]}>
            <Feather name="zap" size={40} color={rarityColor} />
          </View>
          <View style={styles.palDetails}>
            <View style={styles.palNameRow}>
              <Text style={[styles.palName, { color: colors.foreground }]}>{activePal.name}</Text>
              <View style={[styles.rarityPill, { backgroundColor: rarityColor + "28", borderColor: rarityColor + "88" }]}>
                <Text style={[styles.rarityText, { color: rarityColor }]}>{capitalize(activePal.rarity)}</Text>
              </View>
            </View>
            <Text style={[styles.palSpecies, { color: colors.mutedForeground }]}>
              {activePal.species ?? "Unknown"} · Lv {activePal.level ?? 1}
            </Text>
            <View style={[styles.palMiniBar, { backgroundColor: colors.border }]}>
              <View style={[styles.palMiniBarFill, { width: `${activePal.happiness ?? 0}%` as any, backgroundColor: rarityColor }]} />
            </View>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="star" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active pal yet</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Hatch an egg to get started</Text>
        </View>
      )}

      {/* Explore */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Explore</Text>
      <View style={styles.quickLinksGrid}>
        {QUICK_LINKS.map((ql) => (
          <QuickLink key={ql.label} {...ql} />
        ))}
      </View>

      {/* Active Quests */}
      {(quests?.length ?? 0) > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Quests</Text>
          {quests!.slice(0, 2).map((q) => (
            <View key={q.id} style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="flag" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.questName, { color: colors.foreground }]}>{q.title}</Text>
                <Text style={[styles.questDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {q.description}
                </Text>
              </View>
              <Text style={[styles.questReward, { color: colors.primary }]}>+{q.xpReward} XP</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 },
  appTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  welcomeSub: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badgeDot: { position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  playerCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", gap: 14, marginBottom: 14 },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  playerInfo: { flex: 1, gap: 4 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playerName: { fontSize: 18, fontWeight: "700" },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  levelText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  rankLabel: { fontSize: 12 },
  xpTrack: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  xpFill: { height: 4, borderRadius: 2 },
  xpText: { fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  statChip: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", paddingHorizontal: 20, marginBottom: 10 },
  palCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1.5, padding: 14, flexDirection: "row", gap: 12, marginBottom: 20, alignItems: "center" },
  palAura: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  palDetails: { flex: 1, gap: 5 },
  palNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  palName: { fontSize: 16, fontWeight: "700" },
  rarityPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityText: { fontSize: 11, fontWeight: "600" },
  palSpecies: { fontSize: 12 },
  palMiniBar: { height: 3, borderRadius: 2, overflow: "hidden" },
  palMiniBarFill: { height: 3, borderRadius: 2 },
  emptyCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 28, alignItems: "center", gap: 8, marginBottom: 20 },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptyHint: { fontSize: 13 },
  quickLinksGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10, marginBottom: 20 },
  quickLink: { width: "22%", flexGrow: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: "center", gap: 6 },
  quickLinkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  quickLinkLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  questCard: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  questName: { fontSize: 14, fontWeight: "600" },
  questDesc: { fontSize: 12, marginTop: 2 },
  questReward: { fontSize: 13, fontWeight: "700" },
});
