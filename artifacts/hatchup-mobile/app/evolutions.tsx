import { Feather } from "@expo/vector-icons";
import { useListEvolutions, useGetEvolutionCategories } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
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
import { getRarityColor, capitalize } from "@/constants/rarity";

export default function EvolutionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const { data: categories } = useGetEvolutionCategories();
  const { data: evolutions, isLoading } = useListEvolutions(
    selectedCategory !== "all" ? { category: selectedCategory } : {}
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Evolutions</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Category pills */}
      <FlatList
        horizontal
        data={[{ category: "all", count: 0 } as { category: string; count: number }, ...(categories ?? [])]}
        keyExtractor={(c) => c.category}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        renderItem={({ item: cat }) => {
          const active = cat.category === selectedCategory;
          return (
            <Pressable
              onPress={() => setSelectedCategory(cat.category)}
              style={[styles.pill, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[styles.pillText, { color: active ? "#fff" : colors.mutedForeground }]}>
                {capitalize(cat.category)}
                {cat.count > 0 ? ` (${cat.count})` : ""}
              </Text>
            </Pressable>
          );
        }}
      />

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={evolutions ?? []}
          keyExtractor={(e) => String(e.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="rotate-cw" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No evolutions found</Text>
            </View>
          }
          renderItem={({ item: evo }) => {
            const rc = getRarityColor(evo.rarity);
            return (
              <View style={[styles.evoCard, { backgroundColor: colors.card, borderColor: rc + "55" }]}>
                <View style={[styles.evoAura, { backgroundColor: rc + "18" }]}>
                  <Feather name="trending-up" size={28} color={rc} />
                </View>
                <Text style={[styles.evoName, { color: colors.foreground }]} numberOfLines={1}>
                  {evo.name}
                </Text>
                <Text style={[styles.evoCategory, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {capitalize(evo.category)}
                </Text>
                <View style={[styles.rarityPill, { backgroundColor: rc + "22", borderColor: rc + "66" }]}>
                  <Text style={[styles.rarityText, { color: rc }]}>{capitalize(evo.rarity)}</Text>
                </View>
                {evo.abilityName && (
                  <Text style={[styles.xpReq, { color: colors.mutedForeground }]}>
                    {evo.abilityName}
                  </Text>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "800" },
  pillRow: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: "600" },
  row: { gap: 10, marginBottom: 10, paddingHorizontal: 2 },
  evoCard: { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 12, gap: 5 },
  evoAura: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  evoName: { fontSize: 13, fontWeight: "700" },
  evoCategory: { fontSize: 11 },
  rarityPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start" },
  rarityText: { fontSize: 10, fontWeight: "700" },
  xpReq: { fontSize: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14 },
});
