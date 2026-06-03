import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import {
  getLeaderboardEntries,
  getMetricValue,
  getUserLeaderboardStats,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from "../domain/leaderboard";
import type { HatchUpData } from "../domain/models";
import { colors } from "../theme";

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
    data.leaderboardAlias || data.monsterName || "HatchUp Tester",
  );
  const userStats = getUserLeaderboardStats(data, today);
  const entries = getLeaderboardEntries(data, today, metric);
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
      <Text style={styles.kicker}>BETA RANKINGS</Text>
      <Text style={styles.title}>Move, hatch, climb.</Text>
      <Text style={styles.body}>
        Compare weekly movement and Pal journey growth. Sharing is optional and local
        for this beta until backend accounts are added.
      </Text>
      <Text style={styles.syncLabel}>{leaderboardSyncLabel}</Text>
      <View style={styles.statsGrid}>
        <Stat label="7-day steps" value={userStats.steps.toLocaleString()} />
        <Stat label="Distance" value={`${userStats.distanceMiles.toFixed(1)} mi`} />
        <Stat label="Journey XP" value={String(userStats.totalXp)} />
      </View>
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
            label={data.leaderboardShareEnabled ? "Hide me" : "Save & share"}
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
              Pick a leaderboard name and opt in when you want your weekly
              movement to count here.
            </Text>
          </View>
          <AppButton
            label="Save & share"
            onPress={handleShareToggle}
            style={styles.emptyMissionButton}
            variant="secondary"
          />
        </View>
      )}
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
          <RankRow entry={entry} key={entry.id} metric={metric} />
        ))}
      </View>
    </Screen>
  );
}

function RankRow({
  entry,
  metric,
}: {
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
}) {
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
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 35,
    marginTop: 5,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
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
    borderRadius: 15,
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
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    marginTop: 16,
    padding: 16,
  },
  emptyMissionCard: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
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
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sharePillOn: {
    backgroundColor: colors.primary,
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
    borderRadius: 14,
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
    borderRadius: 999,
    flex: 1,
    paddingVertical: 10,
  },
  metricTabActive: {
    backgroundColor: colors.primary,
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
  rankRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  userRow: {
    backgroundColor: colors.primarySoft,
  },
  rank: {
    color: colors.primary,
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
});
