import "expo-dev-client";

import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ConnectHealthScreen } from "./src/screens/ConnectHealthScreen";
import { CreatureDexScreen } from "./src/screens/CreatureDexScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
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
  | "settings";

export default function App() {
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
    app.data.onboardingStatus === "complete" && screen === "welcome"
      ? "home"
      : screen;

  return (
    <>
      <StatusBar style="dark" />
      {activeScreen === "welcome" && (
        <WelcomeScreen onContinue={() => setScreen("setup")} />
      )}
      {activeScreen === "setup" && (
        <MonsterSetupScreen
          initialName={app.data.monsterName}
          onBack={() => setScreen("welcome")}
          onContinue={async (name) => {
            await app.saveMonsterName(name);
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
          onDexPress={() => setScreen("dex")}
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
          onHatch={app.hatchEgg}
          onSettingsPress={() => setScreen("settings")}
        />
      )}
      {activeScreen === "dex" && (
        <CreatureDexScreen
          data={app.data}
          onHomePress={() => setScreen("home")}
          onMonsterPress={() => setScreen("monster")}
          onSettingsPress={() => setScreen("settings")}
        />
      )}
      {activeScreen === "settings" && (
        <SettingsPrivacyScreen
          data={app.data}
          healthMode={app.healthMode}
          progressionProfile={app.progressionProfile}
          testLabEnabled={app.testLabEnabled}
          onBack={() => setScreen("home")}
          onDexPress={() => setScreen("dex")}
          onMonsterPress={() => setScreen("monster")}
          onReadyTestEgg={app.readyTestEgg}
          onReset={async () => {
            await app.resetApp();
            setScreen("welcome");
          }}
          onSetTestStage={app.setTestStage}
        />
      )}
    </>
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
