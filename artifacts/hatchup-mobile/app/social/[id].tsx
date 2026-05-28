import { Feather } from "@expo/vector-icons";
import {
  useGetPlayerSocialProfile,
  useFollowPlayer,
  useUnfollowPlayer,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
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

const CURRENT_PLAYER_ID = 1;

function PostCard({ post, colors }: { post: any; colors: any }) {
  const [liked, setLiked] = useState(false);
  return (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.postContent, { color: colors.foreground }]}>{post.content}</Text>
      <View style={styles.postFooter}>
        <Pressable onPress={() => setLiked(!liked)} style={styles.reactionBtn}>
          <Feather name="heart" size={14} color={liked ? "#ef4444" : colors.mutedForeground} />
          <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>
            {(post.likeCount ?? 0) + (liked ? 1 : 0)}
          </Text>
        </Pressable>
        <Pressable style={styles.reactionBtn}>
          <Feather name="message-circle" size={14} color={colors.mutedForeground} />
          <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>
            {post.commentCount ?? 0}
          </Text>
        </Pressable>
        <Text style={[styles.postDate, { color: colors.mutedForeground }]}>
          {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}
        </Text>
      </View>
    </View>
  );
}

export default function SocialProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playerId = Number(id);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading, refetch } = useGetPlayerSocialProfile(playerId, {
    viewerId: CURRENT_PLAYER_ID,
  });

  const followMutation = useFollowPlayer();
  const unfollowMutation = useUnfollowPlayer();

  const isOwnProfile = playerId === CURRENT_PLAYER_ID;
  const isFollowing = data?.isFollowing ?? false;
  const player = data?.player;

  function handleFollowToggle() {
    if (isFollowing) {
      unfollowMutation.mutate(
        { data: { followerId: CURRENT_PLAYER_ID, followeeId: playerId } },
        { onSuccess: () => refetch() },
      );
    } else {
      followMutation.mutate(
        { data: { followerId: CURRENT_PLAYER_ID, followeeId: playerId } },
        { onSuccess: () => refetch() },
      );
    }
  }

  const isMutating = followMutation.isPending || unfollowMutation.isPending;

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {player ? `@${player.username}` : "Profile"}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !player ? (
        <View style={styles.empty}>
          <Feather name="user-x" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Player not found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data?.posts ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.profileSection}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colors.primary + "22", borderColor: colors.primary },
                ]}
              >
                <Feather name="user" size={36} color={colors.primary} />
              </View>

              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {player.displayName ?? player.username}
              </Text>
              <Text style={[styles.username, { color: colors.mutedForeground }]}>
                @{player.username}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>
                    {data?.followerCount ?? 0}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    Followers
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>
                    {data?.followingCount ?? 0}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    Following
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>
                    {data?.posts?.length ?? 0}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    Posts
                  </Text>
                </View>
              </View>

              {!isOwnProfile && (
                <Pressable
                  style={[
                    styles.followBtn,
                    isFollowing
                      ? { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }
                      : { backgroundColor: colors.primary },
                  ]}
                  onPress={handleFollowToggle}
                  disabled={isMutating}
                >
                  {isMutating ? (
                    <ActivityIndicator size="small" color={isFollowing ? colors.foreground : "#fff"} />
                  ) : (
                    <Text
                      style={[
                        styles.followBtnText,
                        { color: isFollowing ? colors.foreground : "#fff" },
                      ]}
                    >
                      {isFollowing ? "Unfollow" : "Follow"}
                    </Text>
                  )}
                </Pressable>
              )}

              {(data?.mutualFollowersTotal ?? 0) > 0 && (
                <Text style={[styles.mutualText, { color: colors.mutedForeground }]}>
                  {data!.mutualFollowersTotal} mutual follower
                  {data!.mutualFollowersTotal !== 1 ? "s" : ""}
                </Text>
              )}

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Posts</Text>
            </View>
          }
          renderItem={({ item: post }) => <PostCard post={post} colors={colors} />}
          ListEmptyComponent={
            <View style={styles.emptyPosts}>
              <Feather name="file-text" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No posts yet.
              </Text>
            </View>
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
  headerTitle: { fontSize: 17, fontWeight: "700" },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
    gap: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  displayName: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  username: { fontSize: 14, marginBottom: 4 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    gap: 0,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statNumber: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1, height: 32 },
  followBtn: {
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 40,
    alignItems: "center",
    marginTop: 4,
    minWidth: 140,
  },
  followBtnText: { fontSize: 15, fontWeight: "700" },
  mutualText: { fontSize: 12, marginTop: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    alignSelf: "flex-start",
    marginTop: 16,
    marginBottom: 4,
  },
  postCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  postContent: { fontSize: 14, lineHeight: 20 },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 12,
  },
  reactionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  reactionCount: { fontSize: 13 },
  postDate: { marginLeft: "auto", fontSize: 12 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    marginTop: 80,
  },
  emptyPosts: {
    alignItems: "center",
    paddingTop: 32,
    gap: 8,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
});
