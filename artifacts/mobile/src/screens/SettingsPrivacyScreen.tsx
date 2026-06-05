import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { HatchlingAvatar } from "../components/HatchlingAvatar";
import { Header } from "../components/Header";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { SparkleBurst } from "../components/SparkleBurst";
import { getScreenLoopSubtitle } from "../content/coreLoopCopy";
import {
  buildSupportMailto,
  IS_PUBLIC_BUILD,
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
} from "../config/runtime";
import {
  getBadgeCategoryProgress,
  getBadgeCategorySummary,
  getBadgeCompletionRatio,
  getBadgesByCategory,
  getBadges,
  getNextBadges,
  getUnlockedBadgeCount,
  type Badge,
  type BadgeCategory,
} from "../domain/badges";
import {
  getDexCompletion,
  getDexElementSummary,
  getDexRaritySummary,
  getNextMissingDexEntry,
} from "../domain/creatureDex";
import { toDateKey } from "../domain/date";
import {
  getActiveHatchling,
  getHatchlingPowerScore,
  getTimeAdjustedHatchling,
  getTrainingStatus,
} from "../domain/hatchlings";
import { getActivitySummary } from "../domain/history";
import type { CollectedHatchling, HatchUpData } from "../domain/models";
import type { MonsterStage } from "../domain/progression";
import type { ProgressionProfile } from "../domain/progressionConfig";
import {
  getPublicReadinessItems,
  getPublicReadinessScore,
  type PublicReadinessItem,
} from "../domain/publicReadiness";
import { colors, radii, typography } from "../theme";

const privacyCopy =
  "HatchUp reads your steps, workouts, and active energy only to reward your Pal with XP. We do not sell your health data or use it for ads. Distance is used only for optional journey board rankings when you choose to share.";

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
  const badgeCompletionRatio = getBadgeCompletionRatio(data, today);
  const badgesByCategory = getBadgesByCategory(data, today);
  const badgeCategoryProgress = getBadgeCategoryProgress(data, today);
  const badgeCategorySummary = getBadgeCategorySummary(data, today);
  const dexCompletion = getDexCompletion(data.collection);
  const dexElementSummary = getDexElementSummary(data.collection);
  const dexRaritySummary = getDexRaritySummary(data.collection);
  const nextMissingDexEntry = getNextMissingDexEntry(data.collection);
  const publicReadinessItems = getPublicReadinessItems(data, {
    isPublicBuild: IS_PUBLIC_BUILD,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    supportEmail: SUPPORT_EMAIL,
    termsUrl: TERMS_URL,
  });
  const publicReadinessScore = getPublicReadinessScore(publicReadinessItems);
  const nextBadges = getNextBadges(data, today);
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
  const [showBetaTools, setShowBetaTools] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const profileName =
    data.profileUsername ||
    data.leaderboardAlias ||
    data.monsterName ||
    "HatchUp Trainer";
  const profilePetRaw =
    data.collection.find((hatchling) => hatchling.id === selectedPetId) ??
    activeHatchlingRaw ??
    data.collection[0] ??
    null;
  const profilePet = profilePetRaw
    ? getTimeAdjustedHatchling(profilePetRaw)
    : null;
  const strongestPal = data.collection
    .map((hatchling) => getTimeAdjustedHatchling(hatchling))
    .sort((a, b) => getHatchlingPowerScore(b) - getHatchlingPowerScore(a))[0];
  const profileChecklist = [
    { done: usernameDraft.trim().length > 0, label: "Choose username" },
    { done: Boolean(selectedPetId), label: "Pick profile Pal" },
    { done: data.collection.length > 0, label: "Hatch first Pal" },
    { done: unlockedBadgeCount > 0, label: "Unlock first badge" },
    { done: data.leaderboardShareEnabled, label: "Optional rank sharing" },
  ];
  const profileReadiness =
    profileChecklist.filter((item) => item.done).length / profileChecklist.length;
  const nextProfileStep = profileChecklist.find((item) => !item.done) ?? null;
  const nextProfileAction = nextProfileStep
    ? getProfileStepAction(nextProfileStep.label, {
        onDexPress,
        onLeaderboardPress,
        onMonsterPress,
      })
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

  async function shareLocalDataSummary() {
    await Share.share({
      message: JSON.stringify(
        {
          accountId: data.accountId,
          activityDaysStored: data.activityHistory.length,
          app: "HatchUp Games",
          badgesUnlocked: unlockedBadgeCount,
          cloudSyncStatus: data.cloudSyncStatus,
          collectionCount: data.collection.length,
          currentStreak: data.currentStreak,
          eggsHatched: data.eggsHatched,
          exportedAt: new Date().toISOString(),
          leaderboardId: data.leaderboardId,
          leaderboardSharing: data.leaderboardShareEnabled,
          profileUsername: data.profileUsername,
          schemaVersion: data.schemaVersion,
          totalXp: data.totalXp,
        },
        null,
        2,
      ),
      title: "HatchUp local account summary",
    });
  }

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
        {getScreenLoopSubtitle("profile")} Badges remember your journey, and
        privacy controls stay close by.
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
                level={profilePet.level}
                rarity={profilePet.rarity}
                size="large"
              />
            ) : (
              <View style={styles.emptyAvatar}>
                <Text style={styles.emptyAvatarText}>Egg</Text>
              </View>
            )}
          </View>
          <View style={styles.profileHeroText}>
            <Text style={styles.profileKicker}>Garden trainer card</Text>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileMeta}>
              {taglineDraft.trim() ||
                "Choose a favorite Pal from your collection and make this profile yours."}
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
            placeholder="A short note for your trainer profile"
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
            <View style={styles.emptyMissionCard}>
              <View style={styles.emptyMissionText}>
                <Text style={styles.emptyMissionTitle}>No profile pet yet</Text>
                <Text style={styles.privacyText}>
                  Hatch your first Pal to unlock trainer card picture choices.
                </Text>
              </View>
              <AppButton
                label="Open Hatchery"
                onPress={onMonsterPress}
                style={styles.emptyMissionButton}
                variant="secondary"
              />
            </View>
          )}
        </View>
        <View style={styles.profileStatsGrid}>
          <ProfileStat label="Journey XP" value={formatCompact(data.totalXp)} />
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
        <View style={styles.profileReadinessCard}>
          <View style={styles.profileReadinessHeader}>
            <Text style={styles.profileReadinessTitle}>Trainer card growth</Text>
            <Text style={styles.profileReadinessValue}>
              {Math.round(profileReadiness * 100)}%
            </Text>
          </View>
          <ProgressBar progress={profileReadiness} />
          <View style={styles.profileNextStepCard}>
            <Text style={styles.profileNextStepKicker}>
              {nextProfileStep ? "Next profile step" : "Profile ready"}
            </Text>
            <Text style={styles.profileNextStepTitle}>
              {nextProfileStep?.label ?? "Trainer card is complete"}
            </Text>
            <Text style={styles.profileNextStepBody}>
              {nextProfileStep
                ? getProfileStepCopy(nextProfileStep.label)
                : "Your public-facing trainer card has the basics covered. Keep hatching, earning badges, and updating your showcase."}
            </Text>
            {nextProfileAction?.onPress ? (
              <AppButton
                label={nextProfileAction.label}
                onPress={nextProfileAction.onPress}
                variant="secondary"
              />
            ) : null}
          </View>
          <View style={styles.profileChecklist}>
            {profileChecklist.map((item) => (
              <View
                key={item.label}
                style={[
                  styles.profileChecklistItem,
                  item.done && styles.profileChecklistItemDone,
                ]}
              >
                <Text
                  style={[
                    styles.profileChecklistMark,
                    item.done && styles.profileChecklistMarkDone,
                  ]}
                >
                  {item.done ? "OK" : "Next"}
                </Text>
                <Text style={styles.profileChecklistText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <CollapsibleSection
          badge={`${Math.round(dexCompletion.percent * 100)}%`}
          subtitle="Your species progress, strongest Pal, and next target."
          title="Collection showcase"
        >
          <View style={styles.profileShowcaseCard}>
            <View style={styles.profileShowcaseHeader}>
              <View>
                <Text style={styles.profileShowcaseKicker}>Collection showcase</Text>
                <Text style={styles.profileShowcaseTitle}>
                  {dexCompletion.unlocked}/{dexCompletion.total} species found
                </Text>
              </View>
              <Text style={styles.profileShowcasePill}>
                {Math.round(dexCompletion.percent * 100)}%
              </Text>
            </View>
            <ProgressBar progress={dexCompletion.percent} />
            <View style={styles.showcaseRows}>
              <ShowcaseLine
                label="Element focus"
                value={getBestSummaryLabel(dexElementSummary)}
              />
              <ShowcaseLine
                label="Rarity focus"
                value={getBestSummaryLabel(dexRaritySummary)}
              />
              <ShowcaseLine
                label="Strongest Pal"
                value={
                  strongestPal
                    ? `${strongestPal.name} | P${getHatchlingPowerScore(strongestPal)}`
                    : "Hatch a Pal"
                }
              />
              <ShowcaseLine
                label="Next target"
                value={
                  nextMissingDexEntry
                    ? `${capitalize(nextMissingDexEntry.rarity)} ${capitalize(nextMissingDexEntry.element)}`
                    : "Collection complete"
                }
              />
            </View>
            <AppButton
              label="Open Collection"
              onPress={onDexPress}
              variant="secondary"
            />
          </View>
        </CollapsibleSection>
        {activeHatchling && (
          <View style={styles.activeHatchling}>
            <HatchlingAvatar
              element={activeHatchling.element}
              level={activeHatchling.level}
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
        {!activeHatchling && (
          <View style={styles.emptyMissionCard}>
            <View style={styles.emptyMissionText}>
              <Text style={styles.emptyMissionTitle}>No active Pal selected</Text>
              <Text style={styles.privacyText}>
                Hatch or select a Pal so your trainer card has a companion.
              </Text>
            </View>
            <AppButton
              label="Find Pal"
              onPress={onMonsterPress}
              style={styles.emptyMissionButton}
              variant="secondary"
            />
          </View>
        )}
        <AppButton
          label="Save profile"
          onPress={async () => {
            await onSaveProfile({
              profileHatchlingId: selectedPetId,
              profileTagline: taglineDraft,
              profileUsername: usernameDraft,
            });
            setProfileSaveMessage("Profile saved. Your trainer card is up to date.");
          }}
        />
        {profileSaveMessage && (
          <Text style={styles.profileSaveMessage}>{profileSaveMessage}</Text>
        )}
      </View>
      <CollapsibleSection
        badge={`${unlockedBadgeCount}/${badges.length}`}
        subtitle="Badge paths for collection, movement, bonds, rarity, streaks, and XP."
        title="Badges"
      >
        <View style={styles.badgeCard}>
          <Text style={styles.cardTitle}>Milestones and badges</Text>
          <Text style={styles.privacyText}>
            Badge progress is local on this device and can become shareable once
            accounts are online.
          </Text>
          <View style={styles.badgeProgressPanel}>
            <View style={styles.badgeProgressHeader}>
              <Text style={styles.badgeProgressTitle}>Trainer milestone path</Text>
              <Text style={styles.badgeProgressValue}>
                {unlockedBadgeCount}/{badges.length}
              </Text>
            </View>
            <ProgressBar progress={badgeCompletionRatio} />
            <Text style={styles.badgeProgressMeta}>
              {Math.round(badgeCompletionRatio * 100)}% complete across collection,
              movement, bonds, rarity, streaks, and XP.
            </Text>
          </View>
          <View style={styles.badgeCategoryRow}>
            {Object.entries(badgeCategorySummary).map(([category, summary]) => (
              <View key={category} style={styles.badgeCategoryPill}>
                <Text style={styles.badgeCategoryLabel}>
                  {capitalize(category)}
                </Text>
                <Text style={styles.badgeCategoryValue}>
                  {summary.unlocked}/{summary.total}
                </Text>
              </View>
            ))}
          </View>
          {nextBadges.length > 0 && (
            <View style={styles.nextBadgePanel}>
              <Text style={styles.nextBadgeTitle}>Closest unlocks</Text>
              {nextBadges.map((badge) => (
                <View key={badge.id} style={styles.nextBadgeRow}>
                  <View style={styles.nextBadgeText}>
                    <Text style={styles.nextBadgeName}>{badge.label}</Text>
                    <Text style={styles.nextBadgeMeta}>
                      {Math.min(badge.value, badge.target).toLocaleString()} /{" "}
                      {badge.target.toLocaleString()} | {capitalize(badge.category)}
                    </Text>
                    <ProgressBar progress={badge.progress} />
                  </View>
                  <Text style={styles.nextBadgePercent}>
                    {Math.round(badge.progress * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.badgeShelves}>
            {Object.entries(badgesByCategory).map(([category, categoryBadges]) => (
              <MilestoneShelf
                badges={categoryBadges}
                category={category as BadgeCategory}
                key={category}
                progress={badgeCategoryProgress[category as BadgeCategory] ?? 0}
                summary={badgeCategorySummary[category as BadgeCategory]}
              />
            ))}
          </View>
        </View>
      </CollapsibleSection>
        </>
      )}
      {activeTab === "settings" && (
        <>
      <CollapsibleSection
        badge={`${Math.round(publicReadinessScore * 100)}%`}
        subtitle="Support, privacy, local data controls, and launch readiness."
        title="Trust & Data"
      >
      <View style={styles.launchCard}>
        <Text style={styles.launchKicker}>
          {IS_PUBLIC_BUILD ? "PUBLIC BUILD" : "LAUNCH READINESS"}
        </Text>
        <Text style={styles.cardTitle}>Support, privacy, and trust</Text>
        <Text style={styles.privacyText}>
          HatchUp is local-first until cloud services are configured. Health
          access is read-only, rankings are opt-in, and support is available at{" "}
          {SUPPORT_EMAIL}.
        </Text>
        <View style={styles.privacyActions}>
          <AppButton
            label="Contact support"
            onPress={() => {
              void Linking.openURL(
                buildSupportMailto({
                  subject: "HatchUp Support",
                }),
              );
            }}
            variant="secondary"
          />
          <AppButton
            disabled={!PRIVACY_POLICY_URL}
            label={PRIVACY_POLICY_URL ? "Privacy policy" : "Privacy policy URL needed"}
            onPress={() => {
              if (PRIVACY_POLICY_URL) void Linking.openURL(PRIVACY_POLICY_URL);
            }}
            style={!PRIVACY_POLICY_URL ? styles.disabledControl : undefined}
            variant="secondary"
          />
          <AppButton
            disabled={!TERMS_URL}
            label={TERMS_URL ? "Terms" : "Terms URL needed"}
            onPress={() => {
              if (TERMS_URL) void Linking.openURL(TERMS_URL);
            }}
            style={!TERMS_URL ? styles.disabledControl : undefined}
            variant="secondary"
          />
        </View>
      </View>
      <View style={styles.readinessCard}>
        <View style={styles.readinessHeader}>
          <View>
            <Text style={styles.readinessKicker}>PUBLIC READINESS</Text>
            <Text style={styles.cardTitle}>Launch checklist</Text>
          </View>
          <Text style={styles.readinessScore}>
            {Math.round(publicReadinessScore * 100)}%
          </Text>
        </View>
        <ProgressBar progress={publicReadinessScore} />
        <View style={styles.readinessList}>
          {publicReadinessItems.map((item) => (
            <ReadinessRow item={item} key={item.id} />
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
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Privacy promise</Text>
        <Text style={styles.privacyText}>{privacyCopy}</Text>
        <Text style={styles.trustBullet}>Read-only health access.</Text>
        <Text style={styles.trustBullet}>No ads, no health-data sale.</Text>
        <Text style={styles.trustBullet}>Leaderboard sharing is opt-in.</Text>
      </View>
      <View style={styles.feedbackCard}>
        <Text style={styles.cardTitle}>Support and feedback</Text>
        <Text style={styles.privacyText}>
          Found a confusing flow, rough UI moment, or reward bug? Send a quick
          support note so we can tune the next build.
        </Text>
        <AppButton
          label="Send feedback"
          onPress={() => {
            void Linking.openURL(
              buildSupportMailto({
                subject: "HatchUp Feedback",
              }),
            );
          }}
          variant="secondary"
        />
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
        <View style={styles.privacyActions}>
          <AppButton
            label="Share local summary"
            onPress={() => {
              void shareLocalDataSummary();
            }}
            variant="secondary"
          />
          <AppButton
            label="Request data export"
            onPress={() => {
              void Linking.openURL(
                buildSupportMailto({
                  body: `Leaderboard ID: ${data.leaderboardId}\nAccount ID: ${data.accountId}`,
                  subject: "HatchUp Data Export Request",
                }),
              );
            }}
            variant="secondary"
          />
          <AppButton
            label="Request data deletion"
            onPress={() => {
              void Linking.openURL(
                buildSupportMailto({
                  body: `Leaderboard ID: ${data.leaderboardId}\nAccount ID: ${data.accountId}`,
                  subject: "HatchUp Data Deletion Request",
                }),
              );
            }}
            variant="secondary"
          />
        </View>
      </View>
      <View style={styles.readOnlyCard}>
        <Text style={styles.cardTitle}>Leaderboard privacy</Text>
        <Text style={styles.privacyText}>
          Rankings are optional. Turning sharing on adds your
          leaderboard name, weekly movement, distance, and XP to the ranking
          experience.
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
          the current launch build.
        </Text>
      </View>
      </CollapsibleSection>
      {testLabEnabled && (
        <CollapsibleSection
          badge={showBetaTools ? "Open" : "Hidden"}
          subtitle="Local-only progression previews for testing builds."
          title="Test tools"
        >
          <Pressable
            onLongPress={() => setShowBetaTools((visible) => !visible)}
            style={styles.betaToolsHandle}
          >
            <Text style={styles.betaToolsHandleTitle}>Test Tools drawer</Text>
            <Text style={styles.betaToolsHandleText}>
              Press and hold to {showBetaTools ? "hide" : "reveal"} local test controls.
            </Text>
          </Pressable>
          {showBetaTools && (
            <View style={styles.testLabCard}>
              <Text style={styles.cardTitle}>Local Test Lab</Text>
              <Text style={styles.privacyText}>
                Preview local progression states without changing Apple Health data.
                These tools are included only in accelerated testing builds.
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
                  label="Ready all Eggs"
                  onPress={onReadyTestEgg}
                  variant="secondary"
                />
              </View>
            </View>
          )}
        </CollapsibleSection>
      )}
      <View style={styles.spacer} />
      <AppButton
        label="Reset app data"
        onPress={() =>
          Alert.alert(
            "Reset HatchUp?",
            "This removes your Pal name, XP, streaks, Pals, and saved sync history on this device.",
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

function getProfileStepCopy(label: string) {
  if (label === "Choose username") {
    return "Add a username above so your trainer card feels owned before sharing or testing with friends.";
  }
  if (label === "Pick profile Pal") {
    return "Choose a favorite Pal as your picture so the profile has a creature anchor.";
  }
  if (label === "Hatch first Pal") {
    return "Hatch a starter Pal to unlock profile pictures, bond, stats, and collection identity.";
  }
  if (label === "Unlock first badge") {
    return "Earn one milestone so the profile shows progress beyond raw numbers.";
  }
  return "Opt into ranks only when you want weekly movement to appear on the journey board.";
}

function getProfileStepAction(
  label: string,
  actions: {
    onDexPress: () => void;
    onLeaderboardPress: () => void;
    onMonsterPress: () => void;
  },
) {
  if (label === "Pick profile Pal" || label === "Hatch first Pal") {
    return { label: "Open Hatchery", onPress: actions.onMonsterPress };
  }
  if (label === "Unlock first badge") {
    return { label: "Open Collection", onPress: actions.onDexPress };
  }
  if (label === "Optional rank sharing") {
    return { label: "Open Ranks", onPress: actions.onLeaderboardPress };
  }
  return { label: "Edit above", onPress: null };
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

function ReadinessRow({ item }: { item: PublicReadinessItem }) {
  return (
    <View style={styles.readinessRow}>
      <Text
        style={[
          styles.readinessStatus,
          item.status === "ready" && styles.readinessStatusReady,
          item.status === "action" && styles.readinessStatusAction,
        ]}
      >
        {item.status === "ready"
          ? "Ready"
          : item.status === "action"
            ? "Action"
            : "Optional"}
      </Text>
      <View style={styles.readinessText}>
        <Text style={styles.readinessLabel}>{item.label}</Text>
        <Text style={styles.readinessBody}>{item.body}</Text>
      </View>
    </View>
  );
}

function ShowcaseLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.showcaseLine}>
      <Text style={styles.showcaseLineLabel}>{label}</Text>
      <Text style={styles.showcaseLineValue}>{value}</Text>
    </View>
  );
}

function getBestSummaryLabel<T extends string>(
  summaries: readonly { id: T; percent: number; total: number; unlocked: number }[],
) {
  const best = [...summaries].sort(
    (a, b) => b.percent - a.percent || b.unlocked - a.unlocked,
  )[0];
  if (!best) return "Start collecting";
  return `${capitalize(best.id)} ${best.unlocked}/${best.total}`;
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
        level={hatchling.level}
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

function MilestoneShelf({
  badges,
  category,
  progress,
  summary,
}: {
  badges: Badge[];
  category: BadgeCategory;
  progress: number;
  summary: { total: number; unlocked: number } | undefined;
}) {
  return (
    <View style={styles.milestoneShelf}>
      <View style={styles.milestoneShelfHeader}>
        <View style={styles.milestoneShelfTitleWrap}>
          <Text style={styles.milestoneShelfKicker}>
            {capitalize(category)} milestones
          </Text>
          <Text style={styles.milestoneShelfTitle}>
            {summary?.unlocked ?? 0}/{summary?.total ?? badges.length} unlocked
          </Text>
        </View>
        <Text style={styles.milestoneShelfPercent}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
      <ProgressBar progress={progress} />
      <View style={styles.badgeGrid}>
        {badges.map((badge) => (
          <BadgeTile badge={badge} key={badge.id} />
        ))}
      </View>
    </View>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  return (
    <View style={[styles.badge, badge.unlocked && styles.badgeUnlocked]}>
      <Text style={styles.badgeStatus}>
        {badge.unlocked ? "Unlocked" : "In progress"}
      </Text>
      <Text style={styles.badgeName}>{badge.label}</Text>
      <Text style={styles.badgeText}>{badge.description}</Text>
      <Text style={styles.badgeProgress}>
        {Math.min(badge.value, badge.target).toLocaleString()} /{" "}
        {badge.target.toLocaleString()}
      </Text>
      <ProgressBar progress={badge.progress} />
      {badge.unlocked && (
        <View style={styles.badgeSparkles}>
          <SparkleBurst label="BADGE" tone="accent" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    lineHeight: 35,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: typography.bodyLineHeight,
    marginTop: 10,
  },
  profileTabs: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    padding: 6,
  },
  profileTab: {
    alignItems: "center",
    borderRadius: radii.button,
    flex: 1,
    paddingVertical: 11,
  },
  profileTabActive: {
    backgroundColor: colors.primaryDeep,
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
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 22,
    paddingHorizontal: 16,
  },
  launchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    marginTop: 22,
    padding: 16,
    shadowColor: colors.cardShadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  launchKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  readinessCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 16,
  },
  readinessHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  readinessKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  readinessScore: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  readinessList: {
    gap: 8,
  },
  readinessRow: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  readinessStatus: {
    backgroundColor: colors.warmSurface,
    borderRadius: radii.pill,
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textTransform: "uppercase",
  },
  readinessStatusReady: {
    backgroundColor: colors.primarySoft,
    color: colors.primaryDeep,
  },
  readinessStatusAction: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
  },
  readinessText: {
    flex: 1,
  },
  readinessLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  readinessBody: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  profileCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 14,
    marginTop: 22,
    padding: 16,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  profileHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    height: 170,
    justifyContent: "center",
    overflow: "hidden",
    width: 142,
  },
  emptyAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
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
  profileSaveMessage: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
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
    borderRadius: radii.button,
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
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
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 8,
    width: "30.5%",
  },
  petOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryDeep,
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
    borderColor: colors.line,
    borderRadius: radii.card,
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
  profileReadinessCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  profileReadinessHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  profileReadinessTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  profileReadinessValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  profileNextStepCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 7,
    padding: 12,
  },
  profileNextStepKicker: {
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  profileNextStepTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  profileNextStepBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  profileChecklist: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  profileChecklistItem: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  profileChecklistItemDone: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  profileChecklistMark: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
  },
  profileChecklistMarkDone: {
    color: colors.primaryDeep,
  },
  profileChecklistText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
  },
  profileShowcaseCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  profileShowcaseHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  profileShowcaseKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  profileShowcaseTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  profileShowcasePill: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  showcaseRows: {
    gap: 7,
  },
  showcaseLine: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
  },
  showcaseLineLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  showcaseLineValue: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  activeHatchling: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
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
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  badgeProgressPanel: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    marginTop: 12,
    padding: 12,
  },
  badgeProgressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  badgeProgressTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  badgeProgressValue: {
    backgroundColor: colors.rewardGold,
    borderRadius: radii.pill,
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeProgressMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  badgeShelves: {
    gap: 12,
    marginTop: 12,
  },
  milestoneShelf: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  milestoneShelfHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  milestoneShelfTitleWrap: {
    flex: 1,
  },
  milestoneShelfKicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  milestoneShelfTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3,
  },
  milestoneShelfPercent: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  badgeCategoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  badgeCategoryPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeCategoryLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  badgeCategoryValue: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
  },
  nextBadgePanel: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 12,
  },
  nextBadgeTitle: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  nextBadgeRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  nextBadgeText: {
    flex: 1,
  },
  nextBadgeName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  nextBadgeMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  nextBadgePercent: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  badge: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  badgeUnlocked: {
    borderColor: colors.rewardGold,
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
  badgeSparkles: {
    marginTop: 8,
  },
  emptyMissionCard: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  emptyMissionText: {
    flex: 1,
  },
  emptyMissionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  emptyMissionButton: {
    flexShrink: 0,
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
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  trustBullet: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },
  feedbackCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 16,
  },
  testLabCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  betaToolsHandle: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderStyle: "dashed",
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  betaToolsHandleTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  betaToolsHandleText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  testLabButtons: {
    gap: 8,
    marginTop: 12,
  },
  readOnlyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
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
  disabledControl: {
    opacity: 0.52,
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
