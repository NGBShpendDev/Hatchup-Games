import { Alert, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { getBadges, getUnlockedBadgeCount } from "../domain/badges";
import { toDateKey } from "../domain/date";
import { getActiveHatchling } from "../domain/hatchlings";
import type { HatchUpData } from "../domain/models";
import type { MonsterStage } from "../domain/progression";
import type { ProgressionProfile } from "../domain/progressionConfig";
import { colors } from "../theme";

const privacyCopy =
  "HatchUp reads your steps, workouts, and active energy only to reward your monster with XP. We do not sell your health data or use it for ads. Distance is used only for optional beta rankings when you choose to share.";

interface Props {
  data: HatchUpData;
  cloudSyncLabel: string;
  healthMode: string;
  leaderboardSyncLabel: string;
  progressionProfile: ProgressionProfile;
  testLabEnabled: boolean;
  onBack: () => void;
  onDexPress: () => void;
  onLeaderboardPress: () => void;
  onMonsterPress: () => void;
  onReadyTestEgg: () => Promise<void>;
  onReset: () => Promise<void>;
  onSetAnalyticsEnabled: (enabled: boolean) => Promise<void>;
  onSetCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  onSetCrashReportingEnabled: (enabled: boolean) => Promise<void>;
  onSetLeaderboardSharing: (enabled: boolean) => Promise<void>;
  onSetTestStage: (stage: MonsterStage) => Promise<void>;
}

export function SettingsPrivacyScreen({
  data,
  cloudSyncLabel,
  healthMode,
  leaderboardSyncLabel,
  progressionProfile,
  testLabEnabled,
  onBack,
  onDexPress,
  onLeaderboardPress,
  onMonsterPress,
  onReadyTestEgg,
  onReset,
  onSetAnalyticsEnabled,
  onSetCloudSyncEnabled,
  onSetCrashReportingEnabled,
  onSetLeaderboardSharing,
  onSetTestStage,
}: Props) {
  const today = toDateKey(new Date());
  const badges = getBadges(data, today);
  const activeHatchling = getActiveHatchling(data);
  const unlockedBadgeCount = getUnlockedBadgeCount(data, today);

  return (
    <Screen
      footer={
        <BottomNav
          active="settings"
          onDexPress={onDexPress}
          onHomePress={onBack}
          onLeaderboardPress={onLeaderboardPress}
          onMonsterPress={onMonsterPress}
          onSettingsPress={() => undefined}
        />
      }
    >
      <Header onBack={onBack} title="Profile and privacy" />
      <Text style={styles.title}>Your HatchUp profile.</Text>
      <Text style={styles.body}>
        Track your collection, badges, and privacy controls in one beta profile
        page.
      </Text>
      <View style={styles.profileCard}>
        <View>
          <Text style={styles.profileName}>
            {data.leaderboardAlias || data.monsterName || "HatchUp Tester"}
          </Text>
          <Text style={styles.profileMeta}>
            {data.totalXp} XP | {data.eggsHatched} eggs hatched |{" "}
            {unlockedBadgeCount}/{badges.length} badges
          </Text>
        </View>
        {activeHatchling && (
          <View style={styles.activeHatchling}>
            <HatchlingAvatar
              element={activeHatchling.element}
              rarity={activeHatchling.rarity}
              size="small"
            />
            <View style={styles.activeHatchlingText}>
              <Text style={styles.activeLabel}>Training</Text>
              <Text style={styles.activeName}>
                {activeHatchling.name} L{activeHatchling.level}
              </Text>
              <Text style={styles.activeMood}>
                {capitalize(activeHatchling.mood)} | Bond {activeHatchling.bond}
              </Text>
            </View>
          </View>
        )}
      </View>
      <View style={styles.badgeCard}>
        <Text style={styles.cardTitle}>Milestones and badges</Text>
        <Text style={styles.privacyText}>
          Badge progress is local for this beta and can become shareable once
          accounts are online.
        </Text>
        <View style={styles.badgeGrid}>
          {badges.map((badge) => (
            <View
              key={badge.id}
              style={[styles.badge, badge.unlocked && styles.badgeUnlocked]}
            >
              <Text style={styles.badgeStatus}>
                {badge.unlocked ? "Unlocked" : "In progress"}
              </Text>
              <Text style={styles.badgeName}>{badge.label}</Text>
              <Text style={styles.badgeText}>{badge.description}</Text>
              <Text style={styles.badgeProgress}>
                {Math.min(badge.value, badge.target).toLocaleString()} /{" "}
                {badge.target.toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.card}>
        <Setting label="Health source" value={healthMode} />
        <Setting
          label="Connection"
          value={data.healthConnected ? "Connected" : "Not connected"}
        />
        <Setting
          label="Last sync"
          value={
            data.lastSyncedDate
              ? new Date(data.lastSyncedDate).toLocaleString()
              : "Not synced yet"
          }
        />
        <Setting
          label="Local activity history"
          value={`${data.activityHistory.length} day${data.activityHistory.length === 1 ? "" : "s"} stored`}
        />
        <Setting label="Account mode" value={data.accountMode} />
        <Setting label="Cloud save" value={cloudSyncLabel} />
        <Setting
          label="Leaderboard sharing"
          value={data.leaderboardShareEnabled ? "Opted in" : "Private"}
        />
        <Setting label="Leaderboard sync" value={leaderboardSyncLabel} />
        <Setting
          label="Progression tuning"
          value={progressionProfile.label}
          withBorder={false}
        />
      </View>
      {testLabEnabled && (
        <View style={styles.testLabCard}>
          <Text style={styles.cardTitle}>Beta Test Lab</Text>
          <Text style={styles.privacyText}>
            Preview local progression states without changing Apple Health data.
            These tools are included only in accelerated beta builds.
          </Text>
          <View style={styles.testLabButtons}>
            <AppButton
              label="Preview Egg"
              onPress={() => onSetTestStage("egg")}
              variant="secondary"
            />
            <AppButton
              label="Preview Baby"
              onPress={() => onSetTestStage("baby")}
              variant="secondary"
            />
            <AppButton
              label="Preview Teen"
              onPress={() => onSetTestStage("teen")}
              variant="secondary"
            />
            <AppButton
              label="Preview Final"
              onPress={() => onSetTestStage("final")}
              variant="secondary"
            />
            <AppButton
              label="Ready all eggs"
              onPress={onReadyTestEgg}
              variant="secondary"
            />
          </View>
        </View>
      )}
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Privacy promise</Text>
        <Text style={styles.privacyText}>{privacyCopy}</Text>
      </View>
      <View style={styles.readOnlyCard}>
        <Text style={styles.cardTitle}>Public-ready data controls</Text>
        <Text style={styles.privacyText}>
          Cloud save and analytics are opt-in foundations for launch. They stay
          local unless backend URLs are configured.
        </Text>
        <View style={styles.privacyActions}>
          <AppButton
            label={data.cloudSyncEnabled ? "Disable cloud save" : "Enable cloud save"}
            onPress={() => onSetCloudSyncEnabled(!data.cloudSyncEnabled)}
            variant={data.cloudSyncEnabled ? "secondary" : "primary"}
          />
          <AppButton
            label={data.analyticsEnabled ? "Disable analytics" : "Enable analytics"}
            onPress={() => onSetAnalyticsEnabled(!data.analyticsEnabled)}
            variant="secondary"
          />
          <AppButton
            label={
              data.crashReportingEnabled
                ? "Disable crash reports"
                : "Enable crash reports"
            }
            onPress={() => onSetCrashReportingEnabled(!data.crashReportingEnabled)}
            variant="secondary"
          />
        </View>
      </View>
      <View style={styles.readOnlyCard}>
        <Text style={styles.cardTitle}>Leaderboard privacy</Text>
        <Text style={styles.privacyText}>
          Rankings are optional for this beta. Turning sharing on adds your
          leaderboard name, weekly movement, distance, and XP to the local
          leaderboard experience.
        </Text>
        <View style={styles.leaderboardActions}>
          <AppButton
            label={data.leaderboardShareEnabled ? "Hide from rankings" : "Share ranking"}
            onPress={() => onSetLeaderboardSharing(!data.leaderboardShareEnabled)}
            variant={data.leaderboardShareEnabled ? "secondary" : "primary"}
          />
        </View>
      </View>
      <View style={styles.readOnlyCard}>
        <Text style={styles.cardTitle}>Read-only health access</Text>
        <Text style={styles.privacyText}>
          HatchUp never writes data back to Apple Health or Health Connect in
          this MVP.
        </Text>
      </View>
      <View style={styles.spacer} />
      <AppButton
        label="Reset local app data"
        onPress={() =>
          Alert.alert(
            "Reset HatchUp?",
            "This removes your monster name, XP, streaks, hatchlings, and local sync history.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Reset", style: "destructive", onPress: onReset },
            ],
          )
        }
        variant="danger"
      />
    </Screen>
  );
}

function Setting({
  label,
  value,
  withBorder = true,
}: {
  label: string;
  value: string;
  withBorder?: boolean;
}) {
  return (
    <View style={[styles.setting, withBorder && styles.settingBorder]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 35,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: 22,
    paddingHorizontal: 16,
  },
  profileCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 22,
    gap: 14,
    marginTop: 22,
    padding: 16,
  },
  profileName: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
  },
  profileMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  activeHatchling: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  activeHatchlingText: {
    flex: 1,
  },
  activeLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  activeName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  activeMood: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  badgeCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: 16,
    padding: 16,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: 15,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  badgeUnlocked: {
    borderColor: colors.primary,
  },
  badgeStatus: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  badgeName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5,
  },
  badgeText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    minHeight: 30,
  },
  badgeProgress: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  setting: {
    paddingVertical: 15,
  },
  settingBorder: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  settingLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  settingValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  privacyCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    marginTop: 14,
    padding: 16,
  },
  testLabCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    marginTop: 14,
    padding: 16,
  },
  testLabButtons: {
    gap: 8,
    marginTop: 12,
  },
  readOnlyCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    marginTop: 14,
    padding: 16,
  },
  leaderboardActions: {
    marginTop: 12,
  },
  privacyActions: {
    gap: 8,
    marginTop: 12,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  privacyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
});
