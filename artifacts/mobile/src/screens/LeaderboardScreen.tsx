import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import { PageTitle, SegmentedControl } from "../components/ui";
import { getScreenLoopSubtitle } from "../content/coreLoopCopy";
import {
  getLeaderboardEntries,
  getMetricValue,
  getUserLeaderboardStats,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from "../domain/leaderboard";
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
  const sharedEntries = getLeaderboardEntries(data, today, metric).filter(
    (entry) => !blockedIds.includes(entry.id),
  );
  const entries = data.leaderboardShareEnabled ? sharedEntries : [];
  const userRank = data.leaderboardShareEnabled
    ? sharedEntries.find((entry) => entry.isUser)?.rank ?? null
    : null;
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
      <View style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <View style={styles.privacyText}>
            <Text style={styles.cardTitle}>Ranks privacy</Text>
            <Text style={styles.privacyBody}>
              Ranks are optional. Only your public name and weekly score are shared.
            </Text>
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
              {data.leaderboardShareEnabled ? "Sharing" : "Private"}
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
              {aliasSaved || data.leaderboardAlias ? "Name saved" : "Name ready"}
            </Text>
          )}
          {data.leaderboardShareEnabled ? (
            <AppButton
              label="Go private"
              onPress={handleGoPrivate}
              style={styles.actionButton}
              variant="secondary"
            />
          ) : (
            <AppButton
              label="Share weekly score"
              onPress={() => setConfirmShareOpen(true)}
              style={styles.actionButton}
            />
          )}
        </View>
      </View>
      <View style={styles.scoreCard}>
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
      </View>
      <View style={styles.leaderboardCard}>
        <View style={styles.boardHeader}>
          <View>
            <Text style={styles.cardTitle}>Leaderboard</Text>
            <Text style={styles.boardSubtitle}>
              {data.leaderboardShareEnabled
                ? "Weekly public scores from players who opted in."
                : "Preview Ranks without sharing your score yet."}
            </Text>
          </View>
        </View>
        {data.leaderboardShareEnabled ? (
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
              {entries.map((entry) => (
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
              ))}
            </View>
          </>
        ) : (
          <View style={styles.privatePreviewCard}>
            <Text style={styles.emptyMissionTitle}>You are private right now</Text>
            <Text style={styles.emptyMissionBody}>
              Share only your display name and weekly score when you want to compare.
              Health details stay private.
            </Text>
            <AppButton
              label="Share weekly score"
              onPress={() => setConfirmShareOpen(true)}
              variant="secondary"
            />
          </View>
        )}
      </View>
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
        <Text style={styles.rankName}>
          {entry.displayName}
          {entry.isUser ? " (you)" : ""}
        </Text>
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
          <Text style={styles.modalTitle}>Share your weekly score?</Text>
          <Text style={styles.modalBody}>
            Only your display name and weekly score are shared. Health details stay private.
          </Text>
          <View style={styles.modalActions}>
            <AppButton
              label="Not now"
              onPress={onCancel}
              style={styles.modalButton}
              variant="secondary"
            />
            <AppButton
              label="Share score"
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
    color: "#FFFFFF",
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
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    marginTop: 14,
    padding: 13,
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
    color: "#FFFFFF",
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
    gap: 12,
    marginTop: 14,
    padding: 16,
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
    gap: 10,
    padding: 14,
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
    padding: 13,
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
