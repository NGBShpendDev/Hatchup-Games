import { Feather } from "@expo/vector-icons";
import {
  useGetActiveQuests,
  useGetPlayerDashboard,
  useListHatchlings,
} from "@workspace/api-client-react";
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

const RARITY_COLORS: Record<string, string> = {
  common: "#9ca3af",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
  mythic: "#dc2626",
  ancient: "#6366f1",
  celestial: "#e2e8f0",
};

function StatChip({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={14} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
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

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: dashboard, isLoading: loadingDash } = useGetPlayerDashboard(PLAYER_ID);
  const { data: hatchlings } = useListHatchlings({ playerId: PLAYER_ID, limit: 1 });
  const { data: quests } = useGetActiveQuests();

  const activePal = hatchlings?.[0];
  const rarityColor = activePal ? (RARITY_COLORS[activePal.rarity ?? "common"] ?? colors.primary) : colors.primary;

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
          {loadingDash ? (
            <Text style={[styles.welcomeSub, { color: colors.mutedForeground }]}>Loading...</Text>
          ) : (
            <Text style={[styles.welcomeSub, { color: colors.mutedForeground }]}>
              Welcome back, {dashboard?.username ?? "Trainer"}
            </Text>
          )}
        </View>
        <Pressable style={[styles.iconBtn, { borderColor: colors.border }]}>
          <Feather name="bell" size={20} color={colors.mutedForeground} />
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
              <Text style={[styles.playerName, { color: colors.foreground }]}>{dashboard.username}</Text>
              <View style={[styles.levelBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.levelText}>Lv {dashboard.level}</Text>
              </View>
            </View>
            <Text style={[styles.rankLabel, { color: colors.mutedForeground }]}>
              {dashboard.rank ?? "Unranked"}
            </Text>
            <XPBar current={dashboard.xp ?? 0} max={(dashboard.level ?? 1) * 500} />
            <Text style={[styles.xpText, { color: colors.mutedForeground }]}>
              {dashboard.xp ?? 0} XP
            </Text>
          </View>
        </View>
      ) : null}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <StatChip label="Steps" value={(dashboard?.todaySteps ?? 0).toLocaleString()} icon="activity" />
        <StatChip label="Streak" value={`${dashboard?.currentStreak ?? 0}d`} icon="zap" />
        <StatChip label="Wins" value={dashboard?.battleWins ?? 0} icon="award" />
      </View>

      {/* Active Pal */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Pal</Text>
      {activePal ? (
        <View style={[styles.palCard, { backgroundColor: colors.card, borderColor: rarityColor + "66" }]}>
          <View style={[styles.palAura, { backgroundColor: rarityColor + "18" }]}>
            <Feather name="zap" size={48} color={rarityColor} />
          </View>
          <View style={styles.palDetails}>
            <View style={styles.palNameRow}>
              <Text style={[styles.palName, { color: colors.foreground }]}>{activePal.name}</Text>
              <View style={[styles.rarityPill, { backgroundColor: rarityColor + "28", borderColor: rarityColor + "88" }]}>
                <Text style={[styles.rarityText, { color: rarityColor }]}>
                  {(activePal.rarity ?? "common").charAt(0).toUpperCase() + (activePal.rarity ?? "common").slice(1)}
                </Text>
              </View>
            </View>
            <Text style={[styles.palSpecies, { color: colors.mutedForeground }]}>
              {activePal.species ?? "Unknown"} · Lv {activePal.level ?? 1}
            </Text>
            <View style={styles.palStatsRow}>
              {[
                { label: "HP", value: activePal.happiness ?? 0 },
                { label: "Energy", value: activePal.energy ?? 0 },
              ].map((s) => (
                <View key={s.label} style={styles.palStatItem}>
                  <Text style={[styles.palStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                  <View style={[styles.miniBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.miniBarFill,
                        { width: `${s.value}%` as any, backgroundColor: rarityColor },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="star" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active pal yet</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Hatch an egg to get started
          </Text>
        </View>
      )}

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
              <Text style={[styles.questReward, { color: colors.primary }]}>+{q.rewardXp} XP</Text>
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
  palCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1.5, padding: 16, flexDirection: "row", gap: 14, marginBottom: 20, overflow: "hidden" },
  palAura: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  palDetails: { flex: 1, gap: 6 },
  palNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  palName: { fontSize: 18, fontWeight: "700" },
  rarityPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityText: { fontSize: 11, fontWeight: "600" },
  palSpecies: { fontSize: 12 },
  palStatsRow: { gap: 6 },
  palStatItem: { gap: 3 },
  palStatLabel: { fontSize: 11 },
  miniBar: { height: 3, borderRadius: 2, overflow: "hidden" },
  miniBarFill: { height: 3, borderRadius: 2 },
  emptyCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 28, alignItems: "center", gap: 8, marginBottom: 20 },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptyHint: { fontSize: 13 },
  questCard: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  questName: { fontSize: 14, fontWeight: "600", flex: 1 },
  questDesc: { fontSize: 12, marginTop: 2 },
  questReward: { fontSize: 13, fontWeight: "700" },
});
