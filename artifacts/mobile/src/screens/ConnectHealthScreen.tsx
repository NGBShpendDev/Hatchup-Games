import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { Header } from "../components/Header";
import { Screen } from "../components/Screen";
import { colors } from "../theme";

const privacyCopy =
  "HatchUp reads your steps, distance, workouts, and active energy only to reward your monster with XP and show optional rankings. We do not sell your health data or use it for ads.";

interface Props {
  error: string | null;
  healthMode: string;
  onBack: () => void;
  onConnect: () => Promise<void>;
}

export function ConnectHealthScreen({
  error,
  healthMode,
  onBack,
  onConnect,
}: Props) {
  return (
    <Screen>
      <Header onBack={onBack} title="Connect health" />
      <Text style={styles.title}>Turn movement into monster XP.</Text>
      <Text style={styles.body}>
        Connect your health source so HatchUp can calculate your daily reward.
      </Text>
      <View style={styles.sourceCard}>
        <View style={styles.sourceMark}>
          <Text style={styles.sourceMarkText}>H</Text>
        </View>
        <View style={styles.sourceText}>
          <Text style={styles.sourceTitle}>{healthMode}</Text>
          <Text style={styles.sourceBody}>Read-only access for your MVP rewards</Text>
        </View>
      </View>
      <View style={styles.readCard}>
        <Text style={styles.cardTitle}>HatchUp reads only</Text>
        <Text style={styles.item}>Steps</Text>
        <Text style={styles.item}>Distance</Text>
        <Text style={styles.item}>Active calories</Text>
        <Text style={styles.item}>Workouts and exercise sessions</Text>
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>Your privacy matters</Text>
        <Text style={styles.privacyBody}>{privacyCopy}</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.spacer} />
      <AppButton label={`Connect ${healthMode}`} onPress={onConnect} />
      <Text style={styles.note}>
        Native health sync requires an Expo development build. Expo Go is not
        supported.
      </Text>
    </Screen>
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
  sourceCard: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    flexDirection: "row",
    marginTop: 24,
    padding: 16,
  },
  sourceMark: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 15,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sourceMarkText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  sourceText: {
    flex: 1,
    marginLeft: 13,
  },
  sourceTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  sourceBody: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  readCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: 14,
    padding: 16,
  },
  privacyCard: {
    backgroundColor: colors.accentSoft,
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
  item: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 23,
  },
  privacyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    textAlign: "center",
  },
});
