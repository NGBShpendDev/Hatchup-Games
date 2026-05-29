import { Feather } from "@expo/vector-icons";
import {
  useListEggs,
  useCollectDailyEggs,
  usePlaceEggInIncubator,
  useHatchEgg,
  getListEggsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
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
import { GradientButton } from "@/components/GradientButton";
import { ScreenGradientBg } from "@/components/ScreenGradientBg";

const PLAYER_ID = 1;
const MAX_SLOTS = 3;

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

const TYPE_ICONS: Record<string, string> = {
  fire: "zap",
  water: "droplet",
  earth: "layers",
  air: "wind",
  electric: "zap",
  nature: "feather",
  dark: "moon",
  light: "sun",
  normal: "circle",
};

function rarityColor(rarity?: string | null) {
  return RARITY_COLORS[rarity ?? "common"] ?? "#9ca3af";
}

function typeIcon(type?: string | null) {
  return TYPE_ICONS[type ?? "normal"] ?? "circle";
}

interface EggType {
  id: number;
  type?: string | null;
  rarity?: string | null;
  source?: string | null;
  status?: string | null;
  stepsRequired?: number | null;
  stepsWalked?: number | null;
  isReady?: boolean | null;
}

function SourceBadge({ source }: { source?: string | null }) {
  if (source === "challenge") {
    return (
      <View style={[badge.pill, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b66" }]}>
        <Text style={[badge.text, { color: "#f59e0b" }]}>🏆 Challenge</Text>
      </View>
    );
  }
  if (source === "event") {
    return (
      <View style={[badge.pill, { backgroundColor: "#a855f722", borderColor: "#a855f766" }]}>
        <Text style={[badge.text, { color: "#a855f7" }]}>⭐ Event</Text>
      </View>
    );
  }
  return null;
}

const badge = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start" },
  text: { fontSize: 10, fontWeight: "700" },
});

function IncubatorSlot({
  egg,
  onHatch,
  hatching,
}: {
  egg?: EggType;
  onHatch?: () => void;
  hatching?: boolean;
}) {
  const colors = useColors();

  if (!egg) {
    return (
      <View style={[slotStyles.emptySlot, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[slotStyles.emptyIcon, { borderColor: colors.border }]}>
          <Feather name="plus" size={18} color={colors.mutedForeground} />
        </View>
        <Text style={[slotStyles.emptyLabel, { color: colors.mutedForeground }]}>Empty</Text>
      </View>
    );
  }

  const rc = rarityColor(egg.rarity);
  const steps = egg.stepsWalked ?? 0;
  const required = egg.stepsRequired ?? 1000;
  const progress = Math.min(1, steps / required);
  const ready = egg.isReady || progress >= 1;

  return (
    <View
      style={[
        slotStyles.slot,
        {
          backgroundColor: colors.card,
          borderColor: rc + "55",
          boxShadow: `0 0 14px ${rc}33`,
        } as any,
      ]}
    >
      <View style={[slotStyles.aura, { backgroundColor: rc + "18" }]}>
        <Feather name={typeIcon(egg.type) as any} size={26} color={rc} />
      </View>
      <View style={[slotStyles.rarityBadge, { backgroundColor: rc + "22", borderColor: rc + "55" }]}>
        <Text style={[slotStyles.rarityText, { color: rc }]}>
          {(egg.rarity ?? "common").charAt(0).toUpperCase() + (egg.rarity ?? "common").slice(1)}
        </Text>
      </View>
      <SourceBadge source={egg.source} />
      {ready ? (
        <Pressable
          onPress={onHatch}
          disabled={hatching}
          style={[slotStyles.hatchBtn, { opacity: hatching ? 0.6 : 1 }]}
        >
          {hatching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={slotStyles.hatchBtnText}>Hatch!</Text>
          )}
        </Pressable>
      ) : (
        <View style={slotStyles.progressWrap}>
          <View style={[slotStyles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[slotStyles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: rc }]} />
          </View>
          <Text style={[slotStyles.progressLabel, { color: colors.mutedForeground }]}>
            {steps.toLocaleString()} / {required.toLocaleString()} steps
          </Text>
        </View>
      )}
    </View>
  );
}

const slotStyles = StyleSheet.create({
  emptySlot: { flex: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", padding: 12, gap: 6 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  emptyLabel: { fontSize: 11 },
  slot: { flex: 1, borderRadius: 14, borderWidth: 1.5, alignItems: "center", padding: 12, gap: 6 },
  aura: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  rarityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityText: { fontSize: 10, fontWeight: "700" },
  progressWrap: { width: "100%", gap: 3 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },
  progressLabel: { fontSize: 9, textAlign: "center" },
  hatchBtn: { backgroundColor: "#ee2b8c", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 2 },
  hatchBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});

function BagEggCard({
  egg,
  onPlace,
  placing,
  disabled,
}: {
  egg: EggType;
  onPlace: () => void;
  placing: boolean;
  disabled: boolean;
}) {
  const colors = useColors();
  const rc = rarityColor(egg.rarity);

  return (
    <Pressable
      onPress={disabled ? undefined : onPlace}
      style={[
        bagStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: rc + "55",
          opacity: disabled ? 0.45 : 1,
          boxShadow: disabled ? undefined : `0 0 10px ${rc}28`,
        } as any,
      ]}
    >
      <View style={[bagStyles.aura, { backgroundColor: rc + "18" }]}>
        {placing ? (
          <ActivityIndicator size="small" color={rc} />
        ) : (
          <Feather name={typeIcon(egg.type) as any} size={24} color={rc} />
        )}
      </View>
      <Text style={[bagStyles.name, { color: colors.foreground }]} numberOfLines={1}>
        {(egg.type ?? "Normal").charAt(0).toUpperCase() + (egg.type ?? "Normal").slice(1)}
      </Text>
      <View style={[bagStyles.rarityPill, { backgroundColor: rc + "22", borderColor: rc + "55" }]}>
        <Text style={[bagStyles.rarityText, { color: rc }]}>
          {(egg.rarity ?? "Common").charAt(0).toUpperCase() + (egg.rarity ?? "Common").slice(1)}
        </Text>
      </View>
      <SourceBadge source={egg.source} />
      {!disabled && (
        <Text style={[bagStyles.hint, { color: colors.mutedForeground }]}>Tap to incubate</Text>
      )}
    </Pressable>
  );
}

const bagStyles = StyleSheet.create({
  card: { width: "30%", flexGrow: 1, borderRadius: 14, borderWidth: 1.5, alignItems: "center", padding: 10, gap: 5 },
  aura: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 12, fontWeight: "700" },
  rarityPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rarityText: { fontSize: 10, fontWeight: "600" },
  hint: { fontSize: 9, marginTop: 1 },
});

export default function HatchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [hatchingId, setHatchingId] = useState<number | null>(null);
  const [placingId, setPlacingId] = useState<number | null>(null);
  const [hatchResult, setHatchResult] = useState<{ name: string; rarity: string } | null>(null);

  const incubatingQuery = useListEggs({ playerId: PLAYER_ID, status: "incubating" });
  const availableQuery = useListEggs({ playerId: PLAYER_ID, status: "available" });

  const incubating = incubatingQuery.data ?? [];
  const available = availableQuery.data ?? [];
  const incubatorFull = incubating.length >= MAX_SLOTS;

  const collectDaily = useCollectDailyEggs({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, status: "available" }) });
      },
    },
  });

  const placeEgg = usePlaceEggInIncubator({
    mutation: {
      onSuccess: () => {
        setPlacingId(null);
        queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, status: "incubating" }) });
        queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, status: "available" }) });
      },
      onError: () => setPlacingId(null),
    },
  });

  const hatchEgg = useHatchEgg({
    mutation: {
      onSuccess: (result) => {
        setHatchingId(null);
        if (result?.hatchling) {
          setHatchResult({ name: result.hatchling.name, rarity: result.hatchling.rarity ?? "common" });
        }
        queryClient.invalidateQueries({ queryKey: getListEggsQueryKey({ playerId: PLAYER_ID, status: "incubating" }) });
      },
      onError: () => setHatchingId(null),
    },
  });

  const isLoading = incubatingQuery.isLoading || availableQuery.isLoading;

  const emptySlots = Array.from({ length: Math.max(0, MAX_SLOTS - incubating.length) });

  return (
    <ScreenGradientBg>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: bottomPad + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Incubator</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {incubating.length}/{MAX_SLOTS} slots occupied
            </Text>
          </View>
          <GradientButton
            onPress={() => collectDaily.mutate({ data: { playerId: PLAYER_ID } })}
            label={collectDaily.isSuccess ? "Collected!" : "Daily Eggs"}
            icon={<Feather name="package" size={14} color="#fff" />}
            loading={collectDaily.isPending}
            disabled={collectDaily.isSuccess}
            style={{ paddingHorizontal: 4 }}
          />
        </View>

        {/* Hatch result banner */}
        {hatchResult && (
          <Pressable
            onPress={() => setHatchResult(null)}
            style={[styles.hatchBanner, { backgroundColor: rarityColor(hatchResult.rarity) + "22", borderColor: rarityColor(hatchResult.rarity) + "88" }]}
          >
            <Text style={{ fontSize: 20 }}>🎉</Text>
            <View>
              <Text style={[styles.hatchBannerTitle, { color: rarityColor(hatchResult.rarity) }]}>
                {hatchResult.name} hatched!
              </Text>
              <Text style={[styles.hatchBannerSub, { color: colors.mutedForeground }]}>
                Tap to dismiss
              </Text>
            </View>
          </Pressable>
        )}

        {/* Incubator Slots */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Incubator Slots</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.slotsRow}>
            {incubating.map((egg) => (
              <IncubatorSlot
                key={egg.id}
                egg={egg as EggType}
                onHatch={() => {
                  setHatchingId(egg.id);
                  hatchEgg.mutate({ id: egg.id, data: { playerId: PLAYER_ID, name: `Hatchling ${egg.id}` } });
                }}
                hatching={hatchingId === egg.id}
              />
            ))}
            {emptySlots.map((_, i) => (
              <IncubatorSlot key={`empty-${i}`} />
            ))}
          </View>
        )}

        {/* Daily Bag section */}
        <View style={styles.bagHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>Egg Bag</Text>
          <View style={[styles.bagCount, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
            <Text style={[styles.bagCountText, { color: colors.primary }]}>{available.length} available</Text>
          </View>
        </View>

        {incubatorFull && (
          <View style={[styles.fullBanner, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b55" }]}>
            <Feather name="alert-circle" size={14} color="#f59e0b" />
            <Text style={[styles.fullBannerText, { color: "#f59e0b" }]}>
              Incubator full — hatch an egg to free a slot
            </Text>
          </View>
        )}

        {availableQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : available.length === 0 ? (
          <View style={[styles.emptyBag, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="inbox" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyBagTitle, { color: colors.mutedForeground }]}>Bag is empty</Text>
            <Text style={[styles.emptyBagHint, { color: colors.mutedForeground }]}>
              Tap "Daily Eggs" to collect today's batch
            </Text>
          </View>
        ) : (
          <View style={styles.bagGrid}>
            {available.map((egg) => (
              <BagEggCard
                key={egg.id}
                egg={egg as EggType}
                disabled={incubatorFull}
                placing={placingId === egg.id}
                onPlace={() => {
                  setPlacingId(egg.id);
                  placeEgg.mutate({ id: egg.id });
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenGradientBg>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "700", paddingHorizontal: 16, marginBottom: 10, marginTop: 16 },
  slotsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  bagHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginTop: 20, marginBottom: 10, gap: 8 },
  bagCount: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  bagCountText: { fontSize: 11, fontWeight: "700" },
  bagGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10 },
  emptyBag: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 32, alignItems: "center", gap: 8 },
  emptyBagTitle: { fontSize: 15, fontWeight: "600" },
  emptyBagHint: { fontSize: 12, textAlign: "center" },
  fullBanner: { marginHorizontal: 16, borderRadius: 10, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  fullBannerText: { fontSize: 12, fontWeight: "600", flex: 1 },
  hatchBanner: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginBottom: 4 },
  hatchBannerTitle: { fontSize: 15, fontWeight: "700" },
  hatchBannerSub: { fontSize: 11, marginTop: 1 },
});
