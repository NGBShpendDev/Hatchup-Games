import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { Header } from "../components/Header";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import type { CollectedHatchling, HatchUpData } from "../domain/models";
import { getProgression, MONSTER_STAGES } from "../domain/progression";
import { colors } from "../theme";

interface Props {
  data: HatchUpData;
  latestHatchling: CollectedHatchling | null;
  onBack: () => void;
  onDexPress: () => void;
  onDismissHatch: () => void;
  onHatchAll: () => Promise<void>;
  onHatch: (eggId: string) => Promise<void>;
  onLeaderboardPress: () => void;
  onSettingsPress: () => void;
}

export function MonsterDetailScreen({
  data,
  latestHatchling,
  onBack,
  onDexPress,
  onDismissHatch,
  onHatchAll,
  onHatch,
  onLeaderboardPress,
  onSettingsPress,
}: Props) {
  const progression = getProgression(data.totalXp);
  const readyEggCount = data.activeEggs.filter(isEggReady).length;

  return (
    <Screen
      footer={
        <BottomNav
          active="monster"
          onDexPress={onDexPress}
          onHomePress={onBack}
          onLeaderboardPress={onLeaderboardPress}
          onMonsterPress={() => undefined}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <Header onBack={onBack} title="Hatchery" />
      {latestHatchling && (
        <View style={styles.revealCard}>
          <Text style={styles.revealKicker}>NEW HATCHLING</Text>
          <HatchlingAvatar
            element={latestHatchling.element}
            rarity={latestHatchling.rarity}
          />
          <Text style={styles.revealTitle}>Meet {latestHatchling.name}</Text>
          <Text style={styles.revealText}>
            Your movement hatched a {latestHatchling.rarity}{" "}
            {latestHatchling.element} companion.
          </Text>
          <View style={styles.revealActions}>
            <AppButton
              label="Add to collection"
              onPress={onDismissHatch}
              variant="secondary"
            />
            <AppButton
              label="View in Creature Dex"
              onPress={() => {
                onDismissHatch();
                onDexPress();
              }}
            />
          </View>
        </View>
      )}
      <Text style={styles.sectionTitle}>Active companion</Text>
      <View style={styles.card}>
        <MonsterAvatar stage={progression.current.id} />
        <Text style={styles.name}>{data.monsterName}</Text>
        <Text style={styles.stage}>{progression.current.label} stage</Text>
        <ProgressBar progress={progression.progress} />
        <Text style={styles.caption}>
          {progression.next
            ? `${progression.xpToNext} XP to evolve into ${progression.next.label}`
            : "Your monster has reached its final evolution."}
        </Text>
      </View>
      <Text style={styles.sectionTitle}>Evolution path</Text>
      {MONSTER_STAGES.map((stage) => {
        const unlocked = data.totalXp >= stage.xp;
        return (
          <View style={styles.stageRow} key={stage.id}>
            <View style={[styles.dot, unlocked && styles.unlockedDot]} />
            <View style={styles.stageText}>
              <Text style={styles.rowTitle}>{stage.label}</Text>
              <Text style={styles.rowCaption}>{stage.xp} total XP</Text>
            </View>
            <Text style={[styles.status, unlocked && styles.unlocked]}>
              {unlocked ? "Unlocked" : "Locked"}
            </Text>
          </View>
        );
      })}
      <View style={styles.stats}>
        <Stat label="Total XP" value={String(data.totalXp)} />
        <Stat label="Active eggs" value={`${data.activeEggs.length}/3`} />
        <Stat label="Longest streak" value={`${data.longestStreak} days`} />
      </View>
      <View style={styles.collectionHeader}>
        <Text style={styles.sectionTitle}>Incubator</Text>
        <Text style={styles.collectionCount}>
          {readyEggCount} ready
        </Text>
      </View>
      <Text style={styles.incubatorIntro}>
        Up to three eggs progress together from every health sync. Each new egg
        rolls a random element and weighted rarity.
      </Text>
      {readyEggCount > 1 && (
        <AppButton
          label={`Hatch all ${readyEggCount} ready eggs`}
          onPress={onHatchAll}
          style={styles.hatchAllButton}
        />
      )}
      <View style={styles.incubatorStack}>
        {data.activeEggs.map((egg, index) => {
          const eggReady = isEggReady(egg);
          return (
            <View style={styles.incubatorCard} key={egg.id}>
              <EggAvatar element={egg.element} rarity={egg.rarity} />
              <Text style={styles.eggName}>
                Slot {index + 1}: {capitalize(egg.rarity)}{" "}
                {capitalize(egg.element)} egg
              </Text>
              <Text style={styles.eggCaption}>
                {eggReady
                  ? "Your movement filled this egg. It is ready to hatch."
                  : `${egg.stepsWalked.toLocaleString()} / ${egg.stepsRequired.toLocaleString()} steps walked`}
              </Text>
              <ProgressBar progress={getEggProgress(egg)} />
              <AppButton
                disabled={!eggReady}
                label={eggReady ? "Hatch this egg" : "Keep moving to hatch"}
                onPress={() => onHatch(egg.id)}
                style={!eggReady ? styles.disabledButton : undefined}
                variant={eggReady ? "primary" : "secondary"}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.collectionHeader}>
        <Text style={styles.sectionTitle}>Your hatchlings</Text>
        <Text style={styles.collectionCount}>{data.collection.length} collected</Text>
      </View>
      {data.collection.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Your collection starts with movement.</Text>
          <Text style={styles.emptyText}>
            Hatch your first incubator egg to meet a new pocket companion.
          </Text>
        </View>
      ) : (
        <View style={styles.collection}>
          {data.collection.map((hatchling) => (
            <View style={styles.hatchlingCard} key={hatchling.id}>
              <HatchlingAvatar
                element={hatchling.element}
                rarity={hatchling.rarity}
                size="small"
              />
              <Text style={styles.hatchlingName}>{hatchling.name}</Text>
              <Text style={styles.hatchlingMeta}>
                {capitalize(hatchling.rarity)} {capitalize(hatchling.element)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
  },
  revealCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 22,
    padding: 18,
  },
  revealKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "center",
  },
  revealTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  revealText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
    marginTop: 5,
    textAlign: "center",
  },
  revealActions: {
    gap: 8,
  },
  name: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  stage: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 14,
    marginTop: 4,
    textAlign: "center",
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 9,
    textAlign: "center",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
    marginTop: 22,
  },
  stageRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 8,
    padding: 14,
  },
  dot: {
    backgroundColor: colors.line,
    borderRadius: 7,
    height: 14,
    marginRight: 11,
    width: 14,
  },
  unlockedDot: {
    backgroundColor: colors.primary,
  },
  stageText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  rowCaption: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  status: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  unlocked: {
    color: colors.primary,
  },
  stats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  stat: {
    backgroundColor: colors.accentSoft,
    borderRadius: 15,
    flex: 1,
    padding: 14,
  },
  statValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  incubatorCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
  },
  incubatorIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    marginTop: -4,
  },
  incubatorStack: {
    gap: 10,
  },
  hatchAllButton: {
    marginBottom: 10,
  },
  eggName: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  eggCaption: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
    marginTop: 5,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.58,
  },
  collectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  collectionCount: {
    color: colors.muted,
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  collection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hatchlingCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 10,
    width: "48%",
  },
  hatchlingName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  hatchlingMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
});
