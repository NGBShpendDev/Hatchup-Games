import { Feather } from "@expo/vector-icons";
import { useListClubs } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function ClubsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [search, setSearch] = useState("");
  const { data: clubs, isLoading } = useListClubs({ limit: 50 });

  const filtered = (clubs ?? []).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Clubs</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search clubs..."
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? "No clubs match your search" : "No clubs yet"}
              </Text>
            </View>
          }
          renderItem={({ item: club }) => (
            <View style={[styles.clubCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.clubAvatar, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.clubInitial, { color: colors.primary }]}>
                  {club.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.clubNameRow}>
                  <Text style={[styles.clubName, { color: colors.foreground }]} numberOfLines={1}>
                    {club.name}
                  </Text>
                  {club.badge && (
                    <Text style={[styles.clubTag, { color: colors.primary }]}>{club.badge}</Text>
                  )}
                </View>
                <View style={styles.clubMeta}>
                  <Feather name="users" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {club.memberCount ?? 0} members
                  </Text>
                  {club.rank && (
                    <>
                      <Feather name="award" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{club.rank}</Text>
                    </>
                  )}
                </View>
                {club.description && (
                  <Text style={[styles.clubDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {club.description}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => router.push(`/club/${club.id}` as any)}
                style={[styles.viewBtn, { borderColor: colors.primary }]}
              >
                <Text style={[styles.viewBtnText, { color: colors.primary }]}>View</Text>
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
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  clubCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  clubAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  clubInitial: { fontSize: 20, fontWeight: "800" },
  clubNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  clubName: { fontSize: 15, fontWeight: "700" },
  clubTag: { fontSize: 12, fontWeight: "600" },
  clubMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  metaText: { fontSize: 11 },
  clubDesc: { fontSize: 12, marginTop: 2 },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5 },
  viewBtnText: { fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 14 },
});
