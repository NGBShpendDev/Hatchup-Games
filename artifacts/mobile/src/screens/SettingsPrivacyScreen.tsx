import { Alert, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { BottomNav } from "../components/BottomNav";
import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import type { HatchUpData } from "../domain/models";
import type { MonsterStage } from "../domain/progression";
import type { ProgressionProfile } from "../domain/progressionConfig";
import { colors } from "../theme";

const privacyCopy =
  "HatchUp reads your steps, workouts, and active energy only to reward your monster with XP. We do not sell your health data or use it for ads.";

interface Props {
  data: HatchUpData;
  healthMode: string;
  progressionProfile: ProgressionProfile;
  testLabEnabled: boolean;
  onBack: () => void;
  onDexPress: () => void;
  onMonsterPress: () => void;
  onReadyTestEgg: () => Promise<void>;
  onReset: () => Promise<void>;
  onSetTestStage: (stage: MonsterStage) => Promise<void>;
}

export function SettingsPrivacyScreen({
  data,
  healthMode,
  progressionProfile,
  testLabEnabled,
  onBack,
  onDexPress,
  onMonsterPress,
  onReadyTestEgg,
  onReset,
  onSetTestStage,
}: Props) {
  return (
    <Screen
      footer={
        <BottomNav
          active="settings"
          onDexPress={onDexPress}
          onHomePress={onBack}
          onMonsterPress={onMonsterPress}
          onSettingsPress={() => undefined}
        />
      }
    >
      <Header onBack={onBack} title="Settings and privacy" />
      <Text style={styles.title}>Your data stays simple.</Text>
      <Text style={styles.body}>
        This MVP stores your monster progress locally on this device with
        AsyncStorage.
      </Text>
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
              label="Ready current egg"
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
