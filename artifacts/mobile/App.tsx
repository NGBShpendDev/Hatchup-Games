import "expo-dev-client";

import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ConnectHealthScreen } from "./src/screens/ConnectHealthScreen";
import { CreatureDexScreen } from "./src/screens/CreatureDexScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LeaderboardScreen } from "./src/screens/LeaderboardScreen";
import { MonsterDetailScreen } from "./src/screens/MonsterDetailScreen";
import { MonsterSetupScreen } from "./src/screens/MonsterSetupScreen";
import { SettingsPrivacyScreen } from "./src/screens/SettingsPrivacyScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { colors } from "./src/theme";
import { useHatchUpApp } from "./src/useHatchUpApp";

export type ScreenName =
  | "welcome"
  | "setup"
  | "connect"
  | "home"
  | "monster"
  | "dex"
  | "leaderboard"
  | "settings";

function AppContent() {
  const app = useHatchUpApp();
  const [screen, setScreen] = useState<ScreenName>("welcome");

  if (!app.ready) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const activeScreen =
    screen === "welcome" && app.data.onboardingStatus === "complete"
      ? "home"
      : screen === "welcome" && app.data.onboardingStatus === "monsterCreated"
        ? "connect"
        : screen;

  return (
    <ErrorBoundary onError={app.reportCrash}>
      <StatusBar style="dark" />
      {activeScreen === "welcome" && (
        <WelcomeScreen onContinue={() => setScreen("setup")} />
      )}
      {activeScreen === "setup" && (
        <MonsterSetupScreen
          initialName={app.data.monsterName}
          onBack={() => setScreen("welcome")}
          onContinue={async (name, starterEggElement) => {
            await app.saveMonsterSetup(name, starterEggElement);
            setScreen("connect");
          }}
        />
      )}
      {activeScreen === "connect" && (
        <ConnectHealthScreen
          error={app.error}
          healthMode={app.healthMode}
          onBack={() => setScreen("setup")}
          onConnect={async () => {
            const connected = await app.connectHealth();
            if (connected) setScreen("home");
          }}
          onSkip={async () => {
            await app.skipHealthConnect();
            setScreen("home");
          }}
        />
      )}
      {activeScreen === "home" && (
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
          onDexPress={() => setScreen("dex")}
          onLeaderboardPress={() => setScreen("leaderboard")}
          onMonsterPress={() => setScreen("monster")}
          onSettingsPress={() => setScreen("settings")}
          onSync={app.syncHealth}
        />
      )}
      {activeScreen === "monster" && (
        <MonsterDetailScreen
          data={app.data}
          latestHatchling={app.latestHatchling}
          onBack={() => setScreen("home")}
          onDexPress={() => setScreen("dex")}
          onDismissHatch={app.dismissLatestHatchling}
          onHatchAll={app.hatchAllReadyEggs}
          onHatch={app.hatchEgg}
          onLeaderboardPress={() => setScreen("leaderboard")}
          onSetActiveHatchling={app.setActiveHatchling}
          onSettingsPress={() => setScreen("settings")}
        />
      )}
      {activeScreen === "dex" && (
        <CreatureDexScreen
          data={app.data}
          onHomePress={() => setScreen("home")}
          onLeaderboardPress={() => setScreen("leaderboard")}
          onMonsterPress={() => setScreen("monster")}
          onRenameHatchling={app.renameCollectedHatchling}
          onSetActiveHatchling={app.setActiveHatchling}
          onSettingsPress={() => setScreen("settings")}
          onTrainActiveHatchling={app.trainActiveHatchling}
        />
      )}
      {activeScreen === "leaderboard" && (
        <LeaderboardScreen
          data={app.data}
          leaderboardSyncLabel={app.leaderboardSyncLabel}
          today={app.today}
          onDexPress={() => setScreen("dex")}
          onHomePress={() => setScreen("home")}
          onMonsterPress={() => setScreen("monster")}
          onSaveAlias={app.saveLeaderboardAlias}
          onSettingsPress={() => setScreen("settings")}
          onSetSharing={app.setLeaderboardSharing}
        />
      )}
      {activeScreen === "settings" && (
        <SettingsPrivacyScreen
          data={app.data}
          cloudSyncLabel={app.cloudSyncLabel}
          healthMode={app.healthMode}
          leaderboardSyncLabel={app.leaderboardSyncLabel}
          progressionProfile={app.progressionProfile}
          testLabEnabled={app.testLabEnabled}
          onBack={() => setScreen("home")}
          onDexPress={() => setScreen("dex")}
          onLeaderboardPress={() => setScreen("leaderboard")}
          onMonsterPress={() => setScreen("monster")}
          onReadyTestEgg={app.readyTestEgg}
          onReset={async () => {
            await app.resetApp();
            setScreen("welcome");
          }}
          onSaveProfile={app.saveProfile}
          onSetAnalyticsEnabled={app.setAnalyticsEnabled}
          onSetCloudSyncEnabled={app.setCloudSyncEnabled}
          onSetCrashReportingEnabled={app.setCrashReportingEnabled}
          onSetLeaderboardSharing={app.setLeaderboardSharing}
          onSetTestStage={app.setTestStage}
        />
      )}
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
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
