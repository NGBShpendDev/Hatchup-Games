import { Feather } from "@expo/vector-icons";
import { useGetHatchling, useGetPlayer } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
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

function RingStat({ label, value, color, sublabel }: {
  label: string; value: number; color: string; sublabel?: string;
}) {
  const colors = useColors();
  const pct = Math.min(1, value / 100);
  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <View style={styles.ringStat}>
      <View style={[styles.ringOuter, { borderColor: colors.border }]}>
        <View style={[styles.ringFill, { borderColor: color, borderWidth: Math.max(1, pct * 5) }]} />
        <Text style={[styles.ringValue, { color: colors.foreground }]}>{value}</Text>
      </View>
      <Text style={[styles.ringLabel, { color: colors.foreground }]}>{label}</Text>
      {sublabel && <Text style={[styles.ringSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
    </View>
  );
}

function VitalBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.vitalRow}>
      <Text style={[styles.vitalLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.vitalTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.vitalFill, { width: `${value}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.vitalValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function MyPalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: player } = useGetPlayer(PLAYER_ID);
  const palId = player?.activeHatchlingId;
  const { data: pal, isLoading } = useGetHatchling(palId ?? 0);

  const rarityColor = getRarityColor(pal?.rarity);
  const readiness = Math.round(
    (pal?.energy ?? 50) * 0.3 +
    (pal?.happiness ?? 50) * 0.3 +
    (pal?.loyaltyScore ?? 50) * 0.2 +
    (pal?.confidenceScore ?? 50) * 0.2
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>My Pal</Text>
        <View style={{ width: 34 }} />
      </View>

      {!palId ? (
        <View style={styles.center}>
          <Feather name="star" size={48} color={colors.mutedForeground} />
          <Text style={[styles.nopalText, { color: colors.mutedForeground }]}>No active pal set</Text>
          <Text style={[styles.nopalHint, { color: colors.mutedForeground }]}>Set an active pal from your collection</Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : pal ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: rarityColor + "66" }]}>
            <View style={[styles.heroAura, { backgroundColor: rarityColor + "18" }]}>
              <Feather name="zap" size={48} color={rarityColor} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.palName, { color: colors.foreground }]}>{pal.name}</Text>
              <Text style={[styles.palSpecies, { color: colors.mutedForeground }]}>
                {pal.species} · {capitalize(pal.rarity)} · Lv {pal.level ?? 1}
              </Text>
              <View style={[styles.readinessBadge, {
                backgroundColor: readiness >= 70 ? "#22c55e22" : readiness >= 40 ? "#f59e0b22" : "#ef444422",
                borderColor: readiness >= 70 ? "#22c55e66" : readiness >= 40 ? "#f59e0b66" : "#ef444466",
              }]}>
                <Text style={[styles.readinessText, {
                  color: readiness >= 70 ? "#22c55e" : readiness >= 40 ? "#f59e0b" : "#ef4444",
                }]}>
                  {readiness >= 70 ? "Battle Ready" : readiness >= 40 ? "Training Needed" : "Rest Up"} · {readiness}%
                </Text>
              </View>
            </View>
          </View>

          {/* Mood Rings */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Mood & Loyalty</Text>
          <View style={styles.ringsRow}>
            <RingStat label="Loyalty" value={pal.loyaltyScore ?? 50} color="#3b82f6" />
            <RingStat label="Motivation" value={pal.motivationScore ?? 50} color="#a855f7" />
            <RingStat label="Confidence" value={pal.confidenceScore ?? 50} color={rarityColor} sublabel={`${pal.battleWins ?? 0} wins`} />
            <RingStat label="Power" value={Math.min(100, Math.round((pal.powerScore ?? 0) / 5))} color="#f59e0b" sublabel={String(pal.powerScore ?? 0)} />
          </View>

          {/* Vitals */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vitals</Text>
          <View style={[styles.vitalsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <VitalBar label="Happiness" value={pal.happiness ?? 0} color="#f59e0b" />
            <VitalBar label="Hunger" value={pal.hunger ?? 0} color="#ef4444" />
            <VitalBar label="Energy" value={pal.energy ?? 0} color="#22c55e" />
          </View>

          {/* Actions */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actions</Text>
          <View style={styles.actionsRow}>
            {[
              { label: "Feed", icon: "coffee", color: "#f59e0b" },
              { label: "Play", icon: "smile", color: "#22c55e" },
              { label: "Train", icon: "activity", color: "#3b82f6" },
              { label: "Rest", icon: "moon", color: "#a855f7" },
            ].map((action) => (
              <Pressable
                key={action.label}
                style={[styles.actionBtn, { backgroundColor: action.color + "22", borderColor: action.color + "55" }]}
              >
                <Feather name={action.icon as any} size={22} color={action.color} />
                <Text style={[styles.actionLabel, { color: action.color }]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>Could not load pal data</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  nopalText: { fontSize: 16, fontWeight: "600" },
  nopalHint: { fontSize: 13 },
  heroCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 16 },
  heroAura: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  palName: { fontSize: 20, fontWeight: "800" },
  palSpecies: { fontSize: 12 },
  readinessBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start", marginTop: 4 },
  readinessText: { fontSize: 12, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  ringsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  ringStat: { alignItems: "center", gap: 6, flex: 1 },
  ringOuter: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  ringFill: { position: "absolute", width: 64, height: 64, borderRadius: 32 },
  ringValue: { fontSize: 18, fontWeight: "800" },
  ringLabel: { fontSize: 11, fontWeight: "600" },
  ringSub: { fontSize: 10 },
  vitalsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12, marginBottom: 16 },
  vitalRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  vitalLabel: { width: 70, fontSize: 12 },
  vitalTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  vitalFill: { height: 6, borderRadius: 3 },
  vitalValue: { width: 28, fontSize: 12, fontWeight: "600", textAlign: "right" },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center", gap: 6 },
  actionLabel: { fontSize: 11, fontWeight: "700" },
});
