import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { CompactSummaryRow } from "../components/CompactSummaryRow";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import {
  PageTitle,
  PrimaryCard,
  SecondaryCard,
  UtilityCard,
} from "../components/ui";
import { getCollectionNudge, getScreenLoopSubtitle } from "../content/coreLoopCopy";
import {
  DEX_ELEMENTS,
  DEX_RARITIES,
  getCreatureDexEntries,
  getDexCompletion,
  getDexElementSummary,
  getDexRaritySummary,
  getNextMissingDexEntry,
  type CreatureDexEntry,
} from "../domain/creatureDex";
import {
  getActiveHatchling,
  getHatchlingLevelProgress,
  getHatchlingPowerScore,
  getHatchlingXpProgress,
  getTimeAdjustedHatchling,
  getTrainingPreview,
  getTrainingStatus,
  HATCHLING_XP_PER_LEVEL,
  TRAINING_DAILY_LIMIT,
  PASSIVE_BOND_HOURS,
  TRAINING_XP,
} from "../domain/hatchlings";
import { getPalTrait } from "../domain/palTraits";
import type {
  CollectedHatchling,
  EggElement,
  EggRarity,
  HatchUpData,
  HatchlingStats,
  IncubatorEgg,
} from "../domain/models";
import { getCreatureVisualStage, type CreatureVisualStage } from "../domain/creatureVisuals";
import { colors, elementColors, gameColors, radii, typography } from "../theme";
import { CardEntrance } from "../utils/animations";
import { formatNumber, formatXp } from "../utils/format";

interface Props {
  data: HatchUpData;
  onHomePress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onRenameHatchling: (hatchlingId: string, name: string) => Promise<void>;
  onSetActiveHatchling: (hatchlingId: string) => Promise<void>;
  onSettingsPress: () => void;
  onTrainActiveHatchling: () => Promise<void>;
}

export function CreatureDexScreen({
  data,
  onHomePress,
  onLeaderboardPress,
  onMonsterPress,
  onRenameHatchling,
  onSetActiveHatchling,
  onSettingsPress,
  onTrainActiveHatchling,
}: Props) {
  const entries = getCreatureDexEntries(data.collection);
  const completion = getDexCompletion(data.collection);
  const elementSummary = getDexElementSummary(data.collection);
  const raritySummary = getDexRaritySummary(data.collection);
  const nextMissingEntry = getNextMissingDexEntry(data.collection);
  const activeHatchling = getActiveHatchling(data);
  const smartTargets = useMemo(
    () => getSmartTargets(entries, elementSummary, data),
    [data, elementSummary, entries],
  );
  const initialIndex = Math.max(
    data.collection.findIndex((item) => item.id === activeHatchling?.id),
    0,
  );
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [draftName, setDraftName] = useState("");
  const [elementFilter, setElementFilter] = useState<"all" | EggElement>("all");
  const [rarityFilter, setRarityFilter] = useState<"all" | EggRarity>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "owned" | "missing">("all");
  const selectedHatchling = useMemo(() => {
    if (data.collection.length === 0) return null;
    const hatchling = data.collection[
      Math.min(selectedIndex, data.collection.length - 1)
    ];
    return getTimeAdjustedHatchling(hatchling);
  }, [data.collection, selectedIndex]);
  useEffect(() => {
    setDraftName(selectedHatchling?.name ?? "");
  }, [selectedHatchling?.id, selectedHatchling?.name]);
  const trainingStatus = selectedHatchling
    ? getTrainingStatus(selectedHatchling)
    : null;
  const levelProgress = selectedHatchling
    ? getHatchlingLevelProgress(selectedHatchling.xp)
    : null;
  const trainingPreview = selectedHatchling
    ? getTrainingPreview(selectedHatchling)
    : null;
  const hasPals = data.collection.length > 0;
  const filteredEntries = entries.filter((entry) => {
    const elementMatches =
      elementFilter === "all" || entry.element === elementFilter;
    const rarityMatches =
      rarityFilter === "all" || entry.rarity === rarityFilter;
    const statusMatches =
      statusFilter === "all" ||
      (statusFilter === "owned" && entry.ownedCount > 0) ||
      (statusFilter === "missing" && entry.ownedCount === 0);
    return elementMatches && rarityMatches && statusMatches;
  }).sort((left, right) => right.ownedCount - left.ownedCount);

  return (
    <Screen
      footer={
        <BottomNav
          active="dex"
          onDexPress={() => undefined}
          onHomePress={onHomePress}
          onLeaderboardPress={onLeaderboardPress}
          onMonsterPress={onMonsterPress}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <PageTitle
        eyebrow="Collection"
        subtitle={`${getScreenLoopSubtitle("collection")} Each Pal has its own level, bond, and stats.`}
        title="Grow your team of Pals."
      />
      {!hasPals ? (
        <EmptyCollectionState onHatcheryPress={onMonsterPress} />
      ) : (
        <SecondaryCard style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Collection progress</Text>
            <Text style={styles.progressMeta}>
              {completion.unlocked}/{completion.total}
            </Text>
          </View>
          <Text style={styles.progressCopy}>
            {completion.total} element and rarity entries live in the Collection
            Book. Each discovered Pal can grow through Baby, Teen, and Final stages.
          </Text>
          <ProgressBar progress={completion.percent} />
          <View style={styles.summaryChips}>
            {elementSummary.map((summary) => (
              <SummaryChip
                key={summary.id}
                label={capitalize(summary.id)}
                progress={summary.percent}
                value={`${summary.unlocked}/${summary.total}`}
              />
            ))}
          </View>
          <View style={styles.summaryChips}>
            {raritySummary.map((summary) => (
              <SummaryChip
                key={summary.id}
                label={capitalize(summary.id)}
                progress={summary.percent}
                value={`${summary.unlocked}/${summary.total}`}
              />
            ))}
          </View>
        </SecondaryCard>
      )}
      <CollectionFilterChips
        elementFilter={elementFilter}
        onClear={() => {
          setElementFilter("all");
          setRarityFilter("all");
          setStatusFilter("all");
        }}
        onElementToggle={(value) =>
          setElementFilter((current) => (current === value ? "all" : value))
        }
        onRarityToggle={(value) =>
          setRarityFilter((current) => (current === value ? "all" : value))
        }
        onStatusToggle={(value) =>
          setStatusFilter((current) => (current === value ? "all" : value))
        }
        rarityFilter={rarityFilter}
        statusFilter={statusFilter}
      />
      <SmartTargetsSection targets={smartTargets} />
      {nextMissingEntry && (
        <SecondaryCard style={styles.targetCard}>
          <View style={styles.targetText}>
            <Text style={styles.targetKicker}>NEXT COLLECTION TARGET</Text>
            <Text style={styles.targetTitle}>{nextMissingEntry.name}</Text>
            <Text style={styles.targetBody}>
              Hatch a {capitalize(nextMissingEntry.rarity)}{" "}
              {capitalize(nextMissingEntry.element)} Egg to reveal this Pal.
            </Text>
          </View>
          <View style={styles.targetAvatar}>
            <EggAvatar
              element={nextMissingEntry.element}
              rarity={nextMissingEntry.rarity}
              size="small"
            />
          </View>
        </SecondaryCard>
      )}
      {!hasPals && (
        <CollapsibleSection
          badge={`${entries.length}`}
          defaultOpen={false}
          subtitle="Peek at future element and rarity goals without filling the page."
          title="Preview Collection Book"
        >
          <View style={styles.grid}>
            {filteredEntries.map((entry) => (
              <DexCard collection={data.collection} entry={entry} key={entry.id} />
            ))}
          </View>
        </CollapsibleSection>
      )}
      {hasPals && (
        <OwnedPalShelf
          activeHatchlingId={data.activeHatchlingId}
          collection={data.collection}
          onSelect={(hatchlingId) => {
            const index = data.collection.findIndex((item) => item.id === hatchlingId);
            if (index >= 0) setSelectedIndex(index);
          }}
          onSetActiveHatchling={onSetActiveHatchling}
          onTrainActiveHatchling={onTrainActiveHatchling}
        />
      )}
      {selectedHatchling ? (
        <PrimaryCard style={styles.detailCard}>
          <Text style={styles.detailKicker}>
            {selectedHatchling.id === data.activeHatchlingId
              ? "ACTIVE PAL"
              : "COLLECTED PAL"}
          </Text>
          {selectedHatchling.id === data.activeHatchlingId && (
            <View style={styles.detailSparkles}>
              <SparkleBurst label="ACTIVE" tone="accent" />
            </View>
          )}
          <HatchlingAvatar
            element={selectedHatchling.element}
            level={selectedHatchling.level}
            rarity={selectedHatchling.rarity}
          />
          <Text style={styles.detailName}>{selectedHatchling.name}</Text>
          <Text style={styles.detailMeta}>
            Level {selectedHatchling.level} | {capitalize(selectedHatchling.rarity)}{" "}
            {capitalize(selectedHatchling.element)}
          </Text>
          <Text style={styles.moodText}>
            Mood: {capitalize(selectedHatchling.mood)} | Bond{" "}
            {selectedHatchling.bond}/100
          </Text>
          <UtilityCard style={styles.identityCard}>
            <Text style={styles.identityTitle}>Companion identity</Text>
            <Text style={styles.identityText}>
              {getPalPersonality(selectedHatchling)}
            </Text>
            <Text style={styles.identityEffect}>
              {getPalCompanionEffect(selectedHatchling)}
            </Text>
            <Text style={styles.identityLoop}>
              Set a favorite Pal to grow bond from daily activity and return
              visits.
            </Text>
          </UtilityCard>
          <PalTraitCard hatchling={selectedHatchling} />
          <LabeledProgress
            label="Bond"
            progress={selectedHatchling.bond / 100}
            value={`${selectedHatchling.bond}/100`}
          />
          <LabeledProgress
            label={
              levelProgress?.nextLevel
                ? `Level ${selectedHatchling.level} progress`
                : "Max level"
            }
            progress={getHatchlingXpProgress(selectedHatchling.xp)}
            value={
              levelProgress?.nextLevel
                ? `${formatNumber(levelProgress.currentLevelXp)}/${formatNumber(levelProgress.xpPerLevel)} XP`
                : "Complete"
            }
          />
          <Text style={styles.detailCaption}>
            {formatNumber(selectedHatchling.xp)} Pal XP | Power{" "}
            {getHatchlingPowerScore(selectedHatchling)}
            {levelProgress?.nextLevel
              ? ` | ${formatXp(levelProgress.xpToNext)} to L${levelProgress.nextLevel}`
              : " | Max level"}
          </Text>
          <EvolutionPreviewCard hatchling={selectedHatchling} />
          <CollapsibleSection
            badge="Edit"
            subtitle="Rename this Pal whenever its personality clicks."
            title="Nickname"
          >
            <UtilityCard style={styles.renameCard}>
              <Text style={styles.renameLabel}>Nickname</Text>
              <TextInput
                autoCapitalize="words"
                maxLength={18}
                onChangeText={setDraftName}
                placeholder={selectedHatchling.name}
                placeholderTextColor={colors.muted}
                style={styles.renameInput}
                value={draftName}
              />
              <AppButton
                label="Save nickname"
                onPress={async () => {
                  await onRenameHatchling(selectedHatchling.id, draftName);
                }}
                variant="secondary"
              />
            </UtilityCard>
          </CollapsibleSection>
          <CollapsibleSection
            badge={`P${getHatchlingPowerScore(selectedHatchling)}`}
            subtitle="Heart, power, guard, and speed for this Pal."
            title="Stats"
          >
            <View style={styles.statGrid}>
              <Stat
                highlight={getTopStats(selectedHatchling.stats).includes("heart")}
                label="Heart"
                max={getStatBarMax(selectedHatchling.stats)}
                value={selectedHatchling.stats.heart}
              />
              <Stat
                highlight={getTopStats(selectedHatchling.stats).includes("power")}
                label="Power"
                max={getStatBarMax(selectedHatchling.stats)}
                value={selectedHatchling.stats.power}
              />
              <Stat
                highlight={getTopStats(selectedHatchling.stats).includes("resilience")}
                label="Guard"
                max={getStatBarMax(selectedHatchling.stats)}
                value={selectedHatchling.stats.resilience}
              />
              <Stat
                highlight={getTopStats(selectedHatchling.stats).includes("speed")}
                label="Speed"
                max={getStatBarMax(selectedHatchling.stats)}
                value={selectedHatchling.stats.speed}
              />
            </View>
          </CollapsibleSection>
          <CollapsibleSection
            badge={`${trainingStatus?.remainingToday ?? 0} left`}
            subtitle="Training is limited each day so growth feels earned."
            title="Training plan"
          >
            <UtilityCard style={styles.trainingCard}>
              <Text style={styles.trainingTitle}>Training plan</Text>
              <Text style={styles.trainingText}>
                {selectedHatchling.id === data.activeHatchlingId
                  ? trainingStatus?.cooldownLabel
                  : "Make this Pal active before training."}
              </Text>
              <TrainingPips sessionsToday={trainingStatus?.sessionsToday ?? 0} />
              <Text style={styles.trainingHint}>
                +{trainingPreview?.xpGain ?? TRAINING_XP} XP and +
                {trainingPreview?.bondGain ?? 0} bond per session.{" "}
                {trainingPreview?.levelsGained
                  ? `Next training reaches L${trainingPreview.levelAfterTraining}.`
                  : `Power +${trainingPreview?.powerGain ?? 0} after the next level-up.`}{" "}
                Passive bond grows every {PASSIVE_BOND_HOURS} hours.
              </Text>
              <AppButton
                disabled={
                  selectedHatchling.id === data.activeHatchlingId &&
                  !trainingStatus?.canTrain
                }
                label={
                  selectedHatchling.id !== data.activeHatchlingId
                    ? "Set active Pal"
                    : trainingStatus?.canTrain
                      ? "Train now"
                      : "Training cooling down"
                }
                onPress={() => {
                  if (selectedHatchling.id !== data.activeHatchlingId) {
                    void onSetActiveHatchling(selectedHatchling.id);
                    return;
                  }
                  void onTrainActiveHatchling();
                }}
                style={
                  selectedHatchling.id === data.activeHatchlingId &&
                  !trainingStatus?.canTrain
                    ? styles.disabledAction
                    : undefined
                }
                variant="secondary"
              />
            </UtilityCard>
          </CollapsibleSection>
          <CollapsibleSection
            badge={String(selectedHatchling.memories.length)}
            subtitle="Key moments this Pal has earned with you."
            title="Memory log"
          >
            <UtilityCard style={styles.memoryCard}>
              <Text style={styles.trainingTitle}>Memory log</Text>
              {selectedHatchling.memories.slice(0, 4).map((memory) => (
                <View key={memory.id} style={styles.memoryRow}>
                  <Text style={styles.memoryLabel}>{memory.label}</Text>
                  <Text style={styles.memoryText}>{memory.description}</Text>
                  <Text style={styles.memoryDate}>
                    {new Date(memory.happenedAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </UtilityCard>
          </CollapsibleSection>
          <View style={styles.carouselActions}>
            <AppButton
              label="Previous"
              onPress={() => {
                setDraftName("");
                setSelectedIndex((index) =>
                  index === 0 ? data.collection.length - 1 : index - 1,
                );
              }}
              style={styles.carouselButton}
              variant="secondary"
            />
            <AppButton
              label="Next"
              onPress={() => {
                setDraftName("");
                setSelectedIndex((index) => (index + 1) % data.collection.length);
              }}
              style={styles.carouselButton}
              variant="secondary"
            />
          </View>
          <AppButton
            disabled={selectedHatchling.id === data.activeHatchlingId}
            label={
              selectedHatchling.id === data.activeHatchlingId
                ? "Active Pal selected"
                : "Set as active Pal"
            }
            onPress={() => onSetActiveHatchling(selectedHatchling.id)}
            style={
              selectedHatchling.id === data.activeHatchlingId
                ? styles.disabledAction
                : undefined
            }
          />
        </PrimaryCard>
      ) : null}
      {hasPals && (
        <>
          <CollapsibleSection
            badge={`${filteredEntries.length}`}
            defaultOpen={false}
            subtitle="The chip bar above controls this view."
            title="Filtered collection book"
          >
            <Text style={styles.filterHelp}>
              Owned Pals stay prioritized. Locked entries show which Egg type to
              chase next.
            </Text>
          </CollapsibleSection>
          <ActiveFilterSummary
            elementFilter={elementFilter}
            filteredCount={filteredEntries.length}
            onClear={() => {
              setElementFilter("all");
              setRarityFilter("all");
              setStatusFilter("all");
            }}
            rarityFilter={rarityFilter}
            statusFilter={statusFilter}
            totalCount={entries.length}
          />
          <View style={styles.grid}>
            {filteredEntries.map((entry) => (
              <DexCard collection={data.collection} entry={entry} key={entry.id} />
            ))}
          </View>
          {filteredEntries.length === 0 && (
            <View style={styles.noResultsCard}>
              <Text style={styles.promptTitle}>No matches yet</Text>
              <Text style={styles.promptText}>
                Clear a filter or keep hatching to discover this corner of the
                collection book.
              </Text>
              <AppButton
                label="Clear filters"
                onPress={() => {
                  setElementFilter("all");
                  setRarityFilter("all");
                  setStatusFilter("all");
                }}
                variant="secondary"
              />
            </View>
          )}
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Collection loop</Text>
            <Text style={styles.promptText}>
              {getCollectionNudge(data.collection.length)} Use Collection to pick
              who trains next and track every element and rarity still missing.
            </Text>
            <AppButton label="Keep hatching" onPress={onMonsterPress} />
          </View>
        </>
      )}
    </Screen>
  );
}

function EmptyCollectionState({
  onHatcheryPress,
}: {
  onHatcheryPress: () => void;
}) {
  return (
    <PrimaryCard style={styles.emptyCollectionHero}>
      <Text style={styles.emptyCollectionTitle}>No Pals yet</Text>
      <Text style={styles.emptyCollectionBody}>
        Hatch your first Egg to unlock your first Pal.
      </Text>
      <AppButton label="Go to Hatchery" onPress={onHatcheryPress} />
    </PrimaryCard>
  );
}

function OwnedPalShelf({
  activeHatchlingId,
  collection,
  onSelect,
  onSetActiveHatchling,
  onTrainActiveHatchling,
}: {
  activeHatchlingId: string | null;
  collection: readonly CollectedHatchling[];
  onSelect: (hatchlingId: string) => void;
  onSetActiveHatchling: (hatchlingId: string) => Promise<void>;
  onTrainActiveHatchling: () => Promise<void>;
}) {
  const ownedPals = collection
    .map((hatchling) => getTimeAdjustedHatchling(hatchling))
    .sort((left, right) => {
      if (left.id === activeHatchlingId) return -1;
      if (right.id === activeHatchlingId) return 1;
      return getHatchlingPowerScore(right) - getHatchlingPowerScore(left);
    });

  return (
    <SecondaryCard style={styles.ownedShelf}>
      <View style={styles.ownedShelfHeader}>
        <View>
          <Text style={styles.ownedShelfKicker}>Your Pals</Text>
          <Text style={styles.ownedShelfTitle}>Owned Pals come first</Text>
        </View>
        <Text style={styles.ownedShelfCount}>{formatNumber(ownedPals.length)}</Text>
      </View>
      <View style={styles.ownedGrid}>
        {ownedPals.map((hatchling, index) => {
          const active = hatchling.id === activeHatchlingId;
          const recentlyHatched = isRecentlyHatched(hatchling);
          const trainingStatus = getTrainingStatus(hatchling);
          return (
            <CardEntrance
              delay={Math.min(index * 35, 140)}
              key={hatchling.id}
              style={[
                styles.ownedPalCard,
                active && styles.ownedPalCardActive,
                recentlyHatched && styles.ownedPalCardNew,
              ]}
            >
              {active && <Text style={styles.favoriteBadge}>Active</Text>}
              {recentlyHatched && !active && <Text style={styles.newBadge}>New</Text>}
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelect(hatchling.id)}
                style={styles.ownedPalTapTarget}
              >
                <HatchlingAvatar
                  element={hatchling.element}
                  level={hatchling.level}
                  rarity={hatchling.rarity}
                  size="small"
                />
                <Text style={styles.ownedPalName}>{hatchling.name}</Text>
                <Text style={styles.ownedPalMeta}>
                  L{hatchling.level} | {capitalize(hatchling.rarity)} {capitalize(hatchling.element)}
                </Text>
              </Pressable>
              <View style={styles.ownedActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={active}
                  onPress={() => {
                    void onSetActiveHatchling(hatchling.id);
                  }}
                  style={[styles.quickAction, active && styles.quickActionDisabled]}
                >
                  <Text style={styles.quickActionText}>
                    {active ? "Active" : "Set active"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!active || !trainingStatus.canTrain}
                  onPress={() => {
                    void onTrainActiveHatchling();
                  }}
                  style={[
                    styles.quickAction,
                    (!active || !trainingStatus.canTrain) && styles.quickActionDisabled,
                  ]}
                >
                  <Text style={styles.quickActionText}>Train</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSelect(hatchling.id)}
                  style={styles.quickAction}
                >
                  <Text style={styles.quickActionText}>Rename</Text>
                </Pressable>
              </View>
            </CardEntrance>
          );
        })}
      </View>
    </SecondaryCard>
  );
}

function ActiveFilterSummary({
  elementFilter,
  filteredCount,
  onClear,
  rarityFilter,
  statusFilter,
  totalCount,
}: {
  elementFilter: "all" | EggElement;
  filteredCount: number;
  onClear: () => void;
  rarityFilter: "all" | EggRarity;
  statusFilter: "all" | "owned" | "missing";
  totalCount: number;
}) {
  const activeFilters = [
    elementFilter !== "all" ? capitalize(elementFilter) : null,
    rarityFilter !== "all" ? capitalize(rarityFilter) : null,
    statusFilter !== "all" ? capitalize(statusFilter) : null,
  ].filter(Boolean);
  const hasFilters = activeFilters.length > 0;
  if (!hasFilters) return null;

  return (
    <UtilityCard style={styles.activeFilterCard}>
      <View style={styles.activeFilterText}>
        <Text style={styles.activeFilterTitle}>
          Collection entries in view: {filteredCount}/{totalCount}
        </Text>
        <Text style={styles.activeFilterBody}>
          Active filters: {activeFilters.join(" + ")}
        </Text>
      </View>
      <Pressable onPress={onClear} style={styles.clearFilterButton}>
        <Text style={styles.clearFilterText}>Clear</Text>
      </Pressable>
    </UtilityCard>
  );
}

function CollectionFilterChips({
  elementFilter,
  onClear,
  onElementToggle,
  onRarityToggle,
  onStatusToggle,
  rarityFilter,
  statusFilter,
}: {
  elementFilter: "all" | EggElement;
  onClear: () => void;
  onElementToggle: (value: EggElement) => void;
  onRarityToggle: (value: EggRarity) => void;
  onStatusToggle: (value: "owned" | "missing") => void;
  rarityFilter: "all" | EggRarity;
  statusFilter: "all" | "owned" | "missing";
}) {
  const hasActiveFilter =
    elementFilter !== "all" || rarityFilter !== "all" || statusFilter !== "all";

  return (
    <SecondaryCard style={styles.filterBarCard}>
      <View style={styles.filterBarHeader}>
        <View>
          <Text style={styles.filterBarKicker}>Browse smarter</Text>
          <Text style={styles.filterBarTitle}>Filter Collection</Text>
        </View>
        {hasActiveFilter && (
          <Pressable
            accessibilityLabel="Clear Collection filters"
            accessibilityRole="button"
            onPress={onClear}
            style={styles.filterClearChip}
          >
            <Text style={styles.filterClearText}>Clear</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.filterChipRow}>
        <FilterChip active={!hasActiveFilter} label="All" onPress={onClear} />
        <FilterChip
          active={statusFilter === "owned"}
          label="Owned"
          onPress={() => onStatusToggle("owned")}
        />
        <FilterChip
          active={statusFilter === "missing"}
          label="Locked"
          onPress={() => onStatusToggle("missing")}
        />
        {DEX_ELEMENTS.map((element) => (
          <FilterChip
            active={elementFilter === element}
            key={element}
            label={capitalize(element)}
            onPress={() => onElementToggle(element)}
          />
        ))}
        {DEX_RARITIES.map((rarity) => (
          <FilterChip
            active={rarityFilter === rarity}
            key={rarity}
            label={capitalize(rarity)}
            onPress={() => onRarityToggle(rarity)}
          />
        ))}
      </View>
    </SecondaryCard>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Filter Collection by ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SmartTargetsSection({
  targets,
}: {
  targets: ReturnType<typeof getSmartTargets>;
}) {
  return (
    <SecondaryCard style={styles.smartTargetsCard}>
      <View style={styles.smartTargetsHeader}>
        <View>
          <Text style={styles.smartTargetsKicker}>Smart Targets</Text>
          <Text style={styles.smartTargetsTitle}>Choose the next Egg chase</Text>
        </View>
        <Text style={styles.smartTargetsBadge}>Guide</Text>
      </View>
      <View style={styles.smartTargetGrid}>
        {targets.map((target) => (
          <SmartTargetCard key={target.id} target={target} />
        ))}
      </View>
    </SecondaryCard>
  );
}

function SmartTargetCard({
  target,
}: {
  target: SmartCollectionTarget;
}) {
  return (
    <View style={styles.smartTargetCard}>
      <Text style={styles.smartTargetLabel}>{target.label}</Text>
      <Text style={styles.smartTargetTitle}>{target.title}</Text>
      <Text style={styles.smartTargetBody}>{target.body}</Text>
    </View>
  );
}

function LabeledProgress({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressBlockHeader}>
        <Text style={styles.progressBlockLabel}>{label}</Text>
        <Text style={styles.progressBlockValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
}

function Stat({
  highlight,
  label,
  max,
  value,
}: {
  highlight: boolean;
  label: string;
  max: number;
  value: number;
}) {
  return (
    <View style={[styles.stat, highlight && styles.statHighlight]}>
      <View style={styles.statHeader}>
        <Text style={styles.statValue}>{value}</Text>
        {highlight && <Text style={styles.statTag}>Best</Text>}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${Math.min(value / max, 1) * 100}%` }]} />
      </View>
    </View>
  );
}

function TrainingPips({ sessionsToday }: { sessionsToday: number }) {
  return (
    <View style={styles.trainingPips}>
      {Array.from({ length: TRAINING_DAILY_LIMIT }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.trainingPip,
            index < sessionsToday && styles.trainingPipUsed,
          ]}
        />
      ))}
      <Text style={styles.trainingPipText}>
        {Math.max(TRAINING_DAILY_LIMIT - sessionsToday, 0)} left today
      </Text>
    </View>
  );
}

function SummaryChip({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View style={styles.summaryChip}>
      <View style={styles.summaryChipHeader}>
        <Text style={styles.summaryChipLabel}>{label}</Text>
        <Text style={styles.summaryChipValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
    </View>
  );
}

function EvolutionPreviewCard({ hatchling }: { hatchling: CollectedHatchling }) {
  const currentStage = getCreatureVisualStage(hatchling.level);
  const next = getNextEvolutionStage(currentStage);
  const xpRemaining = next
    ? Math.max((next.levelRequired - 1) * HATCHLING_XP_PER_LEVEL - hatchling.xp, 0)
    : 0;

  return (
    <UtilityCard style={styles.evolutionCard}>
      <View style={styles.evolutionHeader}>
        <View>
          <Text style={styles.evolutionKicker}>Evolution preview</Text>
          <Text style={styles.evolutionTitle}>
            {capitalize(currentStage)}
            {next ? ` -> ${capitalize(next.stage)}` : " stage complete"}
          </Text>
        </View>
        <View style={styles.evolutionPreviewAvatar}>
          <HatchlingAvatar
            element={hatchling.element}
            level={next?.levelRequired ?? hatchling.level}
            rarity={hatchling.rarity}
            size="small"
          />
        </View>
      </View>
      <CompactSummaryRow label="Current stage" value={capitalize(currentStage)} />
      <CompactSummaryRow
        label="Next stage"
        value={next ? capitalize(next.stage) : "Fully grown"}
        tone={next ? undefined : "ready"}
      />
      <CompactSummaryRow
        label="Level required"
        value={next ? `Level ${next.levelRequired}` : "Complete"}
      />
      <CompactSummaryRow
        label="XP remaining"
        value={next ? formatXp(xpRemaining) : formatXp(0)}
        tone={xpRemaining === 0 ? "ready" : undefined}
      />
      <Text style={styles.evolutionMicrocopy}>
        Move, train, and return tomorrow to grow this Pal.
      </Text>
    </UtilityCard>
  );
}

function PalTraitCard({ hatchling }: { hatchling: CollectedHatchling }) {
  const trait = getPalTrait(hatchling);

  return (
    <UtilityCard style={styles.traitCard}>
      <View style={styles.traitHeader}>
        <View>
          <Text style={styles.traitKicker}>Personality trait</Text>
          <Text style={styles.traitTitle}>{trait.displayName}</Text>
        </View>
        <Text style={styles.traitPill}>Trait</Text>
      </View>
      <Text style={styles.traitDescription}>{trait.description}</Text>
      <Text style={styles.traitEffect}>Effect: {trait.effect}</Text>
      {trait.implementationNote && (
        <Text style={styles.traitNote}>{trait.implementationNote}</Text>
      )}
    </UtilityCard>
  );
}

function getNextEvolutionStage(stage: CreatureVisualStage) {
  if (stage === "baby") {
    return { levelRequired: 5, stage: "teen" as const };
  }
  if (stage === "teen") {
    return { levelRequired: 15, stage: "final" as const };
  }
  return null;
}

function DexCard({
  collection,
  entry,
}: {
  collection: readonly CollectedHatchling[];
  entry: CreatureDexEntry;
}) {
  const unlocked = entry.ownedCount > 0;
  const elementColor = elementColors[entry.element];
  const bestOwned = collection
    .filter(
      (hatchling) =>
        hatchling.element === entry.element && hatchling.rarity === entry.rarity,
    )
    .sort((a, b) => getHatchlingPowerScore(b) - getHatchlingPowerScore(a))[0];

  return (
    <View
      style={[
        styles.card,
        { borderColor: elementColor },
        !unlocked && styles.lockedCard,
      ]}
    >
      <View style={!unlocked && styles.lockedAvatar}>
        {unlocked ? (
          <HatchlingAvatar
            element={entry.element}
            level={bestOwned?.level}
            rarity={entry.rarity}
            size="small"
          />
        ) : (
          <View style={styles.mysteryEggWrap}>
            <EggAvatar
              element={entry.element}
              rarity={entry.rarity}
              size="small"
            />
            <Text style={styles.mysteryMark}>?</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardName}>
        {unlocked ? entry.name : `${capitalize(entry.rarity)} ${capitalize(entry.element)}`}
      </Text>
      <Text style={[styles.cardMeta, { color: elementColor }]}>
        {unlocked ? `${capitalize(entry.rarity)} | ${capitalize(entry.element)}` : "Unrevealed"}
      </Text>
      <Text style={styles.cardDescription}>
        {unlocked
          ? entry.description
          : "Hatch this Egg type to discover."}
      </Text>
      {!unlocked && (
        <Text style={styles.lockedHint}>Locked</Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={[styles.status, unlocked && styles.unlockedStatus]}>
          {unlocked ? "Unlocked" : "Locked"}
        </Text>
        {bestOwned && (
          <Text style={styles.count}>
            L{bestOwned.level} | P{getHatchlingPowerScore(bestOwned)}
          </Text>
        )}
        {unlocked && <SparkleBurst />}
      </View>
      {unlocked && entry.ownedCount > 1 && (
        <Text style={styles.duplicateCount}>x{entry.ownedCount} owned</Text>
      )}
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isRecentlyHatched(hatchling: CollectedHatchling) {
  return Date.now() - Date.parse(hatchling.hatchedAt) < 1000 * 60 * 60 * 24;
}

function getPalPersonality(hatchling: CollectedHatchling) {
  const elementTone = {
    ember: "bold, energetic, and happiest after training bursts",
    leaf: "steady, nurturing, and quick to bond through daily routines",
    storm: "curious, restless, and drawn to streaks and big weekly goals",
    tide: "calm, playful, and especially responsive to long walks",
  }[hatchling.element];
  const rarityTone = {
    common: "a dependable everyday companion",
    epic: "a rare presence with a dramatic little spark",
    rare: "a standout Pal that makes collection moments feel special",
    uncommon: "a bright companion with a little extra flair",
  }[hatchling.rarity];

  return `${capitalize(hatchling.name)} is ${elementTone}; ${rarityTone}.`;
}

function getPalCompanionEffect(hatchling: CollectedHatchling) {
  const effect = {
    ember: "Companion focus: training quests and active-calorie days.",
    leaf: "Companion focus: bond, streak, and care milestones.",
    storm: "Companion focus: weekly quests and leaderboard pushes.",
    tide: "Companion focus: distance, steps, and egg progress.",
  }[hatchling.element];

  return `${effect} Future builds can turn this into real passive bonuses.`;
}

function getTopStats(stats: HatchlingStats) {
  const entries = Object.entries(stats) as [keyof HatchlingStats, number][];
  const topValue = Math.max(...entries.map(([, value]) => value));
  return entries
    .filter(([, value]) => value === topValue)
    .map(([key]) => key);
}

function getStatBarMax(stats: HatchlingStats) {
  return Math.max(...Object.values(stats), 20);
}

interface SmartCollectionTarget {
  body: string;
  id: string;
  label: string;
  title: string;
}

function getSmartTargets(
  entries: readonly CreatureDexEntry[],
  elementSummary: ReturnType<typeof getDexElementSummary>,
  data: HatchUpData,
): SmartCollectionTarget[] {
  const missingEntries = entries.filter((entry) => entry.ownedCount === 0);
  const closestEggTarget = getClosestEggTarget(missingEntries, data);
  const closestDiscovery = closestEggTarget?.entry ?? missingEntries[0] ?? null;
  const bestElement =
    elementSummary
      .filter((summary) => summary.unlocked < summary.total)
      .sort((left, right) => {
        if (right.percent !== left.percent) return right.percent - left.percent;
        return right.unlocked - left.unlocked;
      })[0] ?? null;
  const recommendedEntry =
    (bestElement &&
      missingEntries.find((entry) => entry.element === bestElement.id)) ??
    closestDiscovery;
  const rarestMissing =
    [...missingEntries].sort(
      (left, right) =>
        getRarityRank(right.rarity) - getRarityRank(left.rarity) ||
        DEX_ELEMENTS.indexOf(left.element) - DEX_ELEMENTS.indexOf(right.element),
    )[0] ?? null;

  return [
    {
      body: closestDiscovery
        ? closestEggTarget
          ? `${formatNumber(closestEggTarget.stepsLeft)} steps left on a ${capitalize(closestEggTarget.entry.rarity)} ${capitalize(closestEggTarget.entry.element)} Egg.`
          : `Hatch a ${capitalize(closestDiscovery.rarity)} ${capitalize(closestDiscovery.element)} Egg to reveal it.`
        : "Every Collection entry is discovered. Focus on leveling your favorite Pals.",
      id: "closest-discovery",
      label: "Closest discovery",
      title: closestDiscovery?.name ?? "Collection complete",
    },
    {
      body: recommendedEntry
        ? `Best next chase: ${capitalize(recommendedEntry.rarity)} ${capitalize(recommendedEntry.element)} Egg.`
        : "No missing Egg type found. Keep growing levels, bond, and memories.",
      id: "recommended-egg",
      label: "Recommended next Egg",
      title: recommendedEntry
        ? `${capitalize(recommendedEntry.element)} ${capitalize(recommendedEntry.rarity)}`
        : "Train your team",
    },
    {
      body: bestElement
        ? `${bestElement.unlocked}/${bestElement.total} discovered. One more ${capitalize(bestElement.id)} hatch pushes this element forward.`
        : "All elements are fully discovered. Your next goal is evolution progress.",
      id: "element-closest",
      label: "Element closest to completion",
      title: bestElement ? capitalize(bestElement.id) : "All elements",
    },
    {
      body: rarestMissing
        ? `The highest-rarity missing target in your book is ${rarestMissing.name}.`
        : "No rare targets remain locked. That is a very good problem.",
      id: "rarest-missing",
      label: "Rarest missing",
      title: rarestMissing
        ? `${capitalize(rarestMissing.rarity)} ${capitalize(rarestMissing.element)}`
        : "None missing",
    },
  ];
}

function getClosestEggTarget(
  missingEntries: readonly CreatureDexEntry[],
  data: HatchUpData,
) {
  const eggs = [...data.activeEggs, data.activeEgg, ...data.pendingEggs];
  const uniqueEggs = eggs.filter(
    (egg, index, source) => source.findIndex((item) => item.id === egg.id) === index,
  );
  return uniqueEggs
    .map((egg) => {
      const entry = missingEntries.find(
        (candidate) =>
          candidate.element === egg.element && candidate.rarity === egg.rarity,
      );
      if (!entry) return null;
      return {
        entry,
        progress: egg.stepsRequired > 0 ? egg.stepsWalked / egg.stepsRequired : 0,
        stepsLeft: getEggStepsLeft(egg),
      };
    })
    .filter((target): target is {
      entry: CreatureDexEntry;
      progress: number;
      stepsLeft: number;
    } => target !== null)
    .sort((left, right) => {
      if (right.progress !== left.progress) return right.progress - left.progress;
      return left.stepsLeft - right.stepsLeft;
    })[0] ?? null;
}

function getEggStepsLeft(egg: IncubatorEgg) {
  return Math.max(egg.stepsRequired - egg.stepsWalked, 0);
}

function getRarityRank(rarity: EggRarity) {
  return DEX_RARITIES.indexOf(rarity);
}

const styles = StyleSheet.create({
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    lineHeight: 35,
    marginTop: 5,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: typography.bodyLineHeight,
    marginTop: 10,
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 9,
    marginTop: 16,
    padding: 14,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  detailSparkles: {
    alignItems: "center",
    marginBottom: 4,
  },
  emptyCollectionHero: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 15,
  },
  emptyCollectionTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  emptyCollectionBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  ownedShelf: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 12,
  },
  ownedShelfHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ownedShelfKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  ownedShelfTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },
  ownedShelfCount: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ownedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  ownedPalCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    position: "relative",
    width: "48%",
  },
  ownedPalCardActive: {
    borderColor: colors.rewardGold,
  },
  ownedPalCardNew: {
    borderColor: colors.primary,
  },
  favoriteBadge: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    right: 8,
    top: 8,
    zIndex: 1,
  },
  newBadge: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    color: colors.surface,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    right: 8,
    top: 8,
    zIndex: 1,
  },
  ownedPalTapTarget: {
    alignItems: "center",
    gap: 4,
  },
  ownedPalName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  ownedPalMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    textAlign: "center",
  },
  ownedActions: {
    gap: 6,
    marginTop: 8,
  },
  quickAction: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  quickActionDisabled: {
    opacity: 0.5,
  },
  quickActionText: {
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: "900",
  },
  emptyDetailCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  detailKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  detailName: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  detailMeta: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  detailCaption: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
  },
  moodText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  progressBlock: {
    gap: 6,
  },
  progressBlockHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressBlockLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  progressBlockValue: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  identityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  identityTitle: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  identityText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  identityEffect: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  identityLoop: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  traitCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
  },
  traitHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  traitKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  traitTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  traitPill: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  traitDescription: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  traitEffect: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  traitNote: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  renameCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  renameLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  renameInput: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 12,
  },
  trainingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  trainingTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  trainingText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  trainingHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  memoryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  memoryRow: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    padding: 10,
  },
  memoryLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  memoryText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  memoryDate: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  statHighlight: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
  },
  statHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  statTag: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statTrack: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
  },
  statFill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    height: "100%",
  },
  trainingPips: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  trainingPip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 10,
    width: 28,
  },
  trainingPipUsed: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  trainingPipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 4,
  },
  carouselActions: {
    flexDirection: "row",
    gap: 8,
  },
  carouselButton: {
    flex: 1,
  },
  disabledAction: {
    opacity: 0.55,
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  progressCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  progressMeta: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    gap: 6,
    padding: 9,
    width: "48%",
  },
  summaryChipHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryChipLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  summaryChipValue: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  evolutionCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  evolutionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  evolutionKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  evolutionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 3,
  },
  evolutionPreviewAvatar: {
    opacity: 0.72,
  },
  evolutionMicrocopy: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2,
  },
  targetCard: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    padding: 14,
  },
  targetText: {
    flex: 1,
  },
  targetKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  targetTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  targetBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  targetAvatar: {
    opacity: 0.45,
  },
  filterCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    marginTop: 14,
    padding: 12,
  },
  filterTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  filterChip: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  activeFilterCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  activeFilterText: {
    flex: 1,
  },
  activeFilterTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  activeFilterBody: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  clearFilterButton: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearFilterText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  filterBarCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  filterBarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  filterBarKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  filterBarTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  filterClearChip: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterClearText: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  filterHelp: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  smartTargetsCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  smartTargetsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  smartTargetsKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  smartTargetsTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 2,
  },
  smartTargetsBadge: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  smartTargetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smartTargetCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    minHeight: 118,
    padding: 11,
    width: "48%",
  },
  smartTargetLabel: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  smartTargetTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    marginTop: 5,
  },
  smartTargetBody: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  lockedCard: {
    backgroundColor: colors.softLavender,
    borderColor: gameColors.locked,
    borderStyle: "dashed",
  },
  lockedAvatar: {
    alignItems: "center",
  },
  lockedHint: {
    color: gameColors.locked,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 6,
    textAlign: "center",
    textTransform: "uppercase",
  },
  mysteryEggWrap: {
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.82,
  },
  mysteryMark: {
    backgroundColor: colors.surface,
    borderColor: colors.rewardGold,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: colors.accent,
    fontSize: 18,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: "absolute",
  },
  cardName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  cardMeta: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    minHeight: 45,
    textAlign: "center",
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  status: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  unlockedStatus: {
    color: colors.primary,
  },
  count: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  duplicateCount: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
    textAlign: "center",
  },
  promptCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  noResultsCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  promptTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  promptText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
    marginTop: 6,
  },
  promptMission: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 12,
  },
});
