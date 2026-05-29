import { Feather } from "@expo/vector-icons";
import { useListFollowing, useUnfollowPlayer } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const PLAYER_ID = 1;

export default function FollowingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [searchQuery, setSearchQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [accumulated, setAccumulated] = useState<any[]>([]);
  const [localUnfollowedIds, setLocalUnfollowedIds] = useState<Set<number>>(
    new Set(),
  );

  const { data, isLoading, isFetching } = useListFollowing(PLAYER_ID, {
    cursor,
    limit: 20,
  });

  const unfollowMutation = useUnfollowPlayer();

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((p: any) => p.id));
      const next = [...prev];
      for (const p of data.players) {
        if (!seen.has(p.id)) {
          next.push(p);
          seen.add(p.id);
        }
      }
      return next;
    });
  }, [data]);

  useEffect(() => {
    setCursor(0);
    setAccumulated([]);
    setSearchQuery("");
  }, []);

  function handleUnfollow(playerId: number) {
    setLocalUnfollowedIds((prev) => new Set([...prev, playerId]));
    unfollowMutation.mutate(
      { data: { followerId: PLAYER_ID, followeeId: playerId } },
      {
        onError: () => {
          setLocalUnfollowedIds((prev) => {
            const next = new Set(prev);
            next.delete(playerId);
            return next;
          });
        },
      },
    );
  }

  const q = searchQuery.trim().toLowerCase();
  const visible = accumulated.filter((p: any) => !localUnfollowedIds.has(p.id));
  const filtered = q
    ? visible.filter(
        (p: any) =>
          p.username.toLowerCase().includes(q) ||
          (p.displayName ?? "").toLowerCase().includes(q),
      )
    : visible;

  const total = data?.total ?? accumulated.length;
  const hasMore = data?.nextCursor != null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Following
          </Text>
          {total > 0 && (
            <Text style={[styles.count, { color: colors.mutedForeground }]}>
              {total}
            </Text>
          )}
        </View>
        <View style={{ width: 34 }} />
      </View>

      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather
            name="search"
            size={15}
            color={colors.mutedForeground}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search following…"
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            testID="input-search-following"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.clearBtn}
            >
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading && accumulated.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="user-plus" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {q ? "No results match your search." : "Not following anyone yet."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: player }) => (
            <Pressable
              style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              testID={`following-row-${player.id}`}
              onPress={() => router.push(`/social/${player.id}` as any)}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.primary + "22",
                    borderColor: colors.primary,
                  },
                ]}
              >
                {player.avatarUrl ? (
                  <Image source={{ uri: player.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Feather name="user" size={20} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.displayName, { color: colors.foreground }]}
                >
                  {player.displayName ?? player.username}
                </Text>
                <Text
                  style={[styles.username, { color: colors.mutedForeground }]}
                >
                  @{player.username}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.unfollowBtn,
                  { borderColor: colors.mutedForeground },
                ]}
                onPress={() => handleUnfollow(player.id)}
                testID={`unfollow-btn-${player.id}`}
              >
                <Text
                  style={[
                    styles.unfollowBtnText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Unfollow
                </Text>
              </Pressable>
            </Pressable>
          )}
          ListFooterComponent={
            hasMore ? (
              <Pressable
                style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                disabled={isFetching}
                onPress={() => {
                  if (data?.nextCursor != null) setCursor(data.nextCursor);
                }}
              >
                <Text
                  style={[styles.loadMoreText, { color: colors.primary }]}
                >
                  {isFetching ? "Loading…" : "Load more"}
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6 },
  titleBlock: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  count: { fontSize: 14, fontWeight: "600" },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  clearBtn: { padding: 4 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  displayName: { fontSize: 14, fontWeight: "700" },
  username: { fontSize: 12, marginTop: 1 },
  unfollowBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  unfollowBtnText: { fontSize: 12, fontWeight: "700" },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  loadMoreText: { fontSize: 13, fontWeight: "700" },
});
