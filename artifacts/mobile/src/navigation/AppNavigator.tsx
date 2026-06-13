import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ActionFeedbackModal } from "../components/ActionFeedbackModal";
import { BottomNavStatusProvider } from "../components/BottomNavStatusContext";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { CreatureDexScreen } from "../screens/CreatureDexScreen";
import { FirstRunOnboardingScreen } from "../screens/FirstRunOnboardingScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LeaderboardScreen } from "../screens/LeaderboardScreen";
import { MonsterDetailScreen } from "../screens/MonsterDetailScreen";
import { SettingsPrivacyScreen } from "../screens/SettingsPrivacyScreen";
import { colors } from "../theme";
import { useHatchUpApp } from "../useHatchUpApp";
import type { MainTabParamList } from "./types";

const MainTabs = createBottomTabNavigator<MainTabParamList>();

type HatchUpAppController = ReturnType<typeof useHatchUpApp>;

export function AppNavigator() {
  const app = useHatchUpApp();

  if (!app.ready) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const onboardingComplete = app.data.onboardingStatus === "complete";

  return (
    <ErrorBoundary onError={app.reportCrash}>
      <StatusBar style="dark" />
      <NavigationContainer>
        {onboardingComplete ? (
          <MainTabsNavigator app={app} />
        ) : (
          <FirstRunOnboardingScreen
            data={app.data}
            error={app.error}
            isSyncing={app.isSyncing}
            latestSyncGains={app.latestSyncGains}
            onComplete={app.completeFirstRunOnboarding}
            onHatchEgg={app.hatchEgg}
            onPickStarterEgg={app.saveOnboardingStarterEgg}
            onSaveIdentity={app.saveOnboardingIdentity}
            onSetActivePal={app.setActiveHatchling}
            onSkip={app.skipFirstRunOnboarding}
            onSyncMovement={app.syncOnboardingMovement}
            onTrainPal={app.trainActiveHatchling}
          />
        )}
        <ActionFeedbackModal
          feedback={app.trainingFeedback}
          onDismiss={app.dismissTrainingFeedback}
        />
      </NavigationContainer>
    </ErrorBoundary>
  );
}

function MainTabsNavigator({ app }: { app: HatchUpAppController }) {
  return (
    <BottomNavStatusProvider data={app.data}>
      <MainTabs.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false, lazy: true }}
        tabBar={() => null}
      >
        <MainTabs.Screen name="Home">
          {({ navigation }) => (
            <HomeScreen
              data={app.data}
              error={app.error}
              isSyncing={app.isSyncing}
              latestSync={app.latestSync}
              latestSyncGains={app.latestSyncGains}
              latestEvolution={app.latestEvolution}
              onBuyShopItem={app.buyShopItem}
              onClaimWeeklyChest={app.claimWeeklyChest}
              onClaimQuestReward={app.claimQuestReward}
              onDexPress={() => navigation.navigate("Collection")}
              onLeaderboardPress={() => navigation.navigate("Ranks")}
              onMonsterPress={() => navigation.navigate("Hatchery")}
              onSettingsPress={() => navigation.navigate("Profile")}
              onSync={async () => {
                await app.syncHealth();
              }}
              onUseInventoryItem={app.useInventoryItem}
            />
          )}
        </MainTabs.Screen>
        <MainTabs.Screen name="Hatchery">
          {({ navigation }) => (
            <MonsterDetailScreen
              data={app.data}
              latestHatchling={app.latestHatchling}
              onBack={() => navigation.navigate("Home")}
              onDexPress={() => navigation.navigate("Collection")}
              onDismissHatch={app.dismissLatestHatchling}
              onHatchAll={app.hatchAllReadyEggs}
              onHatch={app.hatchEgg}
              onLeaderboardPress={() => navigation.navigate("Ranks")}
              onSetActiveHatchling={app.setActiveHatchling}
              onSettingsPress={() => navigation.navigate("Profile")}
            />
          )}
        </MainTabs.Screen>
        <MainTabs.Screen name="Collection">
          {({ navigation }) => (
            <CreatureDexScreen
              data={app.data}
              onHomePress={() => navigation.navigate("Home")}
              onLeaderboardPress={() => navigation.navigate("Ranks")}
              onMonsterPress={() => navigation.navigate("Hatchery")}
              onRenameHatchling={app.renameCollectedHatchling}
              onSetActiveHatchling={app.setActiveHatchling}
              onSettingsPress={() => navigation.navigate("Profile")}
              onTrainActiveHatchling={app.trainActiveHatchling}
            />
          )}
        </MainTabs.Screen>
        <MainTabs.Screen name="Ranks">
          {({ navigation }) => (
            <LeaderboardScreen
              data={app.data}
              leaderboardSyncLabel={app.leaderboardSyncLabel}
              today={app.today}
              onDexPress={() => navigation.navigate("Collection")}
              onHomePress={() => navigation.navigate("Home")}
              onMonsterPress={() => navigation.navigate("Hatchery")}
              onSaveAlias={app.saveLeaderboardAlias}
              onSettingsPress={() => navigation.navigate("Profile")}
              onSetSharing={app.setLeaderboardSharing}
            />
          )}
        </MainTabs.Screen>
        <MainTabs.Screen name="Profile">
          {({ navigation }) => (
            <SettingsPrivacyScreen
              data={app.data}
              cloudSyncLabel={app.cloudSyncLabel}
              healthMode={app.healthMode}
              leaderboardSyncLabel={app.leaderboardSyncLabel}
              progressionProfile={app.progressionProfile}
              testLabEnabled={app.testLabEnabled}
              onBack={() => navigation.navigate("Home")}
              onDexPress={() => navigation.navigate("Collection")}
              onLeaderboardPress={() => navigation.navigate("Ranks")}
              onMonsterPress={() => navigation.navigate("Hatchery")}
              onReadyTestEgg={app.readyTestEgg}
              onReset={app.resetApp}
              onSaveProfile={app.saveProfile}
              onSetAnalyticsEnabled={app.setAnalyticsEnabled}
              onSetCloudSyncEnabled={app.setCloudSyncEnabled}
              onSetCrashReportingEnabled={app.setCrashReportingEnabled}
              onSetLeaderboardSharing={app.setLeaderboardSharing}
              onSetTestStage={app.setTestStage}
              onApplyQaFixture={app.applyQaFixture}
            />
          )}
        </MainTabs.Screen>
      </MainTabs.Navigator>
    </BottomNavStatusProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
});
