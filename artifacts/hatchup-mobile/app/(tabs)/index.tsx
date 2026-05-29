import { Feather } from "@expo/vector-icons";
import {
  useGetActiveQuests,
  useGetPlayerDashboard,
  useListHatchlings,
  useGetUnreadNotificationCount,
  useGetDailyStreak,
  useClaimDailyReward,
  getGetDailyStreakQueryKey,
  getGetPlayerDashboardQueryKey,
} from "@workspace/api-client-react";
import type { DailyClaimResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getRarityColor, capitalize } from "@/constants/rarity";

const PLAYER_ID = 1;

interface RewardSummaryModalProps {
  result: DailyClaimResult | null;
  onDismiss: () => void;
}

function RewardSummaryModal({ result, onDismiss }: RewardSummaryModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (result) {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, stiffness: 320, damping: 24 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [result, scaleAnim, opacityAnim]);

  if (!result) return null;

  const rows: { icon: string; iconColor: string; label: string; value: string }[] = [];
  if (result.coinsGranted > 0) {
    rows.push({ icon: "dollar-sign", iconColor: "#f59e0b", label: "Coins earned", value: `+${result.coinsGranted}` });
  }
  if (result.xpGranted > 0) {
    rows.push({ icon: "zap", iconColor: "#6366f1", label: "XP earned", value: `+${result.xpGranted} XP` });
  }
  if (result.eggAdded) {
    rows.push({ icon: "package", iconColor: "#22c55e", label: "Bonus egg", value: "Added to inventory" });
  }
  if (result.artifactGranted) {
    rows.push({ icon: "star", iconColor: "#a855f7", label: result.artifactGranted.artifactName, value: "Artifact unlocked" });
  }
  if (result.streakShieldGranted) {
    rows.push({ icon: "shield", iconColor: "#22d3ee", label: "Streak Shield", value: "Protect a missed day" });
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={rewardModalStyles.backdrop} onPress={onDismiss}>
        <Animated.View
          style={[
            rewardModalStyles.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
            { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Pressable>
            {/* Header */}
            <View style={rewardModalStyles.header}>
              <View style={rewardModalStyles.iconWrap}>
                <Feather name="gift" size={24} color="#f97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[rewardModalStyles.title, { color: colors.foreground }]}>Day {result.day} Claimed!</Text>
                <Text style={[rewardModalStyles.sub, { color: colors.mutedForeground }]}>
                  Here's what you earned
                </Text>
              </View>
              <Pressable onPress={onDismiss} hitSlop={12}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Divider */}
            <View style={[rewardModalStyles.divider, { backgroundColor: colors.border }]} />

            {/* Reward rows */}
            <View style={rewardModalStyles.rows}>
              {rows.length === 0 ? (
                <Text style={[rewardModalStyles.emptyText, { color: colors.mutedForeground }]}>Streak maintained!</Text>
              ) : (
                rows.map((row, i) => (
                  <View key={i} style={[rewardModalStyles.row, { borderColor: colors.border }]}>
                    <View style={[rewardModalStyles.rowIcon, { backgroundColor: row.iconColor + "22" }]}>
                      <Feather name={row.icon as any} size={18} color={row.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[rewardModalStyles.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
                    </View>
                    <Text style={[rewardModalStyles.rowValue, { color: row.iconColor }]}>{row.value}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Collect button */}
            <Pressable
              onPress={onDismiss}
              style={rewardModalStyles.collectBtn}
              testID="button-collect-rewards"
            >
              <Feather name="check-circle" size={16} color="#fff" />
              <Text style={rewardModalStyles.collectBtnText}>Collect</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function StreakClaimCard() {
  const colors = useColors();
  const queryClient = useQueryClient();

  const shieldScaleAnim = useRef(new Animated.Value(0)).current;
  const shieldOpacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const shieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shieldCelebrating, setShieldCelebrating] = useState(false);
  const [claimResult, setClaimResult] = useState<DailyClaimResult | null>(null);

  const { data: streak, isLoading } = useGetDailyStreak();
  const shieldCount = streak?.streakShields ?? 0;
  const shieldActive = streak?.shieldActive ?? false;
  const alreadyClaimed = streak?.alreadyClaimed ?? false;
  const currentDay = streak?.currentDay ?? 0;

  const triggerShieldCelebration = useCallback(() => {
    if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
    setShieldCelebrating(true);
    shieldScaleAnim.setValue(0.5);
    shieldOpacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(shieldScaleAnim, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 22 }),
      Animated.timing(shieldOpacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    ).start();
    shieldTimerRef.current = setTimeout(() => {
      Animated.timing(shieldOpacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setShieldCelebrating(false);
      });
    }, 2500);
  }, [shieldScaleAnim, shieldOpacityAnim, glowAnim]);

  useEffect(() => {
    return () => {
      if (shieldTimerRef.current) clearTimeout(shieldTimerRef.current);
    };
  }, []);

  const claim = useClaimDailyReward({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlayerDashboardQueryKey(PLAYER_ID) });
        setClaimResult(result);
        if (result.streakShieldGranted) {
          triggerShieldCelebration();
        }
      },
    },
  });

  if (isLoading || !streak) return null;

  return (
    <>
    <RewardSummaryModal result={claimResult} onDismiss={() => setClaimResult(null)} />
    <View style={[claimStyles.card, { backgroundColor: colors.card, borderColor: "#f97316" + "44" }]}>
      {/* Header row */}
      <View style={claimStyles.headerRow}>
        <View style={[claimStyles.flameWrap, { backgroundColor: "#f97316" + "22" }]}>
          <Feather name="zap" size={18} color="#f97316" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[claimStyles.title, { color: colors.foreground }]}>Daily Login Reward</Text>
          <Text style={[claimStyles.subtitle, { color: colors.mutedForeground }]}>
            {alreadyClaimed
              ? `Day ${currentDay} claimed — come back tomorrow!`
              : currentDay > 0
              ? `🔥 ${currentDay}-day streak — claim today's reward!`
              : "Claim your first reward today!"}
          </Text>
        </View>
        {(shieldCount > 0 || shieldCelebrating) && (
          <Animated.View
            style={[
              claimStyles.shieldBadge,
              shieldCelebrating && { transform: [{ scale: shieldScaleAnim }] },
            ]}
          >
            <Feather name="shield" size={13} color="#22d3ee" />
            <Text style={claimStyles.shieldBadgeText}>{shieldCount}</Text>
          </Animated.View>
        )}
      </View>

      {/* Shield info row — shown when holding shields (not celebrating) */}
      {shieldCount > 0 && !shieldCelebrating && (
        <View style={claimStyles.shieldInfoRow}>
          <Feather name="info" size={12} color="#22d3ee" />
          <Text style={claimStyles.shieldInfoText}>
            A Streak Shield protects your streak if you miss a day — it activates automatically.
          </Text>
        </View>
      )}

      {/* Shield used notice */}
      {shieldActive && alreadyClaimed && (
        <View style={claimStyles.shieldUsedRow}>
          <Feather name="shield" size={14} color="#22d3ee" />
          <Text style={claimStyles.shieldUsedText}>A Streak Shield was used to protect your streak!</Text>
        </View>
      )}

      {/* Shield celebration banner */}
      {shieldCelebrating && (
        <Animated.View
          style={[
            claimStyles.celebrationBanner,
            { opacity: shieldOpacityAnim, transform: [{ scale: shieldScaleAnim }] },
          ]}
        >
          {/* Pulsing glow overlay */}
          <Animated.View
            style={[claimStyles.glowOverlay, { opacity: glowAnim }]}
            pointerEvents="none"
          />
          <View style={claimStyles.celebrationIconWrap}>
            <Feather name="shield" size={28} color="#67e8f9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={claimStyles.celebrationTitle}>Streak Shield Earned!</Text>
            <Text style={claimStyles.celebrationSub}>Your streak is protected for one missed day.</Text>
          </View>
        </Animated.View>
      )}

      {/* Claim button */}
      {!alreadyClaimed && !shieldCelebrating && (
        <Pressable
          onPress={() => claim.mutate()}
          disabled={claim.isPending}
          style={[claimStyles.claimBtn, { opacity: claim.isPending ? 0.6 : 1 }]}
          testID="button-claim-daily-reward"
        >
          {claim.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Feather name="gift" size={15} color="#fff" />
              <Text style={claimStyles.claimBtnText}>Claim Day {currentDay + 1} Reward</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
    </>
  );
}

interface QuickLinkProps {
  label: string;
  icon: string;
  color: string;
  route: string;
}

function QuickLink({ label, icon, color, route }: QuickLinkProps) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(route as any)}
      style={[styles.quickLink, { backgroundColor: colors.card, borderColor: color + "44" }]}
    >
      <View style={[styles.quickLinkIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.quickLinkLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function XPBar({ current, max }: { current: number; max: number }) {
  const colors = useColors();
  const pct = Math.min(1, current / Math.max(max, 1));
  return (
    <View style={[styles.xpTrack, { backgroundColor: colors.border }]}>
      <View style={[styles.xpFill, { width: `${pct * 100}%` as any, backgroundColor: colors.primary }]} />
    </View>
  );
}

const QUICK_LINKS: QuickLinkProps[] = [
  { label: "Social", icon: "rss", color: "#3b82f6", route: "/feed" },
  { label: "Clubs", icon: "users", color: "#a855f7", route: "/clubs" },
  { label: "Events", icon: "calendar", color: "#f59e0b", route: "/events" },
  { label: "Nearby", icon: "map-pin", color: "#22c55e", route: "/nearby" },
  { label: "Leaderboard", icon: "award", color: "#f59e0b", route: "/leaderboard" },
  { label: "AI Coach", icon: "cpu", color: "#ee2b8c", route: "/coach" },
  { label: "Training", icon: "activity", color: "#3b82f6", route: "/training" },
  { label: "Nutrition", icon: "coffee", color: "#22c55e", route: "/nutrition" },
  { label: "Fitness", icon: "heart", color: "#ef4444", route: "/fitness" },
  { label: "My Pal", icon: "star", color: "#f59e0b", route: "/my-pal" },
  { label: "Evolutions", icon: "trending-up", color: "#6366f1", route: "/evolutions" },
  { label: "Subscription", icon: "zap", color: "#ee2b8c", route: "/subscription" },
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: dashboard, isLoading: loadingDash } = useGetPlayerDashboard(PLAYER_ID);
  const { data: hatchlings } = useListHatchlings({ playerId: PLAYER_ID, limit: 1 });
  const { data: quests } = useGetActiveQuests(PLAYER_ID);
  const { data: unread } = useGetUnreadNotificationCount();

  const activePal = hatchlings?.[0];
  const rarityColor = activePal ? getRarityColor(activePal.rarity) : colors.primary;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.appTitle, { color: colors.primary }]}>HatchUp</Text>
          <Text style={[styles.welcomeSub, { color: colors.mutedForeground }]}>
            {loadingDash ? "Loading..." : `Welcome back, ${dashboard?.player.username ?? "Trainer"}`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/shop")}
            style={[styles.iconBtn, { borderColor: colors.border }]}
          >
            <Feather name="shopping-bag" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/notifications")}
            style={[styles.iconBtn, { borderColor: colors.border }]}
          >
            <Feather name="bell" size={20} color={colors.mutedForeground} />
            {(unread?.count ?? 0) > 0 && (
              <View style={[styles.badgeDot, { backgroundColor: colors.primary }]} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Player Card */}
      {loadingDash ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : dashboard ? (
        <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
            <Feather name="user" size={32} color={colors.primary} />
          </View>
          <View style={styles.playerInfo}>
            <View style={styles.playerRow}>
              <Text style={[styles.playerName, { color: colors.foreground }]}>{dashboard.player.username}</Text>
              <View style={[styles.levelBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.levelText}>Lv {dashboard.player.level}</Text>
              </View>
            </View>
            <Text style={[styles.rankLabel, { color: colors.mutedForeground }]}>{dashboard.player.rank ?? "Unranked"}</Text>
            <XPBar current={dashboard.player.xp ?? 0} max={(dashboard.player.level ?? 1) * 500} />
            <Text style={[styles.xpText, { color: colors.mutedForeground }]}>{dashboard.player.xp ?? 0} XP</Text>
          </View>
        </View>
      ) : null}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Steps", value: (dashboard?.fitnessStats.todaySteps ?? 0).toLocaleString(), icon: "activity" },
          { label: "Streak", value: `${dashboard?.fitnessStats.currentStreak ?? 0}d`, icon: "zap" },
          { label: "Wins", value: String(dashboard?.totalWins ?? 0), icon: "award" },
        ].map((s) => (
          <View key={s.label} style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={s.icon as any} size={14} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Daily Streak Claim */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <StreakClaimCard />
      </View>

      {/* Active Pal */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Pal</Text>
      {activePal ? (
        <Pressable
          onPress={() => router.push(`/hatchling/${activePal.id}` as any)}
          style={[styles.palCard, { backgroundColor: colors.card, borderColor: rarityColor + "66" }]}
        >
          <View style={[styles.palAura, { backgroundColor: rarityColor + "18" }]}>
            <Feather name="zap" size={40} color={rarityColor} />
          </View>
          <View style={styles.palDetails}>
            <View style={styles.palNameRow}>
              <Text style={[styles.palName, { color: colors.foreground }]}>{activePal.name}</Text>
              <View style={[styles.rarityPill, { backgroundColor: rarityColor + "28", borderColor: rarityColor + "88" }]}>
                <Text style={[styles.rarityText, { color: rarityColor }]}>{capitalize(activePal.rarity)}</Text>
              </View>
            </View>
            <Text style={[styles.palSpecies, { color: colors.mutedForeground }]}>
              {activePal.species ?? "Unknown"} · Lv {activePal.level ?? 1}
            </Text>
            <View style={[styles.palMiniBar, { backgroundColor: colors.border }]}>
              <View style={[styles.palMiniBarFill, { width: `${activePal.happiness ?? 0}%` as any, backgroundColor: rarityColor }]} />
            </View>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="star" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active pal yet</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Hatch an egg to get started</Text>
        </View>
      )}

      {/* Explore */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Explore</Text>
      <View style={styles.quickLinksGrid}>
        {QUICK_LINKS.map((ql) => (
          <QuickLink key={ql.label} {...ql} />
        ))}
      </View>

      {/* Active Quests */}
      {(quests?.length ?? 0) > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Quests</Text>
          {quests!.slice(0, 2).map((q) => (
            <View key={q.id} style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="flag" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.questName, { color: colors.foreground }]}>{q.title}</Text>
                <Text style={[styles.questDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {q.description}
                </Text>
              </View>
              <Text style={[styles.questReward, { color: colors.primary }]}>+{q.xpReward} XP</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  appTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  welcomeSub: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badgeDot: { position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  playerCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", gap: 14, marginBottom: 14 },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  playerInfo: { flex: 1, gap: 4 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playerName: { fontSize: 18, fontWeight: "700" },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  levelText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  rankLabel: { fontSize: 12 },
  xpTrack: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  xpFill: { height: 4, borderRadius: 2 },
  xpText: { fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  statChip: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", paddingHorizontal: 20, marginBottom: 10 },
  palCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1.5, padding: 14, flexDirection: "row", gap: 12, marginBottom: 20, alignItems: "center" },
  palAura: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  palDetails: { flex: 1, gap: 5 },
  palNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  palName: { fontSize: 16, fontWeight: "700" },
  rarityPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityText: { fontSize: 11, fontWeight: "600" },
  palSpecies: { fontSize: 12 },
  palMiniBar: { height: 3, borderRadius: 2, overflow: "hidden" },
  palMiniBarFill: { height: 3, borderRadius: 2 },
  emptyCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 28, alignItems: "center", gap: 8, marginBottom: 20 },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptyHint: { fontSize: 13 },
  quickLinksGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10, marginBottom: 20 },
  quickLink: { width: "22%", flexGrow: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: "center", gap: 6 },
  quickLinkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  quickLinkLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  questCard: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  questName: { fontSize: 14, fontWeight: "600" },
  questDesc: { fontSize: 12, marginTop: 2 },
  questReward: { fontSize: 13, fontWeight: "700" },
});

const claimStyles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  flameWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  shieldBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22d3ee18", borderWidth: 1, borderColor: "#22d3ee44", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  shieldBadgeText: { fontSize: 13, fontWeight: "800", color: "#22d3ee" },
  celebrationBanner: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#22d3ee99",
    backgroundColor: "#083344",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  glowOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#22d3ee66",
  },
  celebrationIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#22d3ee22", borderWidth: 1, borderColor: "#22d3ee55", alignItems: "center", justifyContent: "center" },
  celebrationTitle: { fontSize: 15, fontWeight: "800", color: "#a5f3fc" },
  celebrationSub: { fontSize: 12, color: "#67e8f9", marginTop: 2 },
  claimBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#f97316", borderRadius: 12, paddingVertical: 11 },
  claimBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  shieldInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#22d3ee0d", borderRadius: 10, borderWidth: 1, borderColor: "#22d3ee33", paddingHorizontal: 10, paddingVertical: 8 },
  shieldInfoText: { flex: 1, fontSize: 11, color: "#67e8f9", lineHeight: 16 },
  shieldUsedRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#22d3ee14", borderRadius: 10, borderWidth: 1, borderColor: "#22d3ee44", paddingHorizontal: 10, paddingVertical: 8 },
  shieldUsedText: { flex: 1, fontSize: 12, color: "#67e8f9", fontWeight: "600" },
});

const rewardModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    borderRadius: 24,
    padding: 20,
    gap: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f97316" + "22",
    borderWidth: 1,
    borderColor: "#f97316" + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 13, marginTop: 2 },
  divider: { height: 1, marginBottom: 16 },
  rows: { gap: 10, marginBottom: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 14, fontWeight: "600" },
  rowValue: { fontSize: 14, fontWeight: "800" },
  emptyText: { fontSize: 14, textAlign: "center", paddingVertical: 8 },
  collectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingVertical: 13,
  },
  collectBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
