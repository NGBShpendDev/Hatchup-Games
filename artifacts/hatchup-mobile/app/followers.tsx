import { Feather } from "@expo/vector-icons";
import {
  useFollowPlayer,
  useListFollowers,
  useListFollowing,
} from "@workspace/api-client-react";
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
import { useCurrentPlayerId } from "@/providers/CurrentPlayerProvider";


function useAllFollowingIds(playerId: number): Set<number> {
  const [cursor, setCursor] = useState(0);
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);

  const { data } = useListFollowing(playerId, { cursor, limit: 100 });

  useEffect(() => {
    if (!data) return;
    setIds((prev) => {
      const next = new Set(prev);
      for (const p of data.players) next.add(p.id);
      return next;
    });
    if (data.nextCursor != null) {
      setCursor(data.nextCursor);
    } else {
      setDone(true);
    }
  }, [data]);

  return ids;
}

export default function FollowersScreen() {
  const PLAYER_ID = useCurrentPlayerId();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [searchQuery, setSearchQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [accumulated, setAccumulated] = useState<any[]>([]);
  const [localFollowedIds, setLocalFollowedIds] = useState<Set<number>>(
    new Set(),
  );

  const followingIds = useAllFollowingIds(PLAYER_ID);

  const { data, isLoading, isFetching } = useListFollowers(PLAYER_ID, {
    cursor,
    limit: 20,
  });

  const followMutation = useFollowPlayer();

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

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? accumulated.filter(
        (p: any) =>
          p.username.toLowerCase().includes(q) ||
          (p.displayName ?? "").toLowerCase().includes(q),
      )
    : accumulated;

  const total = data?.total ?? accumulated.length;
  const hasMore = data?.nextCursor != null;

  function isFollowingBack(playerId: number): boolean {
    return followingIds.has(playerId) || localFollowedIds.has(playerId);
  }

  function handleFollowBack(playerId: number) {
    setLocalFollowedIds((prev) => new Set([...prev, playerId]));
    followMutation.mutate(
      { data: { followerId: PLAYER_ID, followeeId: playerId } },
      {
        onError: () => {
          setLocalFollowedIds((prev) => {
            const next = new Set(prev);
            next.delete(playerId);
            return next;
          });
        },
      },
    );
  }

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
            Followers
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
            placeholder="Search followers…"
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            testID="input-search-followers"
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
          <Feather name="users" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {q ? "No followers match your search." : "No followers yet."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: player }) => {
            const alreadyFollowing = isFollowingBack(player.id);
            return (
              <Pressable
                style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID={`follower-row-${player.id}`}
                onPress={() => router.push(`/social/${player.id}` as any)}
              >
                <View style={[styles.avatar, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
                  {player.avatarUrl ? (
                    <Image source={{ uri: player.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Feather name="user" size={20} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.displayName, { color: colors.foreground }]}>
                    {player.displayName ?? player.username}
                  </Text>
                  <Text style={[styles.username, { color: colors.mutedForeground }]}>@{player.username}</Text>
                  {typeof player.followerCount === "number" && (
                    <Text style={[styles.followerCountText, { color: colors.mutedForeground }]} testID={`follower-count-${player.id}`}>
                      {player.followerCount >= 1000
                        ? `${(player.followerCount / 1000).toFixed(1).replace(/\.0$/, "")}k`
                        : String(player.followerCount)}{" "}
                      {player.followerCount === 1 ? "follower" : "followers"}
                    </Text>
                  )}
                </View>
                {!alreadyFollowing ? (
                  <Pressable
                    style={[styles.followBtn, { borderColor: colors.primary }]}
                    onPress={() => handleFollowBack(player.id)}
                    testID={`follow-back-btn-${player.id}`}
                  >
                    <Text style={[styles.followBtnText, { color: colors.primary }]}>
                      Follow back
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.menuBtn}>
                    <Feather name="more-vertical" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </Pressable>
            );
          }}
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
  followBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  followerCountText: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  followBtnText: { fontSize: 12, fontWeight: "700" },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  menuBtn: { padding: 4 },
  loadMoreText: { fontSize: 13, fontWeight: "700" },
});
