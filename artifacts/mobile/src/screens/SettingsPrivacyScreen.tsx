import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { getBadges, getUnlockedBadgeCount } from "../domain/badges";
import { toDateKey } from "../domain/date";
import {
  getActiveHatchling,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import { getActivitySummary } from "../domain/history";
import type { CollectedHatchling, HatchUpData } from "../domain/models";
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
  onSaveProfile: (profile: {
    profileHatchlingId: string | null;
    profileTagline: string;
    profileUsername: string;
  }) => Promise<void>;
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
  onSaveProfile,
  onSetAnalyticsEnabled,
  onSetCloudSyncEnabled,
  onSetCrashReportingEnabled,
  onSetLeaderboardSharing,
  onSetTestStage,
}: Props) {
  const today = toDateKey(new Date());
  const badges = getBadges(data, today);
  const activeHatchlingRaw = getActiveHatchling(data);
  const activeHatchling = activeHatchlingRaw
    ? getTimeAdjustedHatchling(activeHatchlingRaw)
    : null;
  const trainingStatus = activeHatchling
    ? getTrainingStatus(activeHatchling)
    : null;
  const unlockedBadgeCount = getUnlockedBadgeCount(data, today);
  const weeklyActivity = useMemo(
    () => getActivitySummary(data.activityHistory, today),
    [data.activityHistory, today],
  );
  const [usernameDraft, setUsernameDraft] = useState("");
  const [taglineDraft, setTaglineDraft] = useState("");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "settings">("profile");
  const profileName =
    data.profileUsername ||
    data.leaderboardAlias ||
    data.monsterName ||
    "HatchUp Tester";
  const profilePetRaw =
    data.collection.find((hatchling) => hatchling.id === selectedPetId) ??
    activeHatchlingRaw ??
    data.collection[0] ??
    null;
  const profilePet = profilePetRaw
    ? getTimeAdjustedHatchling(profilePetRaw)
    : null;

  useEffect(() => {
    setUsernameDraft(
      data.profileUsername || data.leaderboardAlias || data.monsterName || "",
    );
    setTaglineDraft(data.profileTagline);
    setSelectedPetId(
      data.profileHatchlingId ?? data.activeHatchlingId ?? data.collection[0]?.id ?? null,
    );
  }, [
    data.activeHatchlingId,
    data.collection,
    data.leaderboardAlias,
    data.monsterName,
    data.profileHatchlingId,
    data.profileTagline,
    data.profileUsername,
  ]);

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
      <View style={styles.profileTabs}>
        <ProfileTab
          active={activeTab === "profile"}
          label="Profile"
          onPress={() => setActiveTab("profile")}
        />
        <ProfileTab
          active={activeTab === "settings"}
          label="Settings"
          onPress={() => setActiveTab("settings")}
        />
      </View>
      {activeTab === "profile" && (
        <>
      <View style={styles.profileCard}>
        <View style={styles.profileHero}>
          <View style={styles.profileAvatar}>
            {profilePet ? (
              <HatchlingAvatar
                element={profilePet.element}
                rarity={profilePet.rarity}
                size="large"
              />
            ) : (
              <View style={styles.emptyAvatar}>
                <Text style={styles.emptyAvatarText}>PAL</Text>
              </View>
            )}
          </View>
          <View style={styles.profileHeroText}>
            <Text style={styles.profileKicker}>Beta trainer card</Text>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileMeta}>
              {taglineDraft.trim() ||
                "Choose a favorite Pal and make this profile yours."}
            </Text>
          </View>
        </View>
        <View style={styles.profileForm}>
          <Text style={styles.inputLabel}>Username</Text>
          <TextInput
            autoCapitalize="none"
            maxLength={24}
            onChangeText={setUsernameDraft}
            placeholder="Your trainer name"
            placeholderTextColor={colors.muted}
            style={styles.profileInput}
            value={usernameDraft}
          />
          <Text style={styles.inputLabel}>Profile note</Text>
          <TextInput
            maxLength={80}
            multiline
            onChangeText={setTaglineDraft}
            placeholder="A short note for your beta profile"
            placeholderTextColor={colors.muted}
            style={[styles.profileInput, styles.taglineInput]}
            value={taglineDraft}
          />
        </View>
        <View style={styles.petPicker}>
          <Text style={styles.cardTitle}>Profile pet picture</Text>
          {data.collection.length > 0 ? (
            <View style={styles.petOptions}>
              {data.collection.map((hatchling) => (
                <PetOption
                  key={hatchling.id}
                  hatchling={hatchling}
                  selected={hatchling.id === selectedPetId}
                  onPress={() => setSelectedPetId(hatchling.id)}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.privacyText}>
              Hatch a Pal to unlock profile picture choices.
            </Text>
          )}
        </View>
        <View style={styles.profileStatsGrid}>
          <ProfileStat label="Total XP" value={formatCompact(data.totalXp)} />
          <ProfileStat
            label="Collection"
            value={`${data.collection.length}`}
          />
          <ProfileStat label="Eggs hatched" value={`${data.eggsHatched}`} />
          <ProfileStat
            label="Badges"
            value={`${unlockedBadgeCount}/${badges.length}`}
          />
          <ProfileStat
            label="Current streak"
            value={`${data.currentStreak}d`}
          />
          <ProfileStat
            label="Weekly steps"
            value={formatCompact(weeklyActivity.steps)}
          />
        </View>
        {activeHatchling && (
          <View style={styles.activeHatchling}>
            <HatchlingAvatar
              element={activeHatchling.element}
              rarity={activeHatchling.rarity}
              size="small"
            />
            <View style={styles.activeHatchlingText}>
              <Text style={styles.activeLabel}>Active Pal</Text>
              <Text style={styles.activeName}>
                {activeHatchling.name} L{activeHatchling.level}
              </Text>
              <Text style={styles.activeMood}>
                {capitalize(activeHatchling.mood)} | Bond {activeHatchling.bond}
              </Text>
              <Text style={styles.activeMood}>
                {trainingStatus?.cooldownLabel}
              </Text>
            </View>
          </View>
        )}
        <AppButton
          label="Save profile"
          onPress={() =>
            onSaveProfile({
              profileHatchlingId: selectedPetId,
              profileTagline: taglineDraft,
              profileUsername: usernameDraft,
            })
          }
        />
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
        </>
      )}
      {activeTab === "settings" && (
        <>
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
        </>
      )}
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

function formatCompact(value: number) {
  return Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileStat}>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function ProfileTab({
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
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.profileTab, active && styles.profileTabActive]}
    >
      <Text
        style={[styles.profileTabText, active && styles.profileTabTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PetOption({
  hatchling,
  selected,
  onPress,
}: {
  hatchling: CollectedHatchling;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.petOption, selected && styles.petOptionSelected]}
    >
      <HatchlingAvatar
        element={hatchling.element}
        rarity={hatchling.rarity}
        size="small"
      />
      <Text style={styles.petOptionText} numberOfLines={1}>
        {hatchling.name}
      </Text>
      <Text style={styles.petOptionMeta}>
        L{hatchling.level} {hatchling.rarity}
      </Text>
    </Pressable>
  );
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
  profileTabs: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    padding: 6,
  },
  profileTab: {
    alignItems: "center",
    borderRadius: 13,
    flex: 1,
    paddingVertical: 11,
  },
  profileTabActive: {
    backgroundColor: colors.primary,
  },
  profileTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  profileTabTextActive: {
    color: "#FFFFFF",
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
  profileHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    borderColor: "rgba(244, 163, 64, 0.35)",
    borderRadius: 24,
    borderWidth: 1,
    height: 170,
    justifyContent: "center",
    overflow: "hidden",
    width: 142,
  },
  emptyAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 44,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  emptyAvatarText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
  },
  profileHeroText: {
    flex: 1,
  },
  profileKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase",
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
  profileForm: {
    gap: 8,
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  profileInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  taglineInput: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  petPicker: {
    backgroundColor: "rgba(255, 255, 255, 0.54)",
    borderRadius: 18,
    padding: 12,
  },
  petOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  petOption: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    width: "30.5%",
  },
  petOptionSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  petOptionText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4,
    maxWidth: "100%",
  },
  petOptionMeta: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
    textTransform: "capitalize",
  },
  profileStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  profileStat: {
    backgroundColor: colors.surface,
    borderColor: "rgba(37, 49, 46, 0.08)",
    borderRadius: 15,
    borderWidth: 1,
    padding: 10,
    width: "31.5%",
  },
  profileStatValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  profileStatLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 3,
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
