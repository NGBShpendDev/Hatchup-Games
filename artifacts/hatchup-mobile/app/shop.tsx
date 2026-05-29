import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Alert, Linking, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentPlayer, getGetCurrentPlayerQueryKey,
  useGetDailyStreak, getGetDailyStreakQueryKey,
  useGetCoinPacks, getGetCoinPacksQueryKey,
  useBuyCoinPack,
  useBuyIncubatorSlotWithCoins,
  useBuyStreakShield,
  useUpdateShieldAutoReplenish,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useCurrentPlayerId } from "@/providers/CurrentPlayerProvider";

const SHIELD_COST  = 200;
const SLOT_COST    = 300;

type Msg = { text: string; ok: boolean };

export default function ShopScreen() {
  useCurrentPlayerId();
  const colors       = useColors();
  const insets       = useSafeAreaInsets();
  const router       = useRouter();
  const qc           = useQueryClient();
  const topPad       = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad    = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: player }    = useGetCurrentPlayer();
  const { data: streakData } = useGetDailyStreak();
  const { data: catalog }   = useGetCoinPacks();

  const coins         = player?.coins ?? 0;
  const shieldCount   = streakData?.streakShields ?? 0;
  const extraSlots    = player?.extraIncubatorSlots ?? 0;
  const autoReplenish      = streakData?.autoReplenishShields ?? false;
  const replenishThreshold = streakData?.shieldAutoReplenishThreshold ?? 2;

  const [shieldMsg, setShieldMsg]   = useState<Msg | null>(null);
  const [slotMsg,   setSlotMsg]     = useState<Msg | null>(null);
  const [coinPending, setCoinPending] = useState<string | null>(null);

  function flash(setter: (m: Msg | null) => void, msg: Msg) {
    setter(msg);
    setTimeout(() => setter(null), 3500);
  }

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: getGetCurrentPlayerQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
    qc.invalidateQueries({ queryKey: getGetCoinPacksQueryKey() });
  }

  const buyShield = useBuyStreakShield({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        flash(setShieldMsg, {
          text: `Shield purchased! You now have ${data.streakShields} shield${data.streakShields !== 1 ? "s" : ""}.`,
          ok: true,
        });
      },
      onError: (err: any) => {
        flash(setShieldMsg, { text: err?.response?.data?.error ?? "Could not buy shield.", ok: false });
      },
    },
  });

  const buySlot = useBuyIncubatorSlotWithCoins({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        flash(setSlotMsg, {
          text: `Slot added! You now have ${data.totalSlots} incubator slots. ${data.coinsRemaining.toLocaleString()} coins remaining.`,
          ok: true,
        });
      },
      onError: (err: any) => {
        const d = err?.response?.data;
        const msg = d?.message ?? d?.error ?? "Could not buy slot.";
        flash(setSlotMsg, { text: msg, ok: false });
      },
    },
  });

  const purchaseCoinPack = useBuyCoinPack({
    mutation: {
      onSuccess: async (data) => {
        setCoinPending(null);
        if (data.url) await Linking.openURL(data.url);
      },
      onError: (err: any) => {
        setCoinPending(null);
        Alert.alert("Checkout unavailable", err?.response?.data?.message ?? "Please try again.");
      },
    },
  });

  const updateAutoReplenish = useUpdateShieldAutoReplenish({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetCurrentPlayerQueryKey() }); },
    },
  });

  function handleBuyPack(packId: string) {
    Alert.alert(
      "Buy Coins",
      "You'll be taken to a secure checkout — Apple Pay, Google Pay, and card are all accepted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            setCoinPending(packId);
            purchaseCoinPack.mutate({ data: { packId: packId as any } });
          },
        },
      ]
    );
  }

  function handleBuyShield() {
    Alert.alert(
      "Buy Streak Shield",
      `Spend ${SHIELD_COST} coins to protect your streak for one missed day?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Buy", onPress: () => buyShield.mutate() },
      ]
    );
  }

  function handleBuySlot() {
    Alert.alert(
      "Buy Extra Egg Slot",
      `Spend ${SLOT_COST} coins to add one extra incubator slot (max 8 total)?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Buy", onPress: () => buySlot.mutate() },
      ]
    );
  }

  const packs = catalog?.packs ?? [];

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={s.headerTitle}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
          <Text style={[s.title, { color: colors.foreground }]}>Shop</Text>
        </View>
        {/* Coin balance pill */}
        <View style={[s.coinPill, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b44" }]}>
          <Text style={s.coinPillIcon}>🪙</Text>
          <Text style={[s.coinPillText, { color: "#f59e0b" }]}>{coins.toLocaleString()}</Text>
        </View>
      </View>

      <View style={s.content}>

        {/* ── Buy Coins ──────────────────────────────────────────────── */}
        <View style={[s.section, { backgroundColor: "#a855f70a", borderColor: "#a855f733" }]}>
          <View style={s.sectionHead}>
            <View style={[s.iconWrap, { backgroundColor: "#a855f718" }]}>
              <Text style={{ fontSize: 18 }}>🪙</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: "#d8b4fe" }]}>Buy Coins</Text>
              <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>
                Apple Pay, Google Pay &amp; card accepted
              </Text>
            </View>
          </View>

          <View style={s.packGrid}>
            {packs.map((pack) => {
              const isLoading = coinPending === pack.id;
              const dollars   = (pack.price / 100).toFixed(0);
              return (
                <Pressable
                  key={pack.id}
                  onPress={() => handleBuyPack(pack.id)}
                  disabled={!!coinPending}
                  style={[
                    s.packCard,
                    { borderColor: pack.badge ? "#a855f766" : colors.border, backgroundColor: pack.badge ? "#a855f710" : colors.card },
                    coinPending && !isLoading && { opacity: 0.5 },
                  ]}
                  testID={`btn-coin-pack-${pack.id}`}
                >
                  {pack.badge && (
                    <View style={s.packBadge}>
                      <Text style={s.packBadgeText}>{pack.badge}</Text>
                    </View>
                  )}
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#a855f7" style={{ marginVertical: 8 }} />
                  ) : (
                    <>
                      <Text style={[s.packCoins, { color: "#f59e0b" }]}>{pack.coins.toLocaleString()}</Text>
                      <Text style={[s.packCoinsLabel, { color: colors.mutedForeground }]}>coins</Text>
                      <View style={[s.packPricePill, { backgroundColor: "#a855f7", marginTop: 8 }]}>
                        <Text style={s.packPriceText}>${dollars}</Text>
                      </View>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>

          {packs.length === 0 && (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color="#a855f7" />
              <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading packs…</Text>
            </View>
          )}
        </View>

        {/* ── Spend Coins ────────────────────────────────────────────── */}
        <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>SPEND COINS</Text>

        {/* Streak Shield */}
        <View style={[s.section, { backgroundColor: "#22d3ee0a", borderColor: "#22d3ee33" }]}>
          <View style={s.sectionHead}>
            <View style={[s.iconWrap, { backgroundColor: "#22d3ee18" }]}>
              <Feather name="shield" size={18} color="#22d3ee" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: "#a5f3fc" }]}>Streak Shield</Text>
              <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>
                Auto-saves your streak if you miss a day
              </Text>
            </View>
            {shieldCount > 0 && (
              <View style={[s.countBadge, { backgroundColor: "#22d3ee18", borderColor: "#22d3ee44" }]}>
                <Text style={s.countValue}>{shieldCount}</Text>
                <Text style={s.countLabel}>{shieldCount === 1 ? "owned" : "owned"}</Text>
              </View>
            )}
          </View>

          {shieldMsg && (
            <View style={[s.msgRow, { backgroundColor: shieldMsg.ok ? "#22d3ee18" : "#ef444418", borderColor: shieldMsg.ok ? "#22d3ee44" : "#ef444444" }]}>
              <Text style={[s.msgText, { color: shieldMsg.ok ? "#22d3ee" : "#ef4444" }]}>{shieldMsg.text}</Text>
            </View>
          )}

          <Pressable
            onPress={handleBuyShield}
            disabled={buyShield.isPending || coins < SHIELD_COST}
            style={[s.spendBtn, { backgroundColor: "#22d3ee", opacity: (buyShield.isPending || coins < SHIELD_COST) ? 0.45 : 1 }]}
            testID="btn-buy-shield-coins"
          >
            {buyShield.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Text style={s.coinIcon}>🪙</Text><Text style={s.spendBtnText}>Buy · {SHIELD_COST} coins</Text></>}
          </Pressable>

          {coins < SHIELD_COST && (
            <Text style={[s.needMoreHint, { color: "#ef4444" }]}>
              Need {(SHIELD_COST - coins).toLocaleString()} more coins
            </Text>
          )}
        </View>

        {/* Extra Egg Slot */}
        <View style={[s.section, { backgroundColor: "#f59e0b0a", borderColor: "#f59e0b33" }]}>
          <View style={s.sectionHead}>
            <View style={[s.iconWrap, { backgroundColor: "#f59e0b18" }]}>
              <Text style={{ fontSize: 18 }}>🥚</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: "#fde68a" }]}>Extra Egg Slot</Text>
              <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>
                Hatch one more egg at a time (max 8 total)
              </Text>
            </View>
            {extraSlots > 0 && (
              <View style={[s.countBadge, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b44" }]}>
                <Text style={[s.countValue, { color: "#f59e0b" }]}>{extraSlots}</Text>
                <Text style={[s.countLabel, { color: "#f59e0b99" }]}>extra</Text>
              </View>
            )}
          </View>

          {slotMsg && (
            <View style={[s.msgRow, { backgroundColor: slotMsg.ok ? "#22c55e18" : "#ef444418", borderColor: slotMsg.ok ? "#22c55e44" : "#ef444444" }]}>
              <Text style={[s.msgText, { color: slotMsg.ok ? "#22c55e" : "#ef4444" }]}>{slotMsg.text}</Text>
            </View>
          )}

          <Pressable
            onPress={handleBuySlot}
            disabled={buySlot.isPending || coins < SLOT_COST || extraSlots >= 5}
            style={[s.spendBtn, { backgroundColor: "#f59e0b", opacity: (buySlot.isPending || coins < SLOT_COST || extraSlots >= 5) ? 0.45 : 1 }]}
            testID="btn-buy-incubator-slot"
          >
            {buySlot.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : extraSlots >= 5
                ? <Text style={s.spendBtnText}>Max slots reached</Text>
                : <><Text style={s.coinIcon}>🪙</Text><Text style={s.spendBtnText}>Buy · {SLOT_COST} coins</Text></>}
          </Pressable>

          {coins < SLOT_COST && extraSlots < 5 && (
            <Text style={[s.needMoreHint, { color: "#ef4444" }]}>
              Need {(SLOT_COST - coins).toLocaleString()} more coins
            </Text>
          )}
        </View>

        {/* ── Auto-replenish ─────────────────────────────────────────── */}
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.toggleRow}>
            <View style={[s.iconWrap, { backgroundColor: "#22d3ee18" }]}>
              <Feather name="refresh-cw" size={16} color="#22d3ee" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Auto-replenish shields</Text>
              <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>
                Auto-buy a shield with coins when you run low
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
                <Text style={[s.sectionSub, { color: colors.mutedForeground }]}>Auto-buy when shields drop below this</Text>
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

      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle:   { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title:         { fontSize: 20, fontWeight: "800" },
  coinPill:      { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  coinPillIcon:  { fontSize: 13 },
  coinPillText:  { fontSize: 13, fontWeight: "800" },
  content:       { padding: 16, gap: 12 },
  groupLabel:    { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 4, marginBottom: -4 },
  section:       { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  sectionHead:   { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap:      { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sectionTitle:  { fontSize: 14, fontWeight: "700" },
  sectionSub:    { fontSize: 12, marginTop: 2 },
  countBadge:    { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  countValue:    { fontSize: 18, fontWeight: "800", color: "#22d3ee" },
  countLabel:    { fontSize: 9, fontWeight: "700", color: "#22d3ee99", textTransform: "uppercase", letterSpacing: 0.5 },
  packGrid:      { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  packCard:      { flex: 1, minWidth: "42%", borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center", gap: 2, position: "relative" },
  packBadge:     { position: "absolute", top: -8, right: 8, backgroundColor: "#a855f7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  packBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
  packCoins:     { fontSize: 22, fontWeight: "900" },
  packCoinsLabel: { fontSize: 11, fontWeight: "600" },
  packPricePill: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 5 },
  packPriceText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  loadingRow:    { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 12 },
  loadingText:   { fontSize: 13 },
  msgRow:        { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  msgText:       { fontSize: 12, fontWeight: "600" },
  spendBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12 },
  coinIcon:      { fontSize: 14 },
  spendBtnText:  { color: "#fff", fontSize: 14, fontWeight: "700" },
  needMoreHint:  { fontSize: 11, fontWeight: "600", textAlign: "center" },
  toggleRow:     { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel:   { fontSize: 14, fontWeight: "600" },
  toggle:        { width: 44, height: 26, borderRadius: 13, justifyContent: "center" },
  toggleThumb:   { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  thresholdRow:  { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingTop: 12 },
  stepper:       { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn:       { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue:     { fontSize: 16, fontWeight: "700", minWidth: 24, textAlign: "center" },
});
