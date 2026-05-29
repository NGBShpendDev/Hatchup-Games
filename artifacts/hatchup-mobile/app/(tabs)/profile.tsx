import { Feather } from "@expo/vector-icons";
import { useGetPlayer, useGetFitnessStats, useGetPlayerSocialProfile, useGetDailyStreak, useBuyStreakShield, getGetDailyStreakQueryKey, getGetPlayerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const SHIELD_COST = 200;

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

const MENU_ITEMS = [
  { label: "Fitness Stats", icon: "activity", color: "#22c55e", route: "/fitness" },
  { label: "Training Plan", icon: "activity", color: "#3b82f6", route: "/training" },
  { label: "Nutrition", icon: "coffee", color: "#f59e0b", route: "/nutrition" },
  { label: "AI Coach", icon: "cpu", color: "#ee2b8c", route: "/coach" },
  { label: "Nearby Players", icon: "map-pin", color: "#22c55e", route: "/nearby" },
  { label: "Social Feed", icon: "rss", color: "#3b82f6", route: "/feed" },
  { label: "Clubs", icon: "users", color: "#a855f7", route: "/clubs" },
  { label: "Leaderboard", icon: "award", color: "#f59e0b", route: "/leaderboard" },
  { label: "Events", icon: "calendar", color: "#6366f1", route: "/events" },
  { label: "Notifications", icon: "bell", color: "#ee2b8c", route: "/notifications" },
  { label: "Subscription", icon: "star", color: "#f59e0b", route: "/subscription" },
  { label: "Privacy & Settings", icon: "shield", color: "#9ca3af", route: "/settings" },
];

function StreakProtectionCard({ coins }: { coins: number }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const { data: streakData } = useGetDailyStreak();
  const shieldCount = streakData?.streakShields ?? 0;
  const canAfford = coins >= SHIELD_COST;

  const buyShield = useBuyStreakShield({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlayerQueryKey(PLAYER_ID) });
        setMessage({ text: `Shield purchased! You now have ${data.streakShields} shield${data.streakShields !== 1 ? "s" : ""}.`, ok: true });
        setTimeout(() => setMessage(null), 3000);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Could not purchase shield.";
        setMessage({ text: msg, ok: false });
        setTimeout(() => setMessage(null), 3000);
      },
    },
  });

  const [usdPending, setUsdPending] = useState(false);

  function handleBuy() {
    Alert.alert(
      "Buy Streak Shield",
      `Spend ${SHIELD_COST} coins to protect your streak for one missed day?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Buy", onPress: () => buyShield.mutate() },
      ]
    );
  }

  async function handleUsdBuy(pack: "single" | "bundle") {
    const label = pack === "bundle" ? "10 Streak Shields for $20" : "1 Streak Shield for $3";
    Alert.alert(
      "Buy with Card",
      `Purchase ${label}? You'll be taken to a secure checkout.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            try {
              setUsdPending(true);
              const res = await fetch("/api/shields/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pack }),
              });
              const data = await res.json() as { url?: string; message?: string };
              if (!res.ok || !data.url) throw new Error(data.message ?? "Checkout unavailable");
              await Linking.openURL(data.url);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Checkout unavailable";
              setMessage({ text: msg, ok: false });
              setTimeout(() => setMessage(null), 3000);
            } finally {
              setUsdPending(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[shieldStyles.card, { backgroundColor: colors.card, borderColor: "#22d3ee44" }]}>
      <View style={shieldStyles.header}>
        <View style={[shieldStyles.iconWrap, { backgroundColor: "#22d3ee18" }]}>
          <Feather name="shield" size={18} color="#22d3ee" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[shieldStyles.title, { color: colors.foreground }]}>Streak Protection</Text>
          <Text style={[shieldStyles.subtitle, { color: colors.mutedForeground }]}>
            A shield auto-saves your streak if you miss a day
          </Text>
        </View>
        <View style={[shieldStyles.countBadge, { backgroundColor: "#22d3ee18" }]}>
          <Text testID="streak-shield-count" style={shieldStyles.countText}>{shieldCount}</Text>
          <Text style={shieldStyles.countLabel}>{shieldCount === 1 ? "shield" : "shields"}</Text>
        </View>
      </View>

      {/* Coin balance row */}
      <View style={[shieldStyles.balanceRow, { backgroundColor: canAfford ? "#f59e0b14" : "#ef444414", borderColor: canAfford ? "#f59e0b33" : "#ef444433" }]}>
        <Feather name="dollar-sign" size={13} color={canAfford ? "#f59e0b" : "#ef4444"} />
        <Text style={[shieldStyles.balanceLabel, { color: colors.mutedForeground }]}>Your balance:</Text>
        <Text style={[shieldStyles.balanceValue, { color: canAfford ? "#f59e0b" : "#ef4444" }]}>
          {coins.toLocaleString()} coins
        </Text>
        {!canAfford && (
          <Text style={[shieldStyles.balanceHint, { color: "#ef4444" }]}>
            · need {(SHIELD_COST - coins).toLocaleString()} more
          </Text>
        )}
      </View>

      {message && (
        <View style={[shieldStyles.message, { backgroundColor: message.ok ? "#22d3ee18" : "#ef444418", borderColor: message.ok ? "#22d3ee44" : "#ef444444" }]}>
          <Text testID="shield-buy-message" style={[shieldStyles.messageText, { color: message.ok ? "#22d3ee" : "#ef4444" }]}>{message.text}</Text>
        </View>
      )}

      {/* Coin buy button */}
      <Pressable
        onPress={handleBuy}
        disabled={buyShield.isPending || !canAfford}
        style={[shieldStyles.buyBtn, { opacity: (buyShield.isPending || !canAfford) ? 0.5 : 1 }]}
        testID="button-buy-shield"
      >
        {buyShield.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Feather name="shopping-cart" size={14} color="#fff" />
            <Text style={shieldStyles.buyBtnText}>Buy Shield · {SHIELD_COST} coins</Text>
          </>
        )}
      </Pressable>

      {/* Divider */}
      <View style={shieldStyles.dividerRow}>
        <View style={shieldStyles.dividerLine} />
        <Text style={shieldStyles.dividerText}>or pay with card</Text>
        <View style={shieldStyles.dividerLine} />
      </View>

      {/* USD purchase buttons */}
      <View style={shieldStyles.usdRow}>
        <Pressable
          onPress={() => handleUsdBuy("single")}
          disabled={usdPending}
          style={[shieldStyles.usdBtn, { opacity: usdPending ? 0.5 : 1, borderColor: "#22c55e55", backgroundColor: "#22c55e14" }]}
          testID="button-buy-shield-usd-single"
        >
          <Feather name="shield" size={13} color="#22c55e" />
          <Text style={[shieldStyles.usdBtnText, { color: "#22c55e" }]}>$3 · 1 Shield</Text>
        </Pressable>
        <Pressable
          onPress={() => handleUsdBuy("bundle")}
          disabled={usdPending}
          style={[shieldStyles.usdBtn, { opacity: usdPending ? 0.5 : 1, borderColor: "#a855f755", backgroundColor: "#a855f714" }]}
          testID="button-buy-shield-usd-bundle"
        >
          <Feather name="star" size={13} color="#a855f7" />
          <Text style={[shieldStyles.usdBtnText, { color: "#a855f7" }]}>$20 · 10 Shields</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MenuItem({ item }: { item: typeof MENU_ITEMS[0] }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(item.route as any)}
      style={[styles.menuItem, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.color + "22" }]}>
        <Feather name={item.icon as any} size={16} color={item.color} />
      </View>
      <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: player, isLoading } = useGetPlayer(PLAYER_ID);
  const { data: fitnessStats } = useGetFitnessStats(PLAYER_ID);
  const { data: socialProfile } = useGetPlayerSocialProfile(PLAYER_ID, { viewerId: PLAYER_ID });

  async function handleShare() {
    if (!player?.username) return;
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return;
    const url = `https://${domain}/player/${encodeURIComponent(player.username)}`;
    await Share.share({ message: `Check out ${player.username}'s HatchUp profile! ${url}`, url });
  }

  const rankLabel = player?.rank ?? "Unranked";
  const rankColor = Object.entries(RANK_COLORS).find(([key]) => rankLabel.includes(key))?.[1] ?? colors.mutedForeground;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
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
              <Text style={[styles.displayName, { color: colors.mutedForeground }]}>{player.displayName}</Text>
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
          </>
        )}

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          {[
            { label: "XP", value: (player?.xp ?? 0).toLocaleString(), route: null },
            { label: "Wins", value: String(player?.totalWins ?? 0), route: null },
            { label: "Followers", value: (socialProfile?.followerCount ?? 0).toLocaleString(), route: "/followers" },
            { label: "Following", value: (socialProfile?.followingCount ?? 0).toLocaleString(), route: "/following" },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
              {s.route ? (
                <Pressable
                  style={styles.quickStat}
                  onPress={() => router.push(s.route as any)}
                  testID={`button-open-${s.label.toLowerCase()}-list`}
                >
                  <Text style={[styles.quickStatValue, { color: colors.foreground }]}>{s.value}</Text>
                  <Text style={[styles.quickStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </Pressable>
              ) : (
                <View style={styles.quickStat}>
                  <Text style={[styles.quickStatValue, { color: colors.foreground }]}>{s.value}</Text>
                  <Text style={[styles.quickStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Share button — only visible once real player data is available */}
        {!isLoading && player?.username && (
          <Pressable
            onPress={handleShare}
            style={[styles.shareBtn, { borderColor: colors.primary }]}
            testID="button-share-profile"
          >
            <Feather name="share-2" size={14} color={colors.primary} />
            <Text style={[styles.shareBtnText, { color: colors.primary }]}>Share Profile</Text>
          </Pressable>
        )}
      </View>

      {/* Streak Protection */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <StreakProtectionCard coins={player?.coins ?? 0} />
      </View>

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {MENU_ITEMS.map((item, i) => (
          <React.Fragment key={item.label}>
            <MenuItem item={item} />
          </React.Fragment>
        ))}
      </View>

      {player?.createdAt && (
        <Text style={[styles.joinedAt, { color: colors.mutedForeground }]}>
          Trainer since {new Date(player.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, marginBottom: 16 },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, padding: 4, marginBottom: 12 },
  avatarInner: { flex: 1, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  username: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  displayName: { fontSize: 14, marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" },
  levelBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rankBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  rankDot: { width: 7, height: 7, borderRadius: 4 },
  rankText: { fontSize: 12, fontWeight: "700" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  verifiedText: { fontSize: 11, fontWeight: "600" },
  quickStats: { flexDirection: "row", alignItems: "center", marginTop: 16, width: "100%" },
  quickStat: { flex: 1, alignItems: "center", gap: 2 },
  quickStatValue: { fontSize: 18, fontWeight: "800" },
  quickStatLabel: { fontSize: 10 },
  statDivider: { width: 1, height: 28 },
  menuCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderBottomWidth: 1 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  joinedAt: { textAlign: "center", fontSize: 12, marginTop: 16 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  shareBtnText: { fontSize: 13, fontWeight: "700" },
});

const shieldStyles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  countBadge: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  countText: { fontSize: 20, fontWeight: "900", color: "#22d3ee" },
  countLabel: { fontSize: 10, color: "#22d3ee", fontWeight: "600" },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  balanceLabel: { fontSize: 12 },
  balanceValue: { fontSize: 12, fontWeight: "700" },
  balanceHint: { fontSize: 12, fontWeight: "600" },
  message: { borderRadius: 8, borderWidth: 1, padding: 10 },
  messageText: { fontSize: 13, fontWeight: "600" },
  buyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22d3ee", borderRadius: 12, paddingVertical: 11 },
  buyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#22d3ee1a" },
  dividerText: { fontSize: 10, color: "#22d3ee55", fontWeight: "500" },
  usdRow: { flexDirection: "row", gap: 8 },
  usdBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 9 },
  usdBtnText: { fontSize: 13, fontWeight: "700" },
});
