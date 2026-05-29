import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetDailyStreak,
  useClaimDailyReward,
  getGetDailyStreakQueryKey,
  getGetPlayerDashboardQueryKey,
  type DailyRewardDay,
} from "@workspace/api-client-react";
import type { DailyClaimResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

const MILESTONE_DAYS = new Set([7, 14, 21, 30]);

const KIND_COLOR: Record<string, string> = {
  coins:    "#f59e0b",
  xp:       "#6366f1",
  egg:      "#22c55e",
  artifact: "#22d3ee",
  chest:    "#a855f7",
  shield:   "#22d3ee",
};

interface Props {
  visible: boolean;
  playerId: number;
  onClose: () => void;
  onClaimed?: (result: DailyClaimResult) => void;
}

export function StreakCalendarModal({ visible, playerId, onClose, onClaimed }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(60)).current;
  const shieldScaleAnim = useRef(new Animated.Value(0)).current;
  const shieldOpacityAnim = useRef(new Animated.Value(0)).current;
  const shieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shieldCelebrating, setShieldCelebrating] = useState(false);
  const [shieldInfoOpen, setShieldInfoOpen] = useState(false);
  const [claimResult, setClaimResult] = useState<DailyClaimResult | null>(null);

  const { data: streak, isLoading } = useGetDailyStreak({
    query: { queryKey: getGetDailyStreakQueryKey(), enabled: visible },
  });

  const claim = useClaimDailyReward({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlayerDashboardQueryKey(playerId) });
        setClaimResult(result);
        if (result.streakShieldGranted) triggerShieldCelebration();
        onClaimed?.(result);
      },
    },
  });

  const triggerShieldCelebration = useCallback(() => {
    if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
    setShieldCelebrating(true);
    shieldScaleAnim.setValue(0.5);
    shieldOpacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(shieldScaleAnim, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 22 }),
      Animated.timing(shieldOpacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    shieldTimerRef.current = setTimeout(() => setShieldCelebrating(false), 3000);
  }, [shieldScaleAnim, shieldOpacityAnim]);

  useEffect(() => {
    return () => { if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current); };
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, stiffness: 320, damping: 28 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetAnim, { toValue: 60, duration: 180, useNativeDriver: true }),
      ]).start();
      setClaimResult(null);
      setShieldCelebrating(false);
      setShieldInfoOpen(false);
    }
  }, [visible, backdropAnim, sheetAnim]);

  const currentDay = streak?.currentDay ?? 0;
  const alreadyClaimed = streak?.alreadyClaimed ?? false;
  const todayDayNumber = alreadyClaimed ? currentDay : currentDay + 1;
  const schedule = streak?.schedule ?? [];
  const shieldCount = streak?.streakShields ?? 0;

  function getDayState(day: number): "claimed" | "today" | "future" {
    if (day < todayDayNumber) return "claimed";
    if (day === todayDayNumber) return "today";
    return "future";
  }

  function getDayBorderColor(dayNum: number, kind: string): string {
    const state = getDayState(dayNum);
    if (state === "claimed") return "#22c55e55";
    if (state === "today") return (KIND_COLOR[kind] ?? "#ee2b8c") + "aa";
    return "#ffffff18";
  }

  function getDayBg(dayNum: number, kind: string): string {
    const state = getDayState(dayNum);
    if (state === "claimed") return "#22c55e12";
    if (state === "today") return (KIND_COLOR[kind] ?? "#ee2b8c") + "22";
    return "#ffffff06";
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[s.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          s.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY: sheetAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.flameWrap}>
            <Feather name="zap" size={20} color="#f97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.foreground }]}>Daily Login Rewards</Text>
            <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
              {currentDay > 0
                ? alreadyClaimed
                  ? `Day ${currentDay} claimed — come back tomorrow!`
                  : streak?.streakBroken
                  ? "Streak reset — start fresh today!"
                  : `🔥 ${currentDay}-day streak — claim today's reward!`
                : "Claim your first reward today!"}
            </Text>
          </View>
          <View style={s.headerRight}>
            {shieldCount > 0 && (
              <View style={s.shieldBadge}>
                <Feather name="shield" size={12} color="#22d3ee" />
                <Text style={s.shieldBadgeText}>{shieldCount}</Text>
              </View>
            )}
            <Pressable onPress={() => setShieldInfoOpen(v => !v)} hitSlop={10} style={s.infoBtn}>
              <Feather name={shieldInfoOpen ? "x" : "info"} size={14} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* Shield info panel */}
        {shieldInfoOpen && (
          <View style={s.shieldInfoPanel}>
            <View style={s.shieldInfoRow}>
              <Feather name="shield" size={14} color="#22d3ee" />
              <Text style={s.shieldInfoTitle}>What is a Streak Shield?</Text>
            </View>
            <Text style={s.shieldInfoBody}>
              A Streak Shield protects your streak if you miss a day. When you forget to log in, a shield activates automatically so your streak continues unbroken.
            </Text>
            <Text style={s.shieldInfoHint}>
              Earn shields by reaching Day 3 or Day 20, or buy one in the Shop for 200 coins.
            </Text>
          </View>
        )}

        {/* Shield used notice */}
        {streak?.shieldActive && alreadyClaimed && (
          <View style={s.shieldUsedRow}>
            <Feather name="shield" size={14} color="#22d3ee" />
            <Text style={s.shieldUsedText}>A Streak Shield was used to protect your streak!</Text>
          </View>
        )}

        {/* Streak broken notice */}
        {streak?.streakBroken && !alreadyClaimed && (
          <View style={s.brokenRow}>
            <Text style={s.brokenText}>😔 You missed a day and your streak reset to Day 1. No worries — start fresh!</Text>
          </View>
        )}

        {/* Shield celebration */}
        {shieldCelebrating && (
          <Animated.View style={[s.celebRow, { opacity: shieldOpacityAnim, transform: [{ scale: shieldScaleAnim }] }]}>
            <Feather name="shield" size={20} color="#22d3ee" />
            <View style={{ flex: 1 }}>
              <Text style={s.celebTitle}>Streak Shield Earned!</Text>
              <Text style={s.celebSub}>Your streak is protected for one missed day.</Text>
            </View>
          </Animated.View>
        )}

        {/* Claim result mini banner */}
        {claimResult && (
          <View style={s.claimResultRow}>
            <Feather name="gift" size={14} color="#f97316" />
            <Text style={s.claimResultText}>
              Day {claimResult.day} claimed!
              {claimResult.coinsGranted > 0 ? `  +${claimResult.coinsGranted} coins` : ""}
              {claimResult.xpGranted > 0 ? `  +${claimResult.xpGranted} XP` : ""}
            </Text>
          </View>
        )}

        {/* Calendar grid */}
        <ScrollView
          style={s.grid}
          contentContainerStyle={s.gridContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={s.dayGrid}>
              {schedule.map((day) => {
                const state = getDayState(day.day);
                const isShield = day.bonus === "streak_shield";
                const isMilestone = MILESTONE_DAYS.has(day.day);
                const kindColor = isShield ? "#22d3ee" : (KIND_COLOR[day.kind] ?? "#ee2b8c");

                return (
                  <View
                    key={day.day}
                    style={[
                      s.dayTile,
                      {
                        backgroundColor: getDayBg(day.day, isShield ? "shield" : day.kind),
                        borderColor: getDayBorderColor(day.day, isShield ? "shield" : day.kind),
                        borderWidth: state === "today" || isMilestone ? 1.5 : 1,
                        opacity: state === "future" ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={[s.dayNum, { color: colors.mutedForeground }]}>{day.day}</Text>
                    {state === "claimed" ? (
                      <Text style={s.dayEmoji}>✅</Text>
                    ) : isShield ? (
                      <Feather name="shield" size={14} color={kindColor} />
                    ) : (
                      <Text style={s.dayEmoji}>{day.icon}</Text>
                    )}
                    <Text style={[s.dayLabel, { color: state === "claimed" ? "#22c55e" : state === "today" ? kindColor : colors.mutedForeground }]} numberOfLines={1}>
                      {isShield ? "Shield" : day.label.replace(" Coins", "¢").replace(" XP", "xp").replace("Streak ", "")}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[s.footer, { borderTopColor: colors.border }]}>
          {streak && !alreadyClaimed && streak.todayReward && (
            <View style={[s.rewardPreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={s.rewardIcon}>{streak.todayReward.icon ?? "🎁"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.rewardLabel, { color: colors.mutedForeground }]}>Today's reward</Text>
                <Text style={[s.rewardName, { color: colors.foreground }]}>{streak.todayReward.label}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.rewardCoin}>+{streak.todayReward.coins} coins</Text>
                <Text style={s.rewardXp}>+{streak.todayReward.xp} XP</Text>
              </View>
            </View>
          )}

          {alreadyClaimed ? (
            <Pressable style={[s.btn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={onClose}>
              <Text style={[s.btnText, { color: colors.mutedForeground }]}>Come back tomorrow!</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[s.btn, { backgroundColor: "#ee2b8c", opacity: claim.isPending || isLoading ? 0.7 : 1 }]}
              onPress={() => claim.mutate()}
              disabled={claim.isPending || isLoading}
            >
              {claim.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="gift" size={16} color="#fff" />
                  <Text style={[s.btnText, { color: "#fff" }]}>Claim Day {todayDayNumber} Reward</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 18, paddingBottom: 12 },
  flameWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#f9731622", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  shieldBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#22d3ee18", borderWidth: 1, borderColor: "#22d3ee44", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  shieldBadgeText: { fontSize: 12, fontWeight: "800", color: "#22d3ee" },
  infoBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  shieldInfoPanel: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#083344", borderWidth: 1, borderColor: "#22d3ee33", borderRadius: 12, padding: 12, gap: 6 },
  shieldInfoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  shieldInfoTitle: { fontSize: 13, fontWeight: "800", color: "#a5f3fc" },
  shieldInfoBody: { fontSize: 12, color: "#67e8f9", lineHeight: 17 },
  shieldInfoHint: { fontSize: 11, color: "#67e8f9aa", marginTop: 4 },
  shieldUsedRow: { marginHorizontal: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#22d3ee14", borderWidth: 1, borderColor: "#22d3ee44", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  shieldUsedText: { flex: 1, fontSize: 12, color: "#67e8f9", fontWeight: "600" },
  brokenRow: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#450a0a", borderWidth: 1, borderColor: "#ef444433", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  brokenText: { fontSize: 12, color: "#fca5a5" },
  celebRow: { marginHorizontal: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#083344", borderWidth: 1.5, borderColor: "#22d3ee66", borderRadius: 12, padding: 12 },
  celebTitle: { fontSize: 14, fontWeight: "800", color: "#a5f3fc" },
  celebSub: { fontSize: 11, color: "#67e8f9", marginTop: 2 },
  claimResultRow: { marginHorizontal: 16, marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f9731614", borderWidth: 1, borderColor: "#f9731644", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  claimResultText: { flex: 1, fontSize: 12, color: "#fb923c", fontWeight: "600" },
  grid: { maxHeight: 260 },
  gridContent: { paddingHorizontal: 16, paddingBottom: 8 },
  loadingWrap: { paddingVertical: 32, alignItems: "center" },
  dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dayTile: {
    width: "18%",
    flexGrow: 1,
    aspectRatio: 0.9,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 4,
  },
  dayNum: { fontSize: 9, fontWeight: "800", lineHeight: 11 },
  dayEmoji: { fontSize: 14, lineHeight: 18 },
  dayLabel: { fontSize: 7, fontWeight: "700", textAlign: "center" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  rewardPreview: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  rewardIcon: { fontSize: 24 },
  rewardLabel: { fontSize: 11 },
  rewardName: { fontSize: 13, fontWeight: "700" },
  rewardCoin: { fontSize: 11, fontWeight: "700", color: "#f59e0b" },
  rewardXp: { fontSize: 11, fontWeight: "700", color: "#6366f1" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  btnText: { fontSize: 15, fontWeight: "800" },
});
