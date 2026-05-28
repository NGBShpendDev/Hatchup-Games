import { Feather } from "@expo/vector-icons";
import { useGetSocialFeed, useGetTrendingPosts } from "@workspace/api-client-react";
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

function PostCard({ post, colors }: { post: any; colors: any }) {
  const [liked, setLiked] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Author */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Feather name="user" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.authorName, { color: colors.foreground }]}>
            {post.authorUsername ?? post.author?.username ?? "Player"}
          </Text>
          <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
            {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}
          </Text>
        </View>
        <Pressable>
          <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Content */}
      <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>

      {/* Reactions */}
      <View style={styles.reactions}>
        <Pressable onPress={() => setLiked(!liked)} style={styles.reactionBtn}>
          <Feather name="heart" size={15} color={liked ? "#ef4444" : colors.mutedForeground} />
          <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>
            {(post.likeCount ?? 0) + (liked ? 1 : 0)}
          </Text>
        </Pressable>
        <Pressable style={styles.reactionBtn}>
          <Feather name="message-circle" size={15} color={colors.mutedForeground} />
          <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{post.commentCount ?? 0}</Text>
        </Pressable>
        <Pressable style={styles.reactionBtn}>
          <Feather name="repeat" size={15} color={colors.mutedForeground} />
          <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{post.repostCount ?? 0}</Text>
        </Pressable>
        <Pressable style={styles.reactionBtn}>
          <Feather name="share" size={15} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const PLAYER_ID = 1;
  const [tab, setTab] = useState<"feed" | "trending">("feed");
  const { data: feed, isLoading: loadFeed } = useGetSocialFeed({ playerId: PLAYER_ID, limit: 20 });
  const { data: trending, isLoading: loadTrending } = useGetTrendingPosts({ playerId: PLAYER_ID, limit: 20 });

  const posts = tab === "feed" ? (feed?.posts ?? []) : (trending?.posts ?? []);
  const isLoading = tab === "feed" ? loadFeed : loadTrending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Social</Text>
        <Pressable style={[styles.composeBtn, { backgroundColor: colors.primary }]}>
          <Feather name="edit-3" size={16} color="#fff" />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(["feed", "trending"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, { borderBottomColor: tab === t ? colors.primary : "transparent" }]}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "feed" ? "For You" : "Trending"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : posts.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="rss" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nothing here yet</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Follow players to see their posts</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <PostCard post={item} colors={colors} />}
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
  composeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: "700" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  authorName: { fontSize: 14, fontWeight: "700" },
  timeAgo: { fontSize: 11 },
  content: { fontSize: 14, lineHeight: 20 },
  reactions: { flexDirection: "row", gap: 20, paddingTop: 4 },
  reactionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  reactionCount: { fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptyHint: { fontSize: 13 },
});
