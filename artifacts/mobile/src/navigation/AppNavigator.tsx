import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ActionFeedbackModal } from "../components/ActionFeedbackModal";
import { BottomNavStatusProvider } from "../components/BottomNavStatusContext";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ConnectHealthScreen } from "../screens/ConnectHealthScreen";
import { CreatureDexScreen } from "../screens/CreatureDexScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LeaderboardScreen } from "../screens/LeaderboardScreen";
import { MonsterDetailScreen } from "../screens/MonsterDetailScreen";
import { MonsterSetupScreen } from "../screens/MonsterSetupScreen";
import { SettingsPrivacyScreen } from "../screens/SettingsPrivacyScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { colors } from "../theme";
import { useHatchUpApp } from "../useHatchUpApp";
import type { MainTabParamList, OnboardingStackParamList } from "./types";

const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

type HatchUpAppController = ReturnType<typeof useHatchUpApp>;
type OnboardingProps<RouteName extends keyof OnboardingStackParamList> =
  NativeStackScreenProps<OnboardingStackParamList, RouteName>;

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
          <OnboardingNavigator app={app} />
        )}
        <ActionFeedbackModal
          feedback={app.trainingFeedback}
          onDismiss={app.dismissTrainingFeedback}
        />
      </NavigationContainer>
    </ErrorBoundary>
  );
}

function OnboardingNavigator({ app }: { app: HatchUpAppController }) {
  return (
    <OnboardingStack.Navigator
      initialRouteName={
        app.data.onboardingStatus === "monsterCreated"
          ? "ConnectHealth"
          : "Welcome"
      }
      screenOptions={{ headerShown: false }}
    >
      <OnboardingStack.Screen name="Welcome">
        {({ navigation }: OnboardingProps<"Welcome">) => (
          <WelcomeScreen onContinue={() => navigation.navigate("MonsterSetup")} />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="MonsterSetup">
        {({ navigation }: OnboardingProps<"MonsterSetup">) => (
          <MonsterSetupScreen
            initialName={app.data.monsterName}
            onBack={() => navigation.goBack()}
            onContinue={async (name, starterEggElement) => {
              await app.saveMonsterSetup(name, starterEggElement);
              navigation.navigate("ConnectHealth");
            }}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="ConnectHealth">
        {({ navigation }: OnboardingProps<"ConnectHealth">) => (
          <ConnectHealthScreen
            error={app.error}
            healthMode={app.healthMode}
            onBack={() => navigation.navigate("MonsterSetup")}
            onConnect={async () => {
              await app.connectHealth();
            }}
            onSkip={async () => {
              await app.skipHealthConnect();
            }}
          />
        )}
      </OnboardingStack.Screen>
    </OnboardingStack.Navigator>
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
              onSync={app.syncHealth}
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
