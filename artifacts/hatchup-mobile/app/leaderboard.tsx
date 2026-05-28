import { Feather } from "@expo/vector-icons";
import { useGetGlobalLeaderboard, useGetBattleEloLeaderboard } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

const PLAYER_ID = 1;

const RANK_ICONS: Record<number, { icon: string; color: string }> = {
  1: { icon: "award", color: "#f59e0b" },
  2: { icon: "award", color: "#9ca3af" },
  3: { icon: "award", color: "#cd7f32" },
};

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [tab, setTab] = useState<"global" | "battle">("global");
  const { data: global, isLoading: loadGlobal } = useGetGlobalLeaderboard({ limit: 50 });
  const { data: battle, isLoading: loadBattle } = useGetBattleEloLeaderboard({ limit: 50 });

  const entries = (tab === "global" ? (global ?? []) : (battle ?? [])) as any[];
  const isLoading = tab === "global" ? loadGlobal : loadBattle;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Leaderboard</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderColor: colors.border }]}>
        {(["global", "battle"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, { borderBottomColor: tab === t ? colors.primary : "transparent" }]}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "global" ? "Global XP" : "Battle ELO"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e, i) => `${e.playerId ?? i}`}
          contentContainerStyle={{ paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: entry, index }) => {
            const rank = index + 1;
            const rankInfo = RANK_ICONS[rank];
            const isMe = entry.playerId === PLAYER_ID;
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: isMe ? colors.primary + "18" : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                {rankInfo ? (
                  <Feather name={rankInfo.icon as any} size={18} color={rankInfo.color} style={styles.rankIcon} />
                ) : (
                  <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>{rank}</Text>
                )}
                <View style={[styles.avatar, { backgroundColor: colors.card, borderColor: isMe ? colors.primary : colors.border }]}>
                  <Feather name="user" size={16} color={isMe ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.username, { color: isMe ? colors.primary : colors.foreground }]}>
                    {entry.username ?? "Player"}{isMe ? " (You)" : ""}
                  </Text>
                  <Text style={[styles.rankLabel, { color: colors.mutedForeground }]}>{typeof entry.rank === "string" ? entry.rank : ""}</Text>
                </View>
                <Text style={[styles.score, { color: isMe ? colors.primary : colors.foreground }]}>
                  {(tab === "global" ? (entry.score ?? 0) : (entry.battleElo ?? 0)).toLocaleString()}
                </Text>
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
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 4 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  rankIcon: { width: 28, textAlign: "center" },
  rankNum: { width: 28, textAlign: "center", fontSize: 14, fontWeight: "700" },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  username: { fontSize: 14, fontWeight: "600" },
  rankLabel: { fontSize: 11 },
  score: { fontSize: 15, fontWeight: "800" },
});
