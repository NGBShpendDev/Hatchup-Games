import { useAuth } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const FREE_FEATURES = [
  "Up to 6 Hatchlings",
  "5 AI Coach messages/day",
  "5 battles/day",
  "World + Country leaderboards",
  "Basic fitness tracking",
];

const PREMIUM_FEATURES = [
  "Unlimited Hatchlings",
  "Unlimited AI Coach messages",
  "Unlimited battles",
  "All leaderboard scopes (city, nearby)",
  "Advanced fitness analytics",
  "Premium cosmetic slots",
  "Priority event access",
  "Top-10 City → Free Premium",
];

const PLANS = [
  { id: "monthly", label: "Monthly", price: "$8.99", period: "/month", badge: null },
  { id: "yearly", label: "Yearly", price: "$80", period: "/year", badge: "Save 26%" },
];

interface SubData {
  tier: string;
  source: string;
  trialEndsAt?: string | null;
  paidUntil?: string | null;
  pricing?: { monthly: { unitAmount: number }; yearly: { unitAmount: number } };
}

export default function SubscriptionScreen() {
  const { getToken } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedPlan, setSelectedPlan] = React.useState("yearly");
  const [subData, setSubData] = useState<SubData | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [checkoutPending, setCheckoutPending] = useState(false);

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const baseUrl = domain ? `https://${domain}` : "";

  useEffect(() => {
    async function loadSub() {
      try {
        const token = await getToken();
        const res = await fetch(`${baseUrl}/api/subscription/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setSubData(await res.json());
      } catch { /* silent */ }
      setLoadingSub(false);
    }
    loadSub();
  }, [getToken, baseUrl]);

  async function handleUpgrade() {
    setCheckoutPending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/api/subscription/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json() as { url?: string; message?: string };
      if (!res.ok || !data.url) {
        Alert.alert("Checkout unavailable", data.message ?? "Please try again later.");
      } else {
        await Linking.openURL(data.url);
      }
    } catch {
      Alert.alert("Checkout unavailable", "Network error. Please try again.");
    }
    setCheckoutPending(false);
  }

  const isPremium = subData?.tier === "premium";
  const isTrial = subData?.source === "trial";
  const isTop10 = subData?.source === "top10";
  const trialDaysLeft = subData?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subData.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  const statusLabel = isPremium
    ? isTrial ? `Trial · ${trialDaysLeft}d left` : isTop10 ? "Premium · Top-10" : "Premium"
    : "Free";
  const statusColor = isPremium ? colors.primary : colors.mutedForeground;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Premium</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: bottomPad + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status badge */}
        {loadingSub ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 16 }} />
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18", borderColor: statusColor + "44" }]}>
            <Feather name={isPremium ? "star" : "user"} size={14} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              Current plan: <Text style={{ fontWeight: "800" }}>{statusLabel}</Text>
            </Text>
          </View>
        )}

        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "44" }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="star" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Unlock HatchUp Premium</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            No competitive advantage — Premium unlocks convenience, customization, and analytics.
          </Text>
        </View>

        {!isPremium && (
          <>
            {/* Plan selector */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose Your Plan</Text>
            <View style={styles.plansRow}>
              {PLANS.map((plan) => (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelectedPlan(plan.id)}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selectedPlan === plan.id ? colors.primary : colors.border,
                      borderWidth: selectedPlan === plan.id ? 2 : 1,
                    },
                  ]}
                >
                  {plan.badge && (
                    <View style={[styles.planBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.planBadgeText}>{plan.badge}</Text>
                    </View>
                  )}
                  <Text style={[styles.planLabel, { color: colors.mutedForeground }]}>{plan.label}</Text>
                  <Text style={[styles.planPrice, { color: colors.foreground }]}>{plan.price}</Text>
                  <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>{plan.period}</Text>
                  {selectedPlan === plan.id && (
                    <Feather name="check-circle" size={18} color={colors.primary} style={styles.planCheck} />
                  )}
                </Pressable>
              ))}
            </View>

            {/* CTA */}
            <Pressable
              style={[styles.upgradeBtn, { backgroundColor: colors.primary, opacity: checkoutPending ? 0.7 : 1 }]}
              onPress={handleUpgrade}
              disabled={checkoutPending}
            >
              {checkoutPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.upgradeBtnText}>
                  {isTrial ? "Upgrade to Premium" : "Start 7-Day Free Trial"}
                </Text>
              )}
            </Pressable>
            <Text style={[styles.trialNote, { color: colors.mutedForeground }]}>
              Cancel anytime. New players get 7 days free.
            </Text>
          </>
        )}

        {isPremium && !isTrial && (
          <View style={[styles.activeCard, { backgroundColor: "#22c55e14", borderColor: "#22c55e44" }]}>
            <Feather name="check-circle" size={18} color="#22c55e" />
            <Text style={[styles.activeText, { color: "#22c55e" }]}>
              You have Premium{isTop10 ? " via Top-10 City ranking" : ""}. All features unlocked.
            </Text>
          </View>
        )}

        {/* Top-10 explainer */}
        <View style={[styles.top10Card, { backgroundColor: colors.card, borderColor: "#f59e0b44" }]}>
          <Feather name="award" size={18} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.top10Title, { color: "#f59e0b" }]}>Top-10 City Exemption</Text>
            <Text style={[styles.top10Text, { color: colors.mutedForeground }]}>
              Rank top 10 in your city in XP, steps, workouts, battle wins, streaks, or artifacts — get Premium free.
            </Text>
          </View>
        </View>

        {/* Feature comparison */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What You Get</Text>
        <View style={styles.featuresGrid}>
          <View style={[styles.featureCol, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.colTitle, { color: colors.mutedForeground }]}>Free</Text>
            {FREE_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Feather name="check" size={13} color={colors.mutedForeground} />
                <Text style={[styles.featureText, { color: colors.mutedForeground }]}>{f}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.featureCol, { backgroundColor: colors.primary + "0f", borderColor: colors.primary + "44" }]}>
            <Text style={[styles.colTitle, { color: colors.primary }]}>Premium</Text>
            {PREMIUM_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Feather name="check" size={13} color={colors.primary} />
                <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 14 },
  statusText: { fontSize: 13 },
  heroCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 10, marginBottom: 20 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  plansRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  planCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", gap: 4, position: "relative", overflow: "hidden" },
  planBadge: { position: "absolute", top: 0, right: 0, paddingHorizontal: 8, paddingVertical: 3, borderBottomLeftRadius: 10 },
  planBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  planLabel: { fontSize: 11, fontWeight: "600" },
  planPrice: { fontSize: 22, fontWeight: "800" },
  planPeriod: { fontSize: 11 },
  planCheck: { marginTop: 4 },
  upgradeBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 8 },
  upgradeBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  trialNote: { fontSize: 12, textAlign: "center", marginBottom: 20 },
  activeCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 20 },
  activeText: { fontSize: 13, fontWeight: "600", flex: 1 },
  top10Card: { flexDirection: "row", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 20 },
  top10Title: { fontSize: 13, fontWeight: "700" },
  top10Text: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  featuresGrid: { flexDirection: "row", gap: 10 },
  featureCol: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  colTitle: { fontSize: 13, fontWeight: "800", marginBottom: 4 },
  featureRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  featureText: { fontSize: 11, flex: 1, lineHeight: 15 },
});
