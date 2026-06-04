import { Feather } from "@expo/vector-icons";
import { useListHatchlings } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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

import { MonsterAsset } from "@/components/MonsterAsset";
import { ScreenGradientBg } from "@/components/ScreenGradientBg";
import {
  ElementBadge,
  EmptyState,
  GameCard,
  ProgressBar,
  RarityPill,
  ScreenHeader,
} from "@/components/ui-game";
import { capitalize, getRarityColor } from "@/constants/rarity";
import { useColors } from "@/hooks/useColors";
import {
  getMonsterIdentity,
  normalizeMonsterRarity,
  normalizeMonsterStage,
} from "@/lib/monsters/monsterHelpers";
import {
  MONSTER_ELEMENTS,
  MONSTER_RARITIES,
  MONSTER_STAGES,
  type MonsterElement,
  type MonsterRarity,
  type MonsterStage,
} from "@/lib/monsters/monsterTypes";
import { useCurrentPlayerId } from "@/providers/CurrentPlayerProvider";

const RARITIES = ["all", ...MONSTER_RARITIES, "legendary", "mythic", "ancient", "celestial"] as const;
const ELEMENTS = ["all", ...MONSTER_ELEMENTS] as const;
const STAGES = ["all", ...MONSTER_STAGES] as const;
const RECENT_HATCH_MS = 1000 * 60 * 60 * 48;

type RarityFilter = (typeof RARITIES)[number];
type ElementFilter = (typeof ELEMENTS)[number];
type StageFilter = (typeof STAGES)[number];

interface Hatchling {
  id: number;
  name: string;
  rarity?: string | null;
  level?: number | null;
  species?: string | null;
  happiness?: number | null;
  energy?: number | null;
  realm?: string | null;
  element?: string | null;
  eggType?: string | null;
  evolutionStage?: string | number | null;
  stage?: string | number | null;
  isShiny?: boolean | null;
  createdAt?: string | null;
}

interface CollectionSlot {
  key: string;
  element: MonsterElement;
  rarity: MonsterRarity;
  stage: MonsterStage;
  hatchling: Hatchling | null;
}

function buildHatchlingShareUrl(hatchlingId: number): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return "";
  return `https://${domain}/hatchling/${hatchlingId}`;
}

function getSlotKey({
  element,
  rarity,
  stage,
}: {
  element: MonsterElement;
  rarity: MonsterRarity;
  stage: MonsterStage;
}) {
  return `${element}.${stage}.${rarity}`;
}

function getHatchlingIdentity(hatchling: Hatchling) {
  return getMonsterIdentity({
    element: hatchling.element,
    eggType: hatchling.eggType,
    realm: hatchling.realm,
    stage: hatchling.stage ?? hatchling.evolutionStage,
    rarity: hatchling.rarity,
  });
}

function getCollectionSlots(hatchlings: readonly Hatchling[]) {
  const discovered = new Map<string, Hatchling>();

  hatchlings.forEach((hatchling) => {
    const identity = getHatchlingIdentity(hatchling);
    const key = getSlotKey(identity);
    if (!discovered.has(key)) discovered.set(key, hatchling);
  });

  return MONSTER_ELEMENTS.flatMap((element) =>
    MONSTER_STAGES.flatMap((stage) =>
      MONSTER_RARITIES.map((rarity) => {
        const key = getSlotKey({ element, rarity, stage });
        return {
          element,
          hatchling: discovered.get(key) ?? null,
          key,
          rarity,
          stage,
        };
      }),
    ),
  );
}

function isRecentHatch(hatchling: Hatchling | null) {
  if (!hatchling?.createdAt) return false;
  const createdAt = Date.parse(hatchling.createdAt);
  return Number.isFinite(createdAt) && Date.now() - createdAt <= RECENT_HATCH_MS;
}

function matchesFilters(
  slot: CollectionSlot,
  {
    element,
    rarity,
    stage,
  }: {
    element: ElementFilter;
    rarity: RarityFilter;
    stage: StageFilter;
  },
) {
  if (element !== "all" && slot.element !== element) return false;
  if (stage !== "all" && slot.stage !== stage) return false;
  if (rarity === "all") return true;

  const normalizedRarity = normalizeMonsterRarity(rarity);
  if (MONSTER_RARITIES.includes(rarity as MonsterRarity)) {
    return slot.rarity === normalizedRarity;
  }

  return slot.hatchling?.rarity === rarity;
}

async function shareHatchling(item: Hatchling) {
  const url = buildHatchlingShareUrl(item.id);
  if (!url) return;

  await Share.share({
    message: `Check out my ${capitalize(item.rarity ?? "rare")} hatchling ${item.name} on HatchUp! ${url}`,
    url,
  });
}

function CollectionProgress({
  discoveredCount,
  totalCount,
}: {
  discoveredCount: number;
  totalCount: number;
}) {
  const colors = useColors();
  const pct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

  return (
    <GameCard accentColor={colors.primary} style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <View>
          <Text style={[styles.progressKicker, { color: colors.primary }]}>COLLECTION BOOK</Text>
          <Text style={[styles.progressTitle, { color: colors.foreground }]}>
            {discoveredCount}/{totalCount} discovered
          </Text>
        </View>
        <View style={[styles.progressBadge, { backgroundColor: `${colors.primary}22` }]}>
          <Text style={[styles.progressBadgeText, { color: colors.primary }]}>{pct}%</Text>
        </View>
      </View>
      <ProgressBar value={discoveredCount} max={totalCount} color={colors.primary} height={9} />
      <Text style={[styles.progressHint, { color: colors.mutedForeground }]}>
        Discover every element, stage, and rarity combo as your Pals hatch and evolve.
      </Text>
    </GameCard>
  );
}

function FilterGroup<T extends string>({
  active,
  getColor,
  items,
  label,
  onChange,
}: {
  active: T;
  getColor?: (item: T) => string;
  items: readonly T[];
  label: string;
  onChange: (item: T) => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.filterGroup}>
      <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const selected = item === active;
          const color = getColor?.(item) ?? colors.primary;
          return (
            <Pressable
              onPress={() => onChange(item)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: selected ? `${color}24` : colors.card,
                  borderColor: selected ? color : colors.border,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? color : colors.mutedForeground }]}>
                {capitalize(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function HatchlingCard({ slot, onPress }: { slot: CollectionSlot; onPress: () => void }) {
  const colors = useColors();
  const hatchling = slot.hatchling;
  const rarityColor = getRarityColor(hatchling?.rarity ?? slot.rarity);
  const isNew = isRecentHatch(hatchling);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => hatchling && shareHatchling(hatchling)}
      delayLongPress={400}
      style={styles.pressableCard}
      testID={hatchling ? `card-hatchling-${hatchling.id}` : `card-locked-${slot.key}`}
    >
      <GameCard accentColor={rarityColor} style={styles.card}>
        <View style={styles.artWrap}>
          <MonsterAsset monster={hatchling ?? undefined} element={slot.element} rarity={slot.rarity} stage={slot.stage} size={76} />
        </View>
        {isNew ? (
          <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.newBadgeText}>New</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => hatchling && shareHatchling(hatchling)}
          hitSlop={8}
          disabled={!hatchling}
          style={styles.cardShareBtn}
          testID={hatchling ? `button-share-hatchling-${hatchling.id}` : undefined}
        >
          <Feather name={hatchling ? "share-2" : "lock"} size={13} color={hatchling ? rarityColor : colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.cardName, { color: hatchling ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
          {hatchling?.name ?? "Undiscovered"}
        </Text>
        <Text style={[styles.cardSpecies, { color: colors.mutedForeground }]} numberOfLines={1}>
          {hatchling?.species ?? `${capitalize(slot.element)} ${capitalize(slot.stage)}`}
        </Text>
        <View style={styles.badgeRow}>
          <RarityPill rarity={hatchling?.rarity ?? slot.rarity} />
          <ElementBadge element={slot.element} />
        </View>
        <View style={styles.cardFooter}>
          <Text style={[styles.stageText, { color: colors.mutedForeground }]}>{capitalize(slot.stage)}</Text>
          {hatchling ? (
            <Text style={[styles.levelText, { color: rarityColor }]}>Lv {hatchling.level ?? 1}</Text>
          ) : (
            <Text style={[styles.levelText, { color: colors.mutedForeground }]}>Locked</Text>
          )}
        </View>
      </GameCard>
    </Pressable>
  );
}

function LockedOrDiscoveredCard({ slot, onPress }: { slot: CollectionSlot; onPress: () => void }) {
  if (slot.hatchling) {
    return <HatchlingCard slot={slot} onPress={onPress} />;
  }

  return <LockedCard slot={slot} />;
}

function LockedCard({ slot }: { slot: CollectionSlot }) {
  const colors = useColors();
  const rarityColor = getRarityColor(slot.rarity);

  return (
    <GameCard accentColor={colors.border} style={[styles.card, styles.lockedCard]}>
      <View style={[styles.lockedArt, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.lockedSilhouette, { backgroundColor: `${rarityColor}33` }]} />
        <Feather name="lock" size={16} color={colors.mutedForeground} style={styles.lockIcon} />
      </View>
      <Text style={[styles.cardName, { color: colors.mutedForeground }]} numberOfLines={1}>
        Unknown Pal
      </Text>
      <Text style={[styles.cardSpecies, { color: colors.mutedForeground }]} numberOfLines={1}>
        {capitalize(slot.element)} {capitalize(slot.stage)}
      </Text>
      <View style={styles.badgeRow}>
        <RarityPill rarity={slot.rarity} />
        <ElementBadge element={slot.element} />
      </View>
      <Text style={[styles.lockedHint, { color: colors.mutedForeground }]}>
        Hatch or evolve to reveal.
      </Text>
    </GameCard>
  );
}

export default function HatchlingsScreen() {
  const PLAYER_ID = useCurrentPlayerId();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedElement, setSelectedElement] = useState<ElementFilter>("all");
  const [selectedStage, setSelectedStage] = useState<StageFilter>("all");
  const [selectedRarity, setSelectedRarity] = useState<RarityFilter>("all");
  const { data: hatchlings, isLoading } = useListHatchlings({ playerId: PLAYER_ID, limit: 50 });
  const allHatchlings = (hatchlings ?? []) as Hatchling[];

  const slots = useMemo(() => getCollectionSlots(allHatchlings), [allHatchlings]);
  const discoveredCount = slots.filter((slot) => slot.hatchling).length;
  const visibleSlots = slots.filter((slot) =>
    matchesFilters(slot, {
      element: selectedElement,
      rarity: selectedRarity,
      stage: selectedStage,
    }),
  );

  return (
    <ScreenGradientBg>
      <ScreenHeader
        title="My Pals"
        subtitle="Collection book"
        style={{ paddingTop: topPad + 12, paddingBottom: 10 }}
        right={
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
          </View>
        }
      />

      <FlatList
        data={isLoading ? [] : visibleSlots}
        keyExtractor={(slot) => slot.key}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ padding: 12, paddingBottom: bottomPad + 90 }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <CollectionProgress discoveredCount={discoveredCount} totalCount={slots.length} />
            <FilterGroup
              active={selectedElement}
              items={ELEMENTS}
              label="Element"
              onChange={setSelectedElement}
              getColor={(item) =>
                item === "all" ? colors.primary : getRarityColor(item === "storm" ? "epic" : item === "tide" ? "rare" : "uncommon")
              }
            />
            <FilterGroup
              active={selectedStage}
              items={STAGES}
              label="Stage"
              onChange={setSelectedStage}
              getColor={(item) => (item === "all" ? colors.primary : getStageColor(normalizeMonsterStage(item)))}
            />
            <FilterGroup
              active={selectedRarity}
              items={RARITIES}
              label="Rarity"
              onChange={setSelectedRarity}
              getColor={(item) => (item === "all" ? colors.primary : getRarityColor(item))}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={isLoading ? "Loading collection..." : allHatchlings.length === 0 ? "No pals yet" : "No matches"}
            description={
              isLoading
                ? "Opening your Collection Book."
                : allHatchlings.length === 0
                  ? "Head to Hatch to crack open some eggs."
                  : "Try a different element, stage, or rarity filter."
            }
            icon={isLoading ? "loader" : "book-open"}
          />
        }
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <LockedOrDiscoveredCard
            slot={item}
            onPress={() => {
              if (item.hatchling) router.push(`/hatchling/${item.hatchling.id}` as any);
            }}
          />
        )}
      />
    </ScreenGradientBg>
  );
}

function getStageColor(stage: MonsterStage) {
  switch (stage) {
    case "egg":
      return "#f59e0b";
    case "teen":
      return "#6366f1";
    case "final":
      return "#a855f7";
    case "baby":
    default:
      return "#22c55e";
  }
}

const styles = StyleSheet.create({
  artWrap: { alignItems: "center", height: 82, justifyContent: "center", marginBottom: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 3 },
  card: { flex: 1, gap: 6, minHeight: 208, overflow: "hidden" },
  cardFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: "auto" },
  cardName: { fontSize: 14, fontWeight: "800" },
  cardShareBtn: { padding: 4, position: "absolute", right: 8, top: 8 },
  cardSpecies: { fontSize: 11 },
  filterGroup: { gap: 7 },
  filterLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  filterPill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  filterRow: { gap: 8, paddingRight: 8 },
  filterText: { fontSize: 12, fontWeight: "700" },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  headerBtn: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  headerBtnText: { fontSize: 12, fontWeight: "700" },
  levelText: { fontSize: 11, fontWeight: "800" },
  listHeader: { gap: 14, marginBottom: 14 },
  lockIcon: { position: "absolute" },
  lockedArt: { alignItems: "center", alignSelf: "center", borderRadius: 42, borderWidth: 1, height: 84, justifyContent: "center", marginBottom: 4, width: 84 },
  lockedCard: { opacity: 0.82 },
  lockedHint: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  lockedSilhouette: { borderRadius: 28, height: 56, opacity: 0.72, transform: [{ scaleX: 0.82 }], width: 56 },
  newBadge: { borderRadius: 999, left: 8, paddingHorizontal: 8, paddingVertical: 3, position: "absolute", top: 8 },
  newBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  progressBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  progressBadgeText: { fontSize: 13, fontWeight: "900" },
  progressCard: { gap: 10 },
  progressHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  progressHint: { fontSize: 12, lineHeight: 17 },
  progressKicker: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  progressTitle: { fontSize: 20, fontWeight: "900", marginTop: 3 },
  pressableCard: { flex: 1 },
  row: { gap: 10, marginBottom: 10 },
  stageText: { fontSize: 11, fontWeight: "700" },
});
