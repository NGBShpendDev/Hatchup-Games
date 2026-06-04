import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { EggAvatar } from "../components/EggAvatar";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { Header } from "../components/Header";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { getEggProgress, isEggReady } from "../domain/hatchery";
import {
  getActiveHatchling,
  getHatchlingLevelProgress,
  getHatchlingPowerScore,
  getHatchlingXpProgress,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import type { CollectedHatchling, HatchUpData } from "../domain/models";
import { getProgression, MONSTER_STAGES } from "../domain/progression";
import { colors, radii, typography } from "../theme";

interface Props {
  data: HatchUpData;
  latestHatchling: CollectedHatchling | null;
  onBack: () => void;
  onDexPress: () => void;
  onDismissHatch: () => void;
  onHatchAll: () => Promise<void>;
  onHatch: (eggId: string) => Promise<void>;
  onLeaderboardPress: () => void;
  onSetActiveHatchling: (hatchlingId: string) => Promise<void>;
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
  onSetActiveHatchling,
  onSettingsPress,
}: Props) {
  const progression = getProgression(data.totalXp);
  const readyEggCount = data.activeEggs.filter(isEggReady).length;
  const activeHatchlingRaw = getActiveHatchling(data);
  const activeHatchling = activeHatchlingRaw
    ? getTimeAdjustedHatchling(activeHatchlingRaw)
    : null;
  const activePalProgress = activeHatchling
    ? getHatchlingLevelProgress(activeHatchling.xp)
    : null;
  const activePalTraining = activeHatchling
    ? getTrainingStatus(activeHatchling)
    : null;
  const hatcheryMission = getHatcheryMission({
    activeEggCount: data.activeEggs.length,
    collectionCount: data.collection.length,
    readyEggCount,
  });

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
      <HatchRevealModal
        hatchling={latestHatchling}
        onClose={onDismissHatch}
        onSetActive={async (hatchlingId) => {
          await onSetActiveHatchling(hatchlingId);
          onDismissHatch();
        }}
        onViewPal={() => {
          onDismissHatch();
          onDexPress();
        }}
      />
      <Text style={styles.sectionTitle}>Journey Pal</Text>
      <View style={styles.card}>
        <MonsterAvatar stage={progression.current.id} />
        <Text style={styles.name}>{data.monsterName}</Text>
        <Text style={styles.stage}>{progression.current.label} stage</Text>
        <ProgressBar progress={progression.progress} />
        <Text style={styles.caption}>
          {progression.next
            ? `${progression.xpToNext} journey XP to reach ${progression.next.label}`
            : "Your Pal journey has reached its final stage."}
        </Text>
      </View>
      <Text style={styles.sectionTitle}>Journey stages</Text>
      {MONSTER_STAGES.map((stage) => {
        const unlocked = data.totalXp >= stage.xp;
        return (
          <View style={styles.stageRow} key={stage.id}>
            <View style={[styles.dot, unlocked && styles.unlockedDot]} />
            <View style={styles.stageText}>
              <Text style={styles.rowTitle}>{stage.label}</Text>
              <Text style={styles.rowCaption}>{stage.xp} journey XP</Text>
            </View>
            <Text style={[styles.status, unlocked && styles.unlocked]}>
              {unlocked ? "Unlocked" : "Locked"}
            </Text>
          </View>
        );
      })}
      <View style={styles.stats}>
        <Stat label="Journey XP" value={String(data.totalXp)} />
        <Stat label="Active Eggs" value={`${data.activeEggs.length}/3`} />
        <Stat label="Queued Eggs" value={String(data.pendingEggs.length)} />
      </View>
      <View style={styles.collectionHeader}>
        <Text style={styles.sectionTitle}>Active Pal</Text>
        <Text style={styles.collectionCount}>
          {activeHatchling ? `Level ${activeHatchling.level}` : "None active"}
        </Text>
      </View>
      {activeHatchling ? (
        <View style={styles.trainingCard}>
          <HatchlingAvatar
            element={activeHatchling.element}
            rarity={activeHatchling.rarity}
            size="small"
          />
          <View style={styles.trainingBody}>
            <Text style={styles.trainingName}>{activeHatchling.name}</Text>
            <Text style={styles.trainingMeta}>
              {capitalize(activeHatchling.rarity)}{" "}
              {capitalize(activeHatchling.element)} | {capitalize(activeHatchling.mood)} | Bond{" "}
              {activeHatchling.bond}
            </Text>
            <View style={styles.activePalMiniStats}>
              <Text style={styles.activePalChip}>
                Power {getHatchlingPowerScore(activeHatchling)}
              </Text>
              <Text style={styles.activePalChip}>
                {activePalTraining?.remainingToday ?? 0} trains left
              </Text>
            </View>
            <View style={styles.activePalProgress}>
              <ProgressBar progress={getHatchlingXpProgress(activeHatchling.xp)} />
              <Text style={styles.activePalProgressText}>
                {activePalProgress?.nextLevel
                  ? `${activePalProgress.xpToNext} XP to L${activePalProgress.nextLevel}`
                  : "Max level reached"}
              </Text>
            </View>
          </View>
          <AppButton
            label="Collection"
            onPress={onDexPress}
            style={styles.trainingButton}
            variant="secondary"
          />
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No active Pal yet.</Text>
          <Text style={styles.emptyText}>
            Hatch an Egg to unlock Pal training.
          </Text>
        </View>
      )}
      <View style={styles.collectionHeader}>
        <Text style={styles.sectionTitle}>Eggs in Hatchery</Text>
        <Text style={styles.collectionCount}>
          {readyEggCount} ready
        </Text>
      </View>
      <Text style={styles.incubatorIntro}>
        Up to three Eggs progress together from every health sync. Each new Egg
        rolls a random element and weighted rarity. Bonus Eggs wait here when
        your Hatchery is full.
      </Text>
      <View style={styles.missionCard}>
        <Text style={styles.missionKicker}>Current mission</Text>
        <Text style={styles.missionTitle}>{hatcheryMission.title}</Text>
        <Text style={styles.missionBody}>{hatcheryMission.body}</Text>
        <AppButton
          label={hatcheryMission.cta}
          onPress={
            hatcheryMission.target === "home"
              ? onBack
              : hatcheryMission.target === "collection"
                ? onDexPress
                : () => undefined
          }
          variant="secondary"
        />
      </View>
      {readyEggCount > 1 && (
        <AppButton
          label={`Hatch all ${readyEggCount} ready Eggs`}
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
                {capitalize(egg.element)} Egg
              </Text>
              <Text style={styles.eggCaption}>
                {eggReady
                  ? "Your movement filled this Egg. It is ready to hatch."
                  : `${egg.stepsWalked.toLocaleString()} / ${egg.stepsRequired.toLocaleString()} steps walked`}
              </Text>
              <ProgressBar progress={getEggProgress(egg)} />
              <AppButton
                disabled={!eggReady}
                label={eggReady ? "Hatch this Egg" : "Keep moving to hatch"}
                onPress={() => onHatch(egg.id)}
                style={!eggReady ? styles.disabledButton : undefined}
                variant={eggReady ? "primary" : "secondary"}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.collectionHeader}>
        <Text style={styles.sectionTitle}>Your Pals</Text>
        <Text style={styles.collectionCount}>{data.collection.length} collected</Text>
      </View>
      {data.collection.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Your collection starts with movement.</Text>
          <Text style={styles.emptyText}>
            Hatch your first Egg to meet a new Pal.
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

function HatchRevealModal({
  hatchling,
  onClose,
  onSetActive,
  onViewPal,
}: {
  hatchling: CollectedHatchling | null;
  onClose: () => void;
  onSetActive: (hatchlingId: string) => Promise<void>;
  onViewPal: () => void;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [stage, setStage] = useState<"shake" | "crack" | "reveal">("shake");

  useEffect(() => {
    if (!hatchling) return;

    setStage("shake");
    shake.setValue(0);
    glow.setValue(0);
    const shakeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, {
          duration: 80,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          duration: 80,
          toValue: -1,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          duration: 80,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 6 },
    );
    shakeLoop.start();
    Animated.timing(glow, {
      duration: 1650,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    const crackTimer = setTimeout(() => setStage("crack"), 900);
    const revealTimer = setTimeout(() => setStage("reveal"), 1750);

    return () => {
      shakeLoop.stop();
      clearTimeout(crackTimer);
      clearTimeout(revealTimer);
    };
  }, [glow, hatchling, shake]);

  if (!hatchling) return null;

  const rotate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-7deg", "0deg", "7deg"],
  });
  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.88],
  });
  const revealed = stage === "reveal";

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.revealBackdrop}>
        <View style={styles.revealModal}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.revealClose}
          >
            <Text style={styles.revealCloseText}>Close</Text>
          </Pressable>
          <Text style={styles.revealKicker}>
            {revealed ? "NEW HATCHLING" : "HATCHING"}
          </Text>
          <Text style={styles.revealStageText}>
            {stage === "shake"
              ? "The Egg is moving..."
              : stage === "crack"
                ? "Cracks of light appear."
                : "A new Pal has arrived."}
          </Text>
          <View style={styles.revealArtStage}>
            <Animated.View
              style={[
                styles.revealGlow,
                {
                  opacity: glowOpacity,
                  transform: [
                    {
                      scale: glow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1.18],
                      }),
                    },
                  ],
                },
              ]}
            />
            {revealed ? (
              <HatchlingAvatar
                element={hatchling.element}
                rarity={hatchling.rarity}
              />
            ) : (
              <Animated.View style={{ transform: [{ rotate }] }}>
                <EggAvatar
                  element={hatchling.element}
                  rarity={hatchling.rarity}
                />
              </Animated.View>
            )}
          </View>
          {revealed && (
            <View style={styles.revealResult}>
              <Text style={styles.revealTitle}>Meet {hatchling.name}</Text>
              <Text style={styles.revealText}>
                {capitalize(hatchling.rarity)} {capitalize(hatchling.element)} Pal
                | Level {hatchling.level}
              </Text>
              <View style={styles.revealActions}>
                <AppButton
                  label="View Pal"
                  onPress={onViewPal}
                  variant="secondary"
                />
                <AppButton
                  label="Set Active Pal"
                  onPress={() => onSetActive(hatchling.id)}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getHatcheryMission({
  activeEggCount,
  collectionCount,
  readyEggCount,
}: {
  activeEggCount: number;
  collectionCount: number;
  readyEggCount: number;
}): {
  body: string;
  cta: string;
  target: "collection" | "home" | "stay";
  title: string;
} {
  if (readyEggCount > 0) {
    return {
      body: "A ready Egg is waiting below. Hatch it now to add a new Pal to your team.",
      cta: "Hatch below",
      target: "stay",
      title: `${readyEggCount} Egg${readyEggCount === 1 ? "" : "s"} ready`,
    };
  }

  if (activeEggCount > 0) {
    return {
      body: "Sync movement from Home after walking to fill every Egg slot together.",
      cta: "Go sync movement",
      target: "home",
      title: "Fill your incubator",
    };
  }

  if (collectionCount > 0) {
    return {
      body: "Your incubator is empty. Check your Collection and pick who trains while you earn the next Egg.",
      cta: "Open Collection",
      target: "collection",
      title: "Train while you hunt Eggs",
    };
  }

  return {
    body: "Start on Home to sync movement and begin filling your starter Egg.",
    cta: "Go to Home",
    target: "home",
    title: "Start your first hatch",
  };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.softBlue,
    borderColor: colors.tide,
    borderRadius: radii.hero,
    borderWidth: 1,
    padding: 18,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  revealBackdrop: {
    alignItems: "center",
    backgroundColor: colors.modalBackdrop,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  revealModal: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    maxWidth: 420,
    overflow: "hidden",
    padding: 22,
    width: "100%",
  },
  revealClose: {
    alignSelf: "flex-end",
    backgroundColor: colors.translucentSurface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  revealCloseText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  revealKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    textAlign: "center",
  },
  revealStageText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  revealArtStage: {
    alignItems: "center",
    height: 230,
    justifyContent: "center",
    marginVertical: 4,
    width: "100%",
  },
  revealGlow: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    height: 210,
    position: "absolute",
    width: 210,
  },
  revealResult: {
    width: "100%",
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
    fontWeight: typography.titleWeight,
    marginBottom: 10,
    marginTop: 22,
  },
  stageRow: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.card,
    flexDirection: "row",
    marginBottom: 8,
    padding: 14,
  },
  dot: {
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 14,
    marginRight: 11,
    width: 14,
  },
  unlockedDot: {
    backgroundColor: colors.rewardGold,
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
    backgroundColor: colors.softPeach,
    borderColor: colors.ember,
    borderWidth: 1,
    borderRadius: radii.card,
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
  trainingCard: {
    alignItems: "center",
    backgroundColor: colors.softLavender,
    borderColor: colors.storm,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  trainingBody: {
    flex: 1,
  },
  trainingName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  trainingMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  activePalMiniStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  activePalChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activePalProgress: {
    gap: 5,
    marginTop: 8,
  },
  activePalProgressText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  trainingButton: {
    minWidth: 110,
  },
  incubatorCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    padding: 18,
  },
  incubatorIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    marginTop: -4,
  },
  missionCard: {
    backgroundColor: colors.softPeach,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginBottom: 14,
    padding: 14,
  },
  missionKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  missionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  missionBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
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
    backgroundColor: colors.softPeach,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
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
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
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
