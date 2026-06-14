import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import {
  PageTitle,
  PrimaryCard,
  SecondaryCard,
  SegmentedControl,
  UtilityCard,
} from "../components/ui";
import { getScreenLoopSubtitle } from "../content/coreLoopCopy";
import {
  getLeaderboardEntries,
  getMetricValue,
  getUserLeaderboardStats,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from "../domain/leaderboard";
import { WEEKLY_CHALLENGE_REWARDS } from "../domain/leaderboardMockData";
import type { HatchUpData } from "../domain/models";
import { colors, radii, typography } from "../theme";
import { formatDistanceMiles, formatNumber, formatSteps } from "../utils/format";

interface Props {
  data: HatchUpData;
  leaderboardSyncLabel: string;
  today: string;
  onDexPress: () => void;
  onHomePress: () => void;
  onMonsterPress: () => void;
  onSaveAlias: (alias: string) => Promise<void>;
  onSettingsPress: () => void;
  onSetSharing: (enabled: boolean) => Promise<void>;
}

const metricLabels: Record<LeaderboardMetric, string> = {
  distance: "Distance",
  steps: "Steps",
  xp: "Journey XP",
};

const ranksPrivacyCopy =
  "Only your display name, rank, and selected weekly score are public. Health details stay private.";

export function LeaderboardScreen({
  data,
  leaderboardSyncLabel,
  today,
  onDexPress,
  onHomePress,
  onMonsterPress,
  onSaveAlias,
  onSettingsPress,
  onSetSharing,
}: Props) {
  const [metric, setMetric] = useState<LeaderboardMetric>("steps");
  const [alias, setAlias] = useState(
    data.leaderboardAlias || data.monsterName || "HatchUp Trainer",
  );
  const [aliasSaved, setAliasSaved] = useState(false);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [confirmShareOpen, setConfirmShareOpen] = useState(false);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const userStats = getUserLeaderboardStats(data, today);
  const challengeStatus = getWeeklyChallengeStatus(today);
  const sharedEntries = getLeaderboardEntries(data, today, metric).filter(
    (entry) => !blockedIds.includes(entry.id),
  );
  const entries = data.leaderboardShareEnabled ? sharedEntries : [];
  const userRank = data.leaderboardShareEnabled
    ? sharedEntries.find((entry) => entry.isUser)?.rank ?? null
    : null;
  const climbTarget = getStepsToPassNextPlayer({
    entries: sharedEntries,
    sharingEnabled: data.leaderboardShareEnabled,
    userStats,
  });
  const aliasChanged = alias.trim() !== data.leaderboardAlias.trim();

  async function handleSaveAlias() {
    if (aliasChanged) {
      await onSaveAlias(alias);
      setAliasSaved(true);
    }
  }

  async function handleConfirmShare() {
    if (aliasChanged) {
      await onSaveAlias(alias);
      setAliasSaved(true);
    }
    await onSetSharing(true);
    setConfirmShareOpen(false);
  }

  async function handleGoPrivate() {
    await onSetSharing(false);
  }

  return (
    <Screen
      footer={
        <BottomNav
          active="leaderboard"
          onDexPress={onDexPress}
          onHomePress={onHomePress}
          onLeaderboardPress={() => undefined}
          onMonsterPress={onMonsterPress}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <PageTitle
        eyebrow="Weekly challenge board"
        subtitle={getScreenLoopSubtitle("ranks")}
        title="Move, hatch, climb."
      />
      <Text style={styles.syncLabel}>{leaderboardSyncLabel}</Text>
      <PrimaryCard style={styles.challengeCard}>
        <View style={styles.challengeHeader}>
          <View style={styles.challengeTitleBlock}>
            <Text style={styles.challengeKicker}>Weekly Challenge</Text>
            <Text style={styles.challengeTitle}>{challengeStatus.name}</Text>
            <Text style={styles.challengeBody}>
              Score with {metricLabels[metric]}. Sync movement, train your Pal,
              and return daily to climb.
            </Text>
          </View>
          <View style={styles.challengeTimePill}>
            <Text style={styles.challengeTimeText}>
              {challengeStatus.timeRemainingLabel}
            </Text>
          </View>
        </View>
        <View style={styles.challengeStats}>
          <ChallengeStat
            label="Your rank"
            value={
              data.leaderboardShareEnabled
                ? userRank
                  ? `#${userRank}`
                  : "-"
                : "Private"
            }
          />
          <ChallengeStat label="Score type" value={metricLabels[metric]} />
          <ChallengeStat
            label="Weekly score"
            value={formatUserScore(userStats, metric)}
          />
          <ChallengeStat
            label="Weekly steps"
            value={formatSteps(userStats.steps)}
          />
        </View>
      </PrimaryCard>
      <PrimaryCard style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <View style={styles.privacyText}>
            <Text style={styles.cardTitle}>Ranks are opt-in</Text>
            <Text style={styles.privacyBody}>{ranksPrivacyCopy}</Text>
          </View>
          <View
            style={[
              styles.statePill,
              data.leaderboardShareEnabled && styles.statePillSharing,
            ]}
          >
            <Text
              style={[
                styles.statePillText,
                data.leaderboardShareEnabled && styles.statePillTextSharing,
              ]}
            >
              {data.leaderboardShareEnabled ? "Joined" : "Private"}
            </Text>
          </View>
        </View>
        <TextInput
          autoCapitalize="words"
          maxLength={24}
          onChangeText={(value) => {
            setAlias(value);
            setAliasSaved(false);
          }}
          onSubmitEditing={handleSaveAlias}
          placeholder="Public Ranks name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={alias}
        />
        <View style={styles.shareActions}>
          {aliasChanged ? (
            <AppButton
              label="Save name"
              onPress={handleSaveAlias}
              style={styles.actionButton}
              variant="secondary"
            />
          ) : (
            <Text style={styles.savedStatusText}>
              {aliasSaved || data.leaderboardAlias
                ? "Public name saved"
                : "Public name ready"}
            </Text>
          )}
          {data.leaderboardShareEnabled ? (
            <AppButton
              label="Stay private"
              onPress={handleGoPrivate}
              style={styles.actionButton}
              variant="secondary"
            />
          ) : (
            <AppButton
              label="Join weekly ranks"
              onPress={() => setConfirmShareOpen(true)}
              style={styles.actionButton}
            />
          )}
        </View>
      </PrimaryCard>
      <SecondaryCard style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.cardTitle}>Your weekly score</Text>
          <Text style={styles.rankLabel}>
            {data.leaderboardShareEnabled
              ? `Rank #${userRank ?? "-"}`
              : "Private"}
          </Text>
        </View>
        <View style={styles.statsGrid}>
          <Stat label="Steps" value={formatNumber(userStats.steps)} />
          <Stat label="Distance" value={formatDistanceMiles(userStats.distanceMiles)} />
          <Stat label="Journey XP" value={formatNumber(userStats.totalXp)} />
        </View>
      </SecondaryCard>
      <SecondaryCard style={styles.climbCard}>
        <View style={styles.climbHeader}>
          <View style={styles.climbIcon}>
            <Text style={styles.climbIconText}>↑</Text>
          </View>
          <View style={styles.climbText}>
            <Text style={styles.cardTitle}>How to climb</Text>
            <Text style={styles.climbBody}>{climbTarget.message}</Text>
          </View>
        </View>
      </SecondaryCard>
      <SecondaryCard style={styles.rewardsCard}>
        <Text style={styles.cardTitle}>Weekly rewards</Text>
        <View style={styles.rewardRows}>
          {WEEKLY_CHALLENGE_REWARDS.map((reward) => (
            <RewardRow
              key={reward.label}
              label={reward.label}
              value={reward.value}
            />
          ))}
        </View>
        <Text style={styles.rewardFootnote}>
          Rewards are preview tuning for this weekly challenge.
        </Text>
      </SecondaryCard>
      <SecondaryCard style={styles.leaderboardCard}>
        <View style={styles.boardHeader}>
          <View>
            <Text style={styles.cardTitle}>Leaderboard</Text>
            <Text style={styles.boardSubtitle}>
              {data.leaderboardShareEnabled
                ? "Only opted-in weekly scores appear here."
                : "Join weekly ranks when you want to compare. Staying private is always okay."}
            </Text>
          </View>
        </View>
        {challengeStatus.hasEnded ? (
          <UtilityCard style={styles.privatePreviewCard}>
            <Text style={styles.emptyMissionTitle}>Challenge ended</Text>
            <Text style={styles.emptyMissionBody}>
              This weekly board has closed. Come back when the next weekly
              challenge starts.
            </Text>
          </UtilityCard>
        ) : data.leaderboardShareEnabled ? (
          <>
            <SegmentedControl
              onChange={setMetric}
              options={(Object.keys(metricLabels) as LeaderboardMetric[]).map((item) => ({
                label: metricLabels[item],
                value: item,
              }))}
              value={metric}
            />
            <View style={styles.board}>
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <RankRow
                    entry={entry}
                    key={entry.id}
                    metric={metric}
                    onBlock={() => {
                      if (!entry.isUser) {
                        setBlockedIds((ids) => [...new Set([...ids, entry.id])]);
                      }
                    }}
                    onReport={() => setReportedId(entry.id)}
                  />
                ))
              ) : (
                <UtilityCard style={styles.privatePreviewCard}>
                  <Text style={styles.emptyMissionTitle}>No weekly scores yet</Text>
                  <Text style={styles.emptyMissionBody}>
                    Sync movement or check back after players join this weekly
                    challenge.
                  </Text>
                </UtilityCard>
              )}
            </View>
          </>
        ) : (
          <UtilityCard style={styles.privatePreviewCard}>
            <Text style={styles.emptyMissionTitle}>Private by default</Text>
            <Text style={styles.emptyMissionBody}>{ranksPrivacyCopy}</Text>
            <AppButton
              label="Join weekly ranks"
              onPress={() => setConfirmShareOpen(true)}
              variant="secondary"
            />
          </UtilityCard>
        )}
      </SecondaryCard>
      {reportedId && (
        <View style={styles.safetyNotice}>
          <Text style={styles.safetyTitle}>Report received</Text>
          <Text style={styles.safetyText}>
            Thanks. We will use this signal to keep the weekly board friendly.
            You can also block this row from your device.
          </Text>
          <AppButton
            label="Dismiss"
            onPress={() => setReportedId(null)}
            variant="secondary"
          />
        </View>
      )}
      <ShareScoreModal
        onCancel={() => setConfirmShareOpen(false)}
        onConfirm={handleConfirmShare}
        visible={confirmShareOpen}
      />
    </Screen>
  );
}

function RankRow({
  entry,
  metric,
  onBlock,
  onReport,
}: {
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
  onBlock: () => void;
  onReport: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={[styles.rankRow, entry.isUser && styles.userRow]}>
      <Text style={styles.rank}>#{entry.rank}</Text>
      <View style={styles.rankBody}>
        <View style={styles.rankNameRow}>
          <Text style={styles.rankName}>{entry.displayName}</Text>
          {entry.isUser && <Text style={styles.youBadge}>You</Text>}
        </View>
        <Text style={styles.rankMeta}>
          {entry.monsterStage} | {formatSteps(entry.steps)} |{" "}
          {formatDistanceMiles(entry.distanceMiles)}
        </Text>
      </View>
      <Text style={styles.rankScore}>{formatMetric(entry, metric)}</Text>
      {entry.isUser && <SparkleBurst />}
      {!entry.isUser && (
        <View style={styles.safetyMenuWrap}>
          <Pressable
            accessibilityLabel={`Open safety menu for ${entry.displayName}`}
            accessibilityRole="button"
            onPress={() => setMenuOpen((open) => !open)}
            style={styles.safetyMenuButton}
          >
            <Text style={styles.safetyMenuButtonText}>More</Text>
          </Pressable>
          {menuOpen && (
            <View style={styles.safetyMenu}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenuOpen(false);
                  onReport();
                }}
                style={styles.safetyMenuItem}
              >
                <Text style={styles.safetyMenuItemText}>Report</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenuOpen(false);
                  onBlock();
                }}
                style={styles.safetyMenuItem}
              >
                <Text style={styles.safetyMenuItemText}>Block</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ShareScoreModal({
  onCancel,
  onConfirm,
  visible,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.shareModal}>
          <Text style={styles.modalKicker}>Ranks sharing</Text>
          <Text style={styles.modalTitle}>Join weekly ranks?</Text>
          <Text style={styles.modalBody}>{ranksPrivacyCopy}</Text>
          <View style={styles.modalActions}>
            <AppButton
              label="Stay private"
              onPress={onCancel}
              style={styles.modalButton}
              variant="secondary"
            />
            <AppButton
              label="Join weekly ranks"
              onPress={() => {
                void onConfirm();
              }}
              style={styles.modalButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChallengeStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.challengeStat}>
      <Text style={styles.challengeStatValue}>{value}</Text>
      <Text style={styles.challengeStatLabel}>{label}</Text>
    </View>
  );
}

function RewardRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rewardRow}>
      <Text style={styles.rewardLabel}>{label}</Text>
      <Text style={styles.rewardValue}>{value}</Text>
    </View>
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

function formatMetric(entry: LeaderboardEntry, metric: LeaderboardMetric) {
  const value = getMetricValue(entry, metric);
  if (metric === "distance") return formatDistanceMiles(value);
  if (metric === "xp") return `${formatNumber(value)} XP`;
  return formatNumber(value);
}

function formatUserScore(
  stats: ReturnType<typeof getUserLeaderboardStats>,
  metric: LeaderboardMetric,
) {
  if (metric === "distance") return formatDistanceMiles(stats.distanceMiles);
  if (metric === "xp") return `${formatNumber(stats.totalXp)} XP`;
  return formatSteps(stats.steps);
}

function getStepsToPassNextPlayer({
  entries,
  sharingEnabled,
  userStats,
}: {
  entries: readonly LeaderboardEntry[];
  sharingEnabled: boolean;
  userStats: ReturnType<typeof getUserLeaderboardStats>;
}) {
  if (!sharingEnabled) {
    return {
      message:
        "Share your weekly score to see exactly who you can pass next. Your health details stay private.",
    };
  }

  const userEntry = entries.find((entry) => entry.isUser);
  if (!userEntry) {
    return {
      message: "Sync movement to place yourself on this week’s challenge board.",
    };
  }

  if (userEntry.rank <= 1) {
    return {
      message:
        "You are holding the top visible spot. Keep syncing this week to defend it.",
    };
  }

  const nextPlayer = entries.find((entry) => entry.rank === userEntry.rank - 1);
  if (!nextPlayer) {
    return {
      message:
        "Keep syncing movement to find your next climb target on the weekly board.",
    };
  }

  const stepsNeeded = Math.max(nextPlayer.steps - userStats.steps + 1, 0);
  if (stepsNeeded === 0) {
    return {
      message: `You already lead ${nextPlayer.displayName} on steps. Switch score types or keep earning Journey XP to climb.`,
    };
  }

  return {
    message: `You need ${formatSteps(stepsNeeded)} to pass ${nextPlayer.displayName}.`,
  };
}

function getWeeklyChallengeStatus(today: string) {
  const parsedDate = new Date(`${today}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      hasEnded: true,
      name: "7-Day Movement Cup",
      timeRemainingLabel: "Challenge ended",
    };
  }

  const day = parsedDate.getDay();
  const daysUntilSunday = (7 - day) % 7;
  const timeRemainingLabel =
    daysUntilSunday === 0
      ? "Ends tonight"
      : `${daysUntilSunday} day${daysUntilSunday === 1 ? "" : "s"} left`;

  return {
    hasEnded: false,
    name: "7-Day Movement Cup",
    timeRemainingLabel,
  };
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
  syncLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },
  challengeCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 14,
    marginTop: 16,
    padding: 16,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  challengeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  challengeTitleBlock: {
    flex: 1,
  },
  challengeKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  challengeTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 3,
  },
  challengeBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  challengeTimePill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  challengeTimeText: {
    color: colors.primaryText,
    fontSize: 11,
    fontWeight: "900",
  },
  challengeStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  challengeStat: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 10,
  },
  challengeStatValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  challengeStatLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "uppercase",
  },
  privacyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 12,
    marginTop: 16,
    padding: 16,
  },
  privacyHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  privacyText: {
    flex: 1,
  },
  privacyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  statePill: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statePillSharing: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  statePillText: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
  },
  statePillTextSharing: {
    color: colors.primaryText,
  },
  savedStatusText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 48,
  },
  scoreCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 12,
    marginTop: 14,
    padding: 16,
  },
  scoreHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rankLabel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  statValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  climbCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  climbHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  climbIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  climbIconText: {
    color: colors.primaryDeep,
    fontSize: 22,
    fontWeight: "900",
  },
  climbText: {
    flex: 1,
  },
  climbBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  rewardsCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 12,
  },
  rewardRows: {
    gap: 8,
  },
  rewardRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    padding: 9,
  },
  rewardLabel: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  rewardValue: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "right",
  },
  rewardFootnote: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  shareCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  emptyMissionCard: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  emptyMissionText: {
    flex: 1,
  },
  emptyMissionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyMissionBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  emptyMissionButton: {
    flexShrink: 0,
  },
  shareHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  shareStatus: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  sharePill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sharePillOn: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  sharePillText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  sharePillTextOn: {
    color: colors.primaryText,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    marginTop: 12,
    minHeight: 48,
    padding: 12,
  },
  shareActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
  },
  savedNamePill: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    justifyContent: "center",
  },
  savedNameText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  metricTabs: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  metricTab: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  metricTabActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  metricTabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  metricTabTextActive: {
    color: colors.primaryText,
  },
  board: {
    gap: 8,
    marginTop: 14,
  },
  leaderboardCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 13,
  },
  boardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  boardSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  privatePreviewCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  safetyNotice: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    marginTop: 14,
    padding: 14,
  },
  safetyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  safetyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  rankRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 11,
  },
  userRow: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
  },
  rank: {
    color: colors.rewardGold,
    fontSize: 15,
    fontWeight: "900",
    width: 34,
  },
  rankBody: {
    flex: 1,
  },
  rankName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  rankNameRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  youBadge: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    color: colors.primaryText,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textTransform: "uppercase",
  },
  rankMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  rankScore: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  safetyMenuWrap: {
    position: "relative",
  },
  safetyMenuButton: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 50,
  },
  safetyMenuButtonText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  safetyMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    position: "absolute",
    right: 0,
    top: 34,
    width: 92,
    zIndex: 2,
  },
  safetyMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  safetyMenuItemText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: colors.modalBackdrop,
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  shareModal: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    maxWidth: 440,
    padding: 18,
    width: "100%",
  },
  modalKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
  },
  modalBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  modalButton: {
    flex: 1,
  },
});
