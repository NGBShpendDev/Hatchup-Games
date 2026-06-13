import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "./AppButton";
import { SparkleBurst } from "./SparkleBurst";
import { colors, radii } from "../theme";
import type { TrainingFeedback } from "../useHatchUpApp";
import { formatNumber } from "../utils/format";

interface Props {
  feedback: TrainingFeedback | null;
  onDismiss: () => void;
}

export function ActionFeedbackModal({ feedback, onDismiss }: Props) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onDismiss}
      transparent
      visible={feedback !== null}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Dismiss action feedback"
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.backdrop}
        />
        {feedback && (
          <View style={styles.card}>
            <View style={styles.header}>
              <View>
                <Text style={styles.kicker}>Training complete</Text>
                <Text style={styles.title}>{feedback.palName} grew stronger</Text>
              </View>
              <SparkleBurst tone="accent" />
            </View>
            <View style={styles.rows}>
              <FeedbackRow
                label="Power gained"
                value={`+${formatNumber(feedback.powerGained)}`}
              />
              <FeedbackRow
                label="Bond gained"
                value={`+${formatNumber(feedback.bondGained)}`}
              />
              <FeedbackRow
                label="Pal XP gained"
                value={`+${formatNumber(feedback.xpGained)} XP`}
              />
              <FeedbackRow
                label="Training left"
                value={`${formatNumber(feedback.sessionsRemaining)} today`}
              />
              <FeedbackRow
                label="Chest progress"
                value={`+${formatNumber(feedback.chestProgressGained)}`}
              />
            </View>
            <Text style={styles.body}>
              Training is limited each day so each session feels meaningful.
              Return after cooldowns to keep growing this Pal.
            </Text>
            <AppButton label="Nice" onPress={onDismiss} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function FeedbackRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: colors.modalBackdrop,
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 12,
    margin: 16,
    padding: 18,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 3,
  },
  rows: {
    gap: 8,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.warmSurface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 11,
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  rowValue: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});
