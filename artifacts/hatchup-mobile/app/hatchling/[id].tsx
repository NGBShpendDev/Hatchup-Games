import { Feather } from "@expo/vector-icons";
import { useGetHatchling, useEvolveHatchling } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { getRarityColor, capitalize } from "@/constants/rarity";

// Stage thresholds mirror the web app and server logic:
// Stage 1 → 2 at level 5, Stage 2 → 3 at level 15.
const EVOLVE_LEVEL_FOR_STAGE: Record<number, number> = { 1: 5, 2: 15 };

const STAGE_NAMES: Record<number, string> = {
  1: "Cute",
  2: "Athletic",
  3: "Legendary",
};

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.statBarRow}>
      <Text style={[styles.statBarLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.statBarTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.statBarFill, { width: `${value}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.statBarValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function HatchlingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: pal, isLoading, refetch } = useGetHatchling(Number(id));
  const evolveMutation = useEvolveHatchling();

  const rarityColor = getRarityColor(pal?.rarity);
  const level = pal?.level ?? 1;
  const stage = pal?.evolutionStage ?? 1;
  const xpPerLevel = 100;
  const xp = pal?.xp ?? 0;
  const xpProgress = (xp % xpPerLevel) / xpPerLevel;

  const evolveThreshold = EVOLVE_LEVEL_FOR_STAGE[stage];
  const canEvolve = stage < 3 && evolveThreshold != null && level >= evolveThreshold;
  const nextStageName = STAGE_NAMES[stage + 1] ?? `Stage ${stage + 1}`;

  const handleEvolve = useCallback(() => {
    if (!pal) return;
    evolveMutation.mutate(
      { id: pal.id, data: { triggerId: 1 } },
      {
        onSuccess: async (result) => {
          await refetch();
          if (result.evolutionSharePrompt) {
            const palName = result.name ?? pal.name;
            const toStage = result.evolutionStage ?? stage + 1;
            const evolutionType = result.evolutionType;
            const headline = evolutionType
              ? `✨ ${palName} evolved into ${evolutionType}!`
              : `✨ ${palName} just evolved!`;
            const stageLine = STAGE_NAMES[toStage]
              ? `Stage ${stage} → Stage ${toStage} (${STAGE_NAMES[toStage]})`
              : `Stage ${stage} → Stage ${toStage}`;
            const message = `${headline}\n${stageLine}\n\nPlay HatchUp and evolve your own Pal!`;
            try {
              await Share.share({ message });
            } catch {
              // Share API unavailable or dismissed — silently continue
            }
          }
        },
        onError: () => {
          Alert.alert("Evolution failed", "Could not evolve your Pal right now. Try again later.");
        },
      },
    );
  }, [pal, evolveMutation, refetch, stage]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pal Detail</Text>
        <View style={{ width: 34 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : pal ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: rarityColor + "66" }]}>
            <View style={[styles.heroAura, { backgroundColor: rarityColor + "18" }]}>
              <Feather name="zap" size={56} color={rarityColor} />
            </View>
            <View style={styles.heroInfo}>
              <Text style={[styles.palName, { color: colors.foreground }]}>{pal.name}</Text>
              <View style={styles.palBadgeRow}>
                <View style={[styles.rarityPill, { backgroundColor: rarityColor + "28", borderColor: rarityColor + "66" }]}>
                  <Text style={[styles.rarityText, { color: rarityColor }]}>{capitalize(pal.rarity)}</Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.levelText}>Lv {level}</Text>
                </View>
              </View>
              <Text style={[styles.species, { color: colors.mutedForeground }]}>{pal.species ?? "Unknown species"}</Text>
              <Text style={[styles.realm, { color: colors.mutedForeground }]}>{pal.realm ?? ""}</Text>
            </View>
          </View>

          {/* XP Progress */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>XP Progress</Text>
            <View style={[styles.xpTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.xpFill, { width: `${xpProgress * 100}%` as any, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
              {xp % xpPerLevel} / {xpPerLevel} XP to Lv {level + 1}
            </Text>

            {/* Evolve CTA */}
            {canEvolve && (
              <Pressable
                onPress={handleEvolve}
                disabled={evolveMutation.isPending}
                style={[
                  styles.evolveBtn,
                  { backgroundColor: rarityColor + "22", borderColor: rarityColor + "66" },
                  evolveMutation.isPending && styles.evolveBtnDisabled,
                ]}
              >
                {evolveMutation.isPending ? (
                  <ActivityIndicator size="small" color={rarityColor} />
                ) : (
                  <Feather name="trending-up" size={16} color={rarityColor} />
                )}
                <Text style={[styles.evolveBtnText, { color: rarityColor }]}>
                  {evolveMutation.isPending ? "Evolving…" : `Evolve to ${nextStageName}!`}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Power Score */}
          <View style={[styles.powerCard, { backgroundColor: rarityColor + "14", borderColor: rarityColor + "44" }]}>
            <Feather name="award" size={20} color={rarityColor} />
            <Text style={[styles.powerValue, { color: rarityColor }]}>{pal.powerScore ?? 0}</Text>
            <Text style={[styles.powerLabel, { color: colors.mutedForeground }]}>Power Score</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.powerSub, { color: colors.mutedForeground }]}>{pal.battleWins ?? 0} battle wins</Text>
          </View>

          {/* Vitals */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vitals</Text>
            <StatBar label="Happiness" value={pal.happiness ?? 0} color="#f59e0b" />
            <StatBar label="Hunger" value={pal.hunger ?? 0} color="#ef4444" />
            <StatBar label="Energy" value={pal.energy ?? 0} color="#22c55e" />
          </View>

          {/* Mood & Loyalty */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Mood & Loyalty</Text>
            <StatBar label="Loyalty" value={pal.loyaltyScore ?? 50} color="#3b82f6" />
            <StatBar label="Motivation" value={pal.motivationScore ?? 50} color="#a855f7" />
            <StatBar label="Confidence" value={pal.confidenceScore ?? 50} color={rarityColor} />
          </View>

          {/* Ability */}
          {pal.abilityName && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ability</Text>
              <View style={[styles.abilityRow, { borderColor: colors.border }]}>
                <View style={[styles.abilityDot, { backgroundColor: rarityColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.abilityName, { color: colors.foreground }]}>{pal.abilityName}</Text>
                  {pal.abilityDesc && (
                    <Text style={[styles.realm, { color: colors.mutedForeground, marginTop: 2 }]}>{pal.abilityDesc}</Text>
                  )}
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Pal not found</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  heroCard: { borderRadius: 18, borderWidth: 1.5, padding: 16, flexDirection: "row", gap: 14, marginBottom: 14, alignItems: "center" },
  heroAura: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  heroInfo: { flex: 1, gap: 6 },
  palName: { fontSize: 20, fontWeight: "800" },
  palBadgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rarityPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  rarityText: { fontSize: 11, fontWeight: "700" },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  levelText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  species: { fontSize: 13 },
  realm: { fontSize: 11 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  statBarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statBarLabel: { width: 80, fontSize: 12 },
  statBarTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  statBarFill: { height: 6, borderRadius: 3 },
  statBarValue: { width: 28, fontSize: 12, fontWeight: "600", textAlign: "right" },
  xpTrack: { height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 4 },
  xpFill: { height: 8, borderRadius: 4 },
  xpLabel: { fontSize: 12 },
  evolveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, borderWidth: 1.5, paddingVertical: 10, marginTop: 6 },
  evolveBtnDisabled: { opacity: 0.6 },
  evolveBtnText: { fontSize: 13, fontWeight: "700" },
  powerCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  powerValue: { fontSize: 24, fontWeight: "800" },
  powerLabel: { fontSize: 12 },
  powerSub: { fontSize: 12 },
  abilityRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, borderBottomWidth: 1 },
  abilityDot: { width: 8, height: 8, borderRadius: 4 },
  abilityName: { fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
