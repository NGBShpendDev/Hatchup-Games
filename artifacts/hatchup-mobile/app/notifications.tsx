import { Feather } from "@expo/vector-icons";
import { useListNotifications, useGetUnreadNotificationCount } from "@workspace/api-client-react";
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

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  challenge_invite: { icon: "flag", color: "#f59e0b" },
  battle_result: { icon: "zap", color: "#ee2b8c" },
  follow: { icon: "user-plus", color: "#3b82f6" },
  club_invite: { icon: "users", color: "#a855f7" },
  achievement: { icon: "award", color: "#f59e0b" },
  level_up: { icon: "trending-up", color: "#22c55e" },
  like: { icon: "heart", color: "#ef4444" },
  comment: { icon: "message-circle", color: "#3b82f6" },
  event: { icon: "calendar", color: "#6366f1" },
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: notifs, isLoading } = useListNotifications({ limit: 50 });
  const { data: unread } = useGetUnreadNotificationCount();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
          {(unread?.count ?? 0) > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{unread?.count}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 34 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (notifs?.length ?? 0) === 0 ? (
        <View style={styles.empty}>
          <Feather name="bell" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>All caught up!</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>New notifications will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={notifs ?? []}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: notif }) => {
            const typeInfo = TYPE_ICONS[notif.type ?? ""] ?? { icon: "bell", color: colors.primary };
            const isUnread = !notif.read;
            return (
              <Pressable
                style={[
                  styles.notifRow,
                  {
                    backgroundColor: isUnread ? colors.primary + "0a" : "transparent",
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.notifIcon, { backgroundColor: typeInfo.color + "22" }]}>
                  <Feather name={typeInfo.icon as any} size={18} color={typeInfo.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.foreground }]}>{notif.title ?? notif.type}</Text>
                  {notif.body && (
                    <Text style={[styles.notifBody, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {notif.body}
                    </Text>
                  )}
                  {notif.createdAt && (
                    <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>
                      {timeAgo(notif.createdAt)}
                    </Text>
                  )}
                </View>
                {isUnread && (
                  <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                )}
              </Pressable>
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "800" },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  notifRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  notifIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  notifTitle: { fontSize: 14, fontWeight: "600" },
  notifBody: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  notifTime: { fontSize: 11, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptyHint: { fontSize: 13 },
});
