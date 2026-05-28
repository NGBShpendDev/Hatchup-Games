import { Feather } from "@expo/vector-icons";
import { useListEggs } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const PLAYER_ID = 1;

const RARITY_COLORS: Record<string, string> = {
  common: "#9ca3af",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
  mythic: "#dc2626",
  ancient: "#6366f1",
  celestial: "#e2e8f0",
};

const EGG_ICONS: Record<string, string> = {
  fire: "flame",
  water: "droplet",
  earth: "layers",
  air: "wind",
  electric: "zap",
  nature: "leaf",
  dark: "moon",
  light: "sun",
};

interface EggCardProps {
  egg: {
    id: number;
    type?: string | null;
    rarity?: string | null;
    stepsRequired?: number | null;
    stepsWalked?: number | null;
    status?: string | null;
  };
}

function EggCard({ egg }: EggCardProps) {
  const colors = useColors();
  const rarity = egg.rarity ?? "common";
  const rarityColor = RARITY_COLORS[rarity] ?? colors.primary;
  const eggType = egg.type ?? "normal";
  const iconName = EGG_ICONS[eggType] ?? "circle";

  const stepsRequired = egg.stepsRequired ?? 1000;
  const stepsWalked = egg.stepsWalked ?? 0;
  const progress = Math.min(1, stepsWalked / stepsRequired);
  const isReady = egg.status === "ready" || progress >= 1;

  return (
    <View style={[styles.eggCard, { backgroundColor: colors.card, borderColor: rarityColor + "66" }]}>
      {/* Egg visual */}
      <View style={[styles.eggAura, { backgroundColor: rarityColor + "18" }]}>
        <Feather name={iconName as any} size={32} color={rarityColor} />
      </View>

      {/* Info */}
      <View style={styles.eggInfo}>
        <View style={styles.eggHeaderRow}>
          <Text style={[styles.eggType, { color: colors.foreground }]}>
            {eggType.charAt(0).toUpperCase() + eggType.slice(1)} Egg
          </Text>
          <View style={[styles.rarityBadge, { backgroundColor: rarityColor + "22", borderColor: rarityColor + "66" }]}>
            <Text style={[styles.rarityText, { color: rarityColor }]}>
              {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
            </Text>
          </View>
        </View>

        {isReady ? (
          <View style={[styles.readyBadge, { backgroundColor: colors.primary + "22" }]}>
            <Feather name="check-circle" size={13} color={colors.primary} />
            <Text style={[styles.readyText, { color: colors.primary }]}>Ready to hatch!</Text>
          </View>
        ) : (
          <>
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progress * 100}%` as any, backgroundColor: rarityColor },
                  ]}
                />
              </View>
              <Text style={[styles.progressPct, { color: colors.mutedForeground }]}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <Text style={[styles.stepsText, { color: colors.mutedForeground }]}>
              {stepsWalked.toLocaleString()} / {stepsRequired.toLocaleString()} steps
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

export default function HatchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: eggs, isLoading } = useListEggs({ playerId: PLAYER_ID });

  const ready = (eggs ?? []).filter((e) => e.isReady || (e.stepsProgress ?? 0) >= (e.stepsRequired ?? 1000));
  const incubating = (eggs ?? []).filter((e) => !e.isReady && (e.stepsProgress ?? 0) < (e.stepsRequired ?? 1000));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Incubation</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Walk to hatch your eggs
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (eggs?.length ?? 0) === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="circle" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No eggs incubating</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Collect eggs from events and competitions
          </Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...(ready.length > 0 ? [{ section: "Ready to Hatch!" }] : []),
            ...ready.map((e) => ({ egg: e })),
            ...(incubating.length > 0 ? [{ section: "Incubating" }] : []),
            ...incubating.map((e) => ({ egg: e })),
          ]}
          keyExtractor={(item, index) =>
            "section" in item ? `section-${item.section}` : `egg-${item.egg.id}-${index}`
          }
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 90 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if ("section" in item) {
              return (
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>
                  {item.section}
                </Text>
              );
            }
            return <EggCard egg={item.egg} />;
          }}
          scrollEnabled={!!(eggs && eggs.length > 0)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 3 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  eggCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  eggAura: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  eggInfo: { flex: 1, gap: 6 },
  eggHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eggType: { fontSize: 15, fontWeight: "700" },
  rarityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityText: { fontSize: 11, fontWeight: "600" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 12, fontWeight: "600", minWidth: 30, textAlign: "right" },
  stepsText: { fontSize: 11 },
  readyBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: "flex-start" },
  readyText: { fontSize: 13, fontWeight: "700" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptyHint: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
});
