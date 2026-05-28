import { Feather } from "@expo/vector-icons";
import { useListHatchlings } from "@workspace/api-client-react";
import React, { useState } from "react";
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

const PLAYER_ID = 1;

const RARITIES = ["all", "common", "uncommon", "rare", "epic", "legendary", "mythic", "ancient", "celestial"];

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

interface HatchlingCardProps {
  item: {
    id: number;
    name: string;
    rarity?: string | null;
    level?: number | null;
    species?: string | null;
    happiness?: number | null;
    energy?: number | null;
  };
}

function HatchlingCard({ item }: HatchlingCardProps) {
  const colors = useColors();
  const rarity = item.rarity ?? "common";
  const rarityColor = RARITY_COLORS[rarity] ?? colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: rarityColor + "55" }]}>
      <View style={[styles.cardAura, { backgroundColor: rarityColor + "14" }]}>
        <Feather name="zap" size={36} color={rarityColor} />
      </View>
      <View style={[styles.rarityDot, { backgroundColor: rarityColor }]} />
      <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.cardSpecies, { color: colors.mutedForeground }]} numberOfLines={1}>
        {item.species ?? "Unknown"}
      </Text>
      <View style={styles.cardFooter}>
        <View style={[styles.levelBadge, { backgroundColor: rarityColor + "28" }]}>
          <Text style={[styles.levelText, { color: rarityColor }]}>Lv {item.level ?? 1}</Text>
        </View>
        <View style={styles.statMini}>
          <Feather name="heart" size={10} color={colors.mutedForeground} />
          <Text style={[styles.statMiniText, { color: colors.mutedForeground }]}>
            {item.happiness ?? 0}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function HatchlingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedRarity, setSelectedRarity] = useState("all");

  const { data: hatchlings, isLoading } = useListHatchlings({ playerId: PLAYER_ID, limit: 50 });

  const filtered = selectedRarity === "all"
    ? (hatchlings ?? [])
    : (hatchlings ?? []).filter((h) => h.rarity === selectedRarity);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>My Pals</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.countText}>{hatchlings?.length ?? 0}</Text>
        </View>
      </View>

      {/* Rarity Filter */}
      <FlatList
        horizontal
        data={RARITIES}
        keyExtractor={(r) => r}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: r }) => {
          const active = r === selectedRarity;
          const rarityColor = r === "all" ? colors.primary : (RARITY_COLORS[r] ?? colors.primary);
          return (
            <Pressable
              onPress={() => setSelectedRarity(r)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: active ? rarityColor + "28" : colors.card,
                  borderColor: active ? rarityColor : colors.border,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: active ? rarityColor : colors.mutedForeground }]}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Grid */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ flex: 1, alignSelf: "center" }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="star" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No pals yet</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Head to Hatch to crack open some eggs
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(h) => String(h.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ padding: 12, paddingBottom: bottomPad + 90 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <HatchlingCard item={item} />}
          scrollEnabled={filtered.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, flex: 1 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  countText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 12, fontWeight: "600" },
  row: { gap: 10, marginBottom: 10, paddingHorizontal: 4 },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
    overflow: "hidden",
  },
  cardAura: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  rarityDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardName: { fontSize: 14, fontWeight: "700" },
  cardSpecies: { fontSize: 11 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelText: { fontSize: 11, fontWeight: "700" },
  statMini: { flexDirection: "row", alignItems: "center", gap: 3 },
  statMiniText: { fontSize: 11 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptyHint: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
});
