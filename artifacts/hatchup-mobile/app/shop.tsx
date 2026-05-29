import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDailyStreak, getGetDailyStreakQueryKey,
  useBuyStreakShield,
  useUpdateShieldAutoReplenish,
  useGetCurrentPlayer, getGetCurrentPlayerQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const PLAYER_ID = 1;
const SHIELD_COST = 200;

export default function ShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: player } = useGetCurrentPlayer();
  const { data: streakData } = useGetDailyStreak();

  const coins = player?.coins ?? 0;
  const shieldCount = streakData?.streakShields ?? 0;
  const autoReplenish = player?.autoReplenishShields ?? false;
  const replenishThreshold = player?.shieldAutoReplenishThreshold ?? 2;
  const canAfford = coins >= SHIELD_COST;

  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [usdPending, setUsdPending] = useState(false);

  const buyShield = useBuyStreakShield({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCurrentPlayerQueryKey() });
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

  const updateAutoReplenish = useUpdateShieldAutoReplenish({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentPlayerQueryKey() });
      },
    },
  });

  function handleCoinBuy() {
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
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={s.headerTitle}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
          <Text style={[s.title, { color: colors.foreground }]}>Shop</Text>
        </View>
      </View>

      <View style={s.content}>

        {/* Shield Section */}
        <View style={[s.section, { backgroundColor: "#22d3ee0a", borderColor: "#22d3ee33" }]}>

          {/* Section header */}
          <View style={s.sectionHead}>
            <View style={[s.iconWrap, { backgroundColor: "#22d3ee18" }]}>
              <Feather name="shield" size={18} color="#22d3ee" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: "#a5f3fc" }]}>Streak Protection</Text>
              <Text style={[s.sectionSubtitle, { color: colors.mutedForeground }]}>
                A Shield auto-saves your streak if you miss a day — no reset.
              </Text>
            </View>
            {shieldCount > 0 && (
              <View style={[s.countBadge, { backgroundColor: "#22d3ee18", borderColor: "#22d3ee44" }]}>
                <Text style={s.countValue}>{shieldCount}</Text>
                <Text style={s.countLabel}>{shieldCount === 1 ? "shield" : "shields"}</Text>
              </View>
            )}
          </View>

          {/* Coin balance */}
          <View style={[s.balanceRow, { backgroundColor: canAfford ? "#f59e0b14" : "#ef444414", borderColor: canAfford ? "#f59e0b33" : "#ef444433" }]}>
            <Feather name="dollar-sign" size={13} color={canAfford ? "#f59e0b" : "#ef4444"} />
            <Text style={[s.balanceLabel, { color: colors.mutedForeground }]}>Your balance:</Text>
            <Text style={[s.balanceValue, { color: canAfford ? "#f59e0b" : "#ef4444" }]}>
              {coins.toLocaleString()} coins
            </Text>
            {!canAfford && (
              <Text style={[s.balanceHint, { color: "#ef4444" }]}>
                · need {(SHIELD_COST - coins).toLocaleString()} more
              </Text>
            )}
          </View>

          {message && (
            <View style={[s.message, { backgroundColor: message.ok ? "#22d3ee18" : "#ef444418", borderColor: message.ok ? "#22d3ee44" : "#ef444444" }]}>
              <Text style={[s.messageText, { color: message.ok ? "#22d3ee" : "#ef4444" }]}>{message.text}</Text>
            </View>
          )}

          {/* Coin buy button */}
          <Pressable
            onPress={handleCoinBuy}
            disabled={buyShield.isPending || !canAfford}
            style={[s.buyBtn, { opacity: (buyShield.isPending || !canAfford) ? 0.5 : 1 }]}
            testID="button-buy-shield"
          >
            {buyShield.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="shopping-cart" size={14} color="#fff" />
                <Text style={s.buyBtnText}>Buy Shield · {SHIELD_COST} coins</Text>
              </>
            )}
          </Pressable>

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={[s.dividerLine, { backgroundColor: "#22d3ee22" }]} />
            <Text style={[s.dividerText, { color: colors.mutedForeground }]}>or pay with card</Text>
            <View style={[s.dividerLine, { backgroundColor: "#22d3ee22" }]} />
          </View>

          {/* USD buttons */}
          <View style={s.usdRow}>
            <Pressable
              onPress={() => handleUsdBuy("single")}
              disabled={usdPending}
              style={[s.usdBtn, { opacity: usdPending ? 0.5 : 1, borderColor: "#22c55e55", backgroundColor: "#22c55e14" }]}
              testID="button-buy-shield-usd-single"
            >
              <Feather name="shield" size={13} color="#22c55e" />
              <Text style={[s.usdBtnText, { color: "#22c55e" }]}>$3.00 · 1 Shield</Text>
            </Pressable>
            <Pressable
              onPress={() => handleUsdBuy("bundle")}
              disabled={usdPending}
              style={[s.usdBtn, { opacity: usdPending ? 0.5 : 1, borderColor: "#a855f755", backgroundColor: "#a855f714" }]}
              testID="button-buy-shield-usd-bundle"
            >
              <Feather name="star" size={13} color="#a855f7" />
              <Text style={[s.usdBtnText, { color: "#a855f7" }]}>$20 · 10 Shields</Text>
            </Pressable>
          </View>
        </View>

        {/* Auto-replenish */}
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.toggleRow}>
            <View style={[s.iconWrap, { backgroundColor: "#22d3ee18" }]}>
              <Feather name="refresh-cw" size={16} color="#22d3ee" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Auto-replenish shields</Text>
              <Text style={[s.toggleSub, { color: colors.mutedForeground }]}>
                Buy a shield with coins when you run low
              </Text>
            </View>
            <Pressable
              role="switch"
              onPress={() => updateAutoReplenish.mutate({ data: { autoReplenishShields: !autoReplenish } })}
              disabled={updateAutoReplenish.isPending}
              style={[s.toggle, { backgroundColor: autoReplenish ? "#22d3ee" : colors.border, opacity: updateAutoReplenish.isPending ? 0.5 : 1 }]}
              testID="toggle-auto-replenish"
            >
              <View style={[s.toggleThumb, { transform: [{ translateX: autoReplenish ? 20 : 2 }] }]} />
            </Pressable>
          </View>

          {autoReplenish && (
            <View style={[s.thresholdRow, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleLabel, { color: colors.foreground }]}>Keep at least</Text>
                <Text style={[s.toggleSub, { color: colors.mutedForeground }]}>Auto-buy when shields drop below this</Text>
              </View>
              <View style={s.stepper}>
                <Pressable
                  onPress={() => updateAutoReplenish.mutate({ data: { shieldAutoReplenishThreshold: replenishThreshold - 1 } })}
                  disabled={replenishThreshold <= 1 || updateAutoReplenish.isPending}
                  style={[s.stepBtn, { backgroundColor: colors.card + "80", borderColor: colors.border, opacity: replenishThreshold <= 1 ? 0.3 : 1 }]}
                  testID="threshold-decrement"
                >
                  <Feather name="minus" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={[s.stepValue, { color: colors.foreground }]} testID="threshold-value">{replenishThreshold}</Text>
                <Pressable
                  onPress={() => updateAutoReplenish.mutate({ data: { shieldAutoReplenishThreshold: replenishThreshold + 1 } })}
                  disabled={replenishThreshold >= 10 || updateAutoReplenish.isPending}
                  style={[s.stepBtn, { backgroundColor: colors.card + "80", borderColor: colors.border, opacity: replenishThreshold >= 10 ? 0.3 : 1 }]}
                  testID="threshold-increment"
                >
                  <Feather name="plus" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Coming soon */}
        <View style={[s.comingSoon, { borderColor: colors.border }]}>
          <Feather name="shopping-bag" size={20} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
          <Text style={[s.comingSoonText, { color: colors.mutedForeground }]}>More items coming soon</Text>
        </View>

      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "800" },
  content: { padding: 16, gap: 12 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  sectionSubtitle: { fontSize: 12, marginTop: 2 },
  countBadge: { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  countValue: { fontSize: 18, fontWeight: "800", color: "#22d3ee" },
  countLabel: { fontSize: 9, fontWeight: "700", color: "#22d3ee99", textTransform: "uppercase", letterSpacing: 0.5 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  balanceLabel: { fontSize: 12 },
  balanceValue: { fontSize: 12, fontWeight: "700" },
  balanceHint: { fontSize: 11, fontWeight: "600" },
  message: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  messageText: { fontSize: 12, fontWeight: "600" },
  buyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22d3ee", borderRadius: 10, paddingVertical: 12 },
  buyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 11 },
  usdRow: { flexDirection: "row", gap: 8 },
  usdBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  usdBtnText: { fontSize: 13, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel: { fontSize: 14, fontWeight: "700" },
  toggleSub: { fontSize: 11, marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, justifyContent: "center" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", position: "absolute" },
  thresholdRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingTop: 12 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 14, fontWeight: "800", width: 24, textAlign: "center" },
  comingSoon: { alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 24 },
  comingSoonText: { fontSize: 13, fontWeight: "500" },
});
