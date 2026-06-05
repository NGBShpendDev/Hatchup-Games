import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
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
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const userStats = getUserLeaderboardStats(data, today);
  const entries = getLeaderboardEntries(data, today, metric).filter(
    (entry) => !blockedIds.includes(entry.id),
  );
  const userRank = entries.find((entry) => entry.isUser)?.rank ?? null;
  const aliasChanged = alias.trim() !== data.leaderboardAlias.trim();

  async function handleShareToggle() {
    if (aliasChanged) {
      await onSaveAlias(alias);
    }
    await onSetSharing(!data.leaderboardShareEnabled);
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
      <Text style={styles.kicker}>WEEKLY CHALLENGE BOARD</Text>
      <Text style={styles.title}>Move, hatch, climb.</Text>
      <Text style={styles.body}>
        {getScreenLoopSubtitle("ranks")} Share only your public ranking name
        and score.
      </Text>
      <Text style={styles.syncLabel}>{leaderboardSyncLabel}</Text>
      <View style={styles.statsGrid}>
        <Stat label="7-day steps" value={userStats.steps.toLocaleString()} />
        <Stat label="Distance" value={`${userStats.distanceMiles.toFixed(1)} mi`} />
        <Stat label="Journey XP" value={String(userStats.totalXp)} />
      </View>
      <CollapsibleSection
        badge={data.leaderboardShareEnabled ? "ON" : "OFF"}
        defaultOpen={!data.leaderboardShareEnabled}
        subtitle="Ranks are optional. Private health details stay off the board."
        title="Sharing and privacy"
      >
        <View style={styles.shareCard}>
          <View style={styles.shareHeader}>
            <View>
              <Text style={styles.cardTitle}>Leaderboard sharing</Text>
              <Text style={styles.shareStatus}>
                {data.leaderboardShareEnabled
                  ? `Ranked as #${userRank ?? "-"}`
                  : "Not ranked yet"}
              </Text>
            </View>
            <View
              style={[
                styles.sharePill,
                data.leaderboardShareEnabled && styles.sharePillOn,
              ]}
            >
              <Text
                style={[
                  styles.sharePillText,
                  data.leaderboardShareEnabled && styles.sharePillTextOn,
                ]}
              >
                {data.leaderboardShareEnabled ? "ON" : "OFF"}
              </Text>
            </View>
          </View>
          <TextInput
            autoCapitalize="words"
            maxLength={24}
            onChangeText={setAlias}
            onSubmitEditing={() => onSaveAlias(alias)}
            placeholder="Leaderboard name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={alias}
          />
          <View style={styles.shareActions}>
            <AppButton
              label={aliasChanged ? "Save name" : "Name saved"}
              onPress={() => onSaveAlias(alias)}
              style={styles.actionButton}
              variant="secondary"
            />
            <AppButton
              label={
                data.leaderboardShareEnabled
                  ? "Stay private"
                  : "Share weekly score"
              }
              onPress={handleShareToggle}
              style={styles.actionButton}
            />
          </View>
        </View>
        {!data.leaderboardShareEnabled && (
          <View style={styles.emptyMissionCard}>
            <View style={styles.emptyMissionText}>
              <Text style={styles.emptyMissionTitle}>You are private right now</Text>
              <Text style={styles.emptyMissionBody}>
                Ranks are optional. Move this week and opt in when you want to
                compare your public journey score.
              </Text>
            </View>
            <AppButton
              label="Share weekly score"
              onPress={handleShareToggle}
              style={styles.emptyMissionButton}
              variant="secondary"
            />
          </View>
        )}
      </CollapsibleSection>
      <View style={styles.metricTabs}>
        {(Object.keys(metricLabels) as LeaderboardMetric[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => setMetric(item)}
            style={[styles.metricTab, metric === item && styles.metricTabActive]}
          >
            <Text
              style={[
                styles.metricTabText,
                metric === item && styles.metricTabTextActive,
              ]}
            >
              {metricLabels[item]}
            </Text>
          </Pressable>
        ))}
      </View>
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
          {entry.monsterStage} | {entry.steps.toLocaleString()} steps |{" "}
          {entry.distanceMiles.toFixed(1)} mi
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
            <Text style={styles.safetyMenuButtonText}>...</Text>
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
  if (metric === "distance") return `${value.toFixed(1)} mi`;
  if (metric === "xp") return `${value} XP`;
  return value.toLocaleString();
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
  statsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
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
    width: 34,
  },
  safetyMenuButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 14,
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
});
