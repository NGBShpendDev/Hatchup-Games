import { Feather } from "@expo/vector-icons";
import { useListNearbyPlayers } from "@workspace/api-client-react";
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

function SafetyBanner({ colors }: { colors: any }) {
  return (
    <View style={[styles.safetyBanner, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b44" }]}>
      <Feather name="shield" size={16} color="#f59e0b" />
      <Text style={[styles.safetyText, { color: "#f59e0b" }]}>
        Meet in public locations only. Use caution when meeting new people.
      </Text>
    </View>
  );
}

export default function NearbyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading } = useListNearbyPlayers({ limit: 30 });
  const players = data?.entries ?? [];
  const city = data?.city;
  const locationRequired = data?.locationRequired;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Nearby Trainers</Text>
        <View style={{ width: 34 }} />
      </View>

      <SafetyBanner colors={colors} />

      {city && (
        <View style={styles.cityRow}>
          <Feather name="map-pin" size={13} color={colors.mutedForeground} />
          <Text style={[styles.cityText, { color: colors.mutedForeground }]}>Showing players in {city}</Text>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : locationRequired ? (
        <View style={styles.center}>
          <Feather name="map-pin" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Location not set</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Update your location in Settings to see nearby trainers
          </Text>
        </View>
      ) : players.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No trainers nearby</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Check back later or adjust your location visibility in Settings
          </Text>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: player }) => (
            <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
                <Feather name="user" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.playerNameRow}>
                  <Text style={[styles.playerName, { color: colors.foreground }]}>{player.displayName ?? player.username}</Text>
                  <Text style={[styles.playerName, { color: colors.mutedForeground, fontSize: 11, fontWeight: "400" }]}>@{player.username}</Text>
                </View>
                <Text style={[styles.playerLevel, { color: colors.mutedForeground }]}>
                  {player.city ?? "Nearby"}
                </Text>
              </View>
              <View style={[styles.distanceBadge, { backgroundColor: colors.muted }]}>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={[styles.distanceText, { color: colors.mutedForeground }]}>
                  {player.distanceBucket ?? "Nearby"}
                </Text>
              </View>
              <Pressable style={styles.menuBtn}>
                <Feather name="more-vertical" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          )}
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
  safetyBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 16, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  safetyText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, marginBottom: 8 },
  cityText: { fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptyHint: { fontSize: 13, textAlign: "center" },
  playerCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  playerName: { fontSize: 14, fontWeight: "700" },
  playerLevel: { fontSize: 12, marginTop: 2 },
  distanceBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  distanceText: { fontSize: 11 },
  menuBtn: { padding: 4 },
});
