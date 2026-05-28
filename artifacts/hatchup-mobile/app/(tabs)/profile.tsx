import { Feather } from "@expo/vector-icons";
import { useGetPlayer, useGetFitnessStats } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  Platform,
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

interface StatTileProps {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}

function StatTile({ label, value, icon, color }: StatTileProps) {
  const colors = useColors();
  const tileColor = color ?? colors.primary;
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIconBg, { backgroundColor: tileColor + "22" }]}>
        <Feather name={icon as any} size={18} color={tileColor} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: player, isLoading } = useGetPlayer(PLAYER_ID);
  const { data: fitnessStats } = useGetFitnessStats();

  const rankLabel = player?.rank ?? "Unranked";
  const rankColor = Object.entries(RANK_COLORS).find(([key]) =>
    rankLabel.includes(key)
  )?.[1] ?? colors.mutedForeground;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View
        style={[
          styles.hero,
          { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
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
              <Text style={[styles.displayName, { color: colors.mutedForeground }]}>
                {player.displayName}
              </Text>
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
            {player?.bio && (
              <Text style={[styles.bio, { color: colors.mutedForeground }]}>{player.bio}</Text>
            )}
          </>
        )}
      </View>

      {/* Stats Grid */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Stats</Text>
      <View style={styles.statsGrid}>
        <StatTile label="XP" value={(player?.xp ?? 0).toLocaleString()} icon="trending-up" />
        <StatTile label="Wins" value={player?.battleWins ?? 0} icon="award" color="#f59e0b" />
        <StatTile label="Streak" value={`${player?.currentStreak ?? 0}d`} icon="zap" color="#22c55e" />
        <StatTile label="Total Steps" value={(fitnessStats?.totalSteps ?? 0).toLocaleString()} icon="activity" color="#3b82f6" />
        <StatTile label="Workouts" value={fitnessStats?.totalWorkouts ?? 0} icon="heart" color="#a855f7" />
        <StatTile label="Hatchlings" value={player?.hatchlingCount ?? 0} icon="star" color="#ee2b8c" />
      </View>

      {/* About */}
      {player?.joinedAt && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Joined {new Date(player.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </Text>
            </View>
            {player.city && (
              <View style={styles.infoRow}>
                <Feather name="map-pin" size={14} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{player.city}</Text>
              </View>
            )}
            {player.isVerified && (
              <View style={styles.infoRow}>
                <Feather name="check-circle" size={14} color="#38bdf8" />
                <Text style={[styles.infoText, { color: "#38bdf8" }]}>Verified trainer</Text>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    padding: 4,
    marginBottom: 14,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  username: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  displayName: { fontSize: 14, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  levelBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  rankDot: { width: 7, height: 7, borderRadius: 4 },
  rankText: { fontSize: 12, fontWeight: "700" },
  bio: { fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "700", paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10 },
  statTile: {
    width: "30%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  statIconBg: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, textAlign: "center" },
  infoCard: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 13 },
});
