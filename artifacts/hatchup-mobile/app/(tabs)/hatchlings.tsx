import { Feather } from "@expo/vector-icons";
import { useListHatchlings } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getRarityColor, capitalize } from "@/constants/rarity";
import { ScreenGradientBg } from "@/components/ScreenGradientBg";

const PLAYER_ID = 1;
const RARITIES = ["all", "common", "uncommon", "rare", "epic", "legendary", "mythic", "ancient", "celestial"];

function buildHatchlingShareUrl(hatchlingId: number): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return "";
  return `https://${domain}/hatchling/${hatchlingId}`;
}

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
  onPress: () => void;
}

function HatchlingCard({ item, onPress }: HatchlingCardProps) {
  const colors = useColors();
  const rarityColor = getRarityColor(item.rarity);

  async function handleShare() {
    const url = buildHatchlingShareUrl(item.id);
    if (!url) return;
    await Share.share({
      message: `Check out my ${capitalize(item.rarity)} hatchling ${item.name} on HatchUp! ${url}`,
      url,
    });
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleShare}
      delayLongPress={400}
      style={[styles.card, { backgroundColor: colors.card, borderColor: rarityColor + "55" }]}
    >
      <View style={[styles.cardAura, { backgroundColor: rarityColor + "14" }]}>
        <Feather name="zap" size={36} color={rarityColor} />
      </View>
      <View style={[styles.rarityDot, { backgroundColor: rarityColor }]} />
      <Pressable
        onPress={handleShare}
        hitSlop={8}
        style={styles.cardShareBtn}
        testID={`button-share-hatchling-${item.id}`}
      >
        <Feather name="share-2" size={12} color={rarityColor} />
      </Pressable>
      <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
      <Text style={[styles.cardSpecies, { color: colors.mutedForeground }]} numberOfLines={1}>
        {item.species ?? "Unknown"}
      </Text>
      <View style={styles.cardFooter}>
        <View style={[styles.levelBadge, { backgroundColor: rarityColor + "28" }]}>
          <Text style={[styles.levelText, { color: rarityColor }]}>Lv {item.level ?? 1}</Text>
        </View>
        <View style={styles.statMini}>
          <Feather name="heart" size={10} color={colors.mutedForeground} />
          <Text style={[styles.statMiniText, { color: colors.mutedForeground }]}>{item.happiness ?? 0}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function HatchlingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedRarity, setSelectedRarity] = useState("all");
  const { data: hatchlings, isLoading } = useListHatchlings({ playerId: PLAYER_ID, limit: 50 });

  const filtered = selectedRarity === "all"
    ? (hatchlings ?? [])
    : (hatchlings ?? []).filter((h) => h.rarity === selectedRarity);

  return (
    <ScreenGradientBg>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>My Pals</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/my-pal")}
            style={[styles.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="star" size={14} color={colors.primary} />
            <Text style={[styles.headerBtnText, { color: colors.primary }]}>My Pal</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/evolutions")}
            style={[styles.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="trending-up" size={14} color="#6366f1" />
            <Text style={[styles.headerBtnText, { color: "#6366f1" }]}>Evolve</Text>
          </Pressable>
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countText}>{hatchlings?.length ?? 0}</Text>
          </View>
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
          const rc = r === "all" ? colors.primary : getRarityColor(r);
          return (
            <Pressable
              onPress={() => setSelectedRarity(r)}
              style={[styles.filterPill, { backgroundColor: active ? rc + "28" : colors.card, borderColor: active ? rc : colors.border }]}
            >
              <Text style={[styles.filterText, { color: active ? rc : colors.mutedForeground }]}>
                {capitalize(r)}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Grid */}
      {isLoading ? null : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="star" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
            {hatchlings?.length === 0 ? "No pals yet" : "None in this rarity"}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            {hatchlings?.length === 0 ? "Head to Hatch to crack open some eggs" : "Try a different filter"}
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
          renderItem={({ item }) => (
            <HatchlingCard
              item={item}
              onPress={() => router.push(`/hatchling/${item.id}` as any)}
            />
          )}
          scrollEnabled={filtered.length > 0}
        />
      )}
    </ScreenGradientBg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginBottom: 8 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  headerBtnText: { fontSize: 12, fontWeight: "700" },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  countText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: "600" },
  row: { gap: 10, marginBottom: 10, paddingHorizontal: 4 },
  card: { flex: 1, borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 6, overflow: "hidden" },
  cardAura: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  rarityDot: { position: "absolute", top: 12, right: 30, width: 8, height: 8, borderRadius: 4 },
  cardShareBtn: { position: "absolute", top: 8, right: 8, padding: 4 },
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
