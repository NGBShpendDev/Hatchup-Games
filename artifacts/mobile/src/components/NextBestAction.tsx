import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "./AppButton";
import { SparkleBurst } from "./SparkleBurst";
import type { NextBestActionModel } from "../domain/nextBestAction";
import { colors, radii, typography } from "../theme";
import { PrimaryCard } from "./ui";

interface Props {
  action: NextBestActionModel;
  onPress: () => void;
}

export function NextBestAction({ action, onPress }: Props) {
  return (
    <PrimaryCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.kicker}>NEXT BEST ACTION</Text>
          <Text style={styles.title}>{action.title}</Text>
        </View>
        {action.variant === "primary" && <SparkleBurst label="NOW" tone="accent" />}
      </View>
      <Text style={styles.description}>{action.description}</Text>
      {(action.progressLabel || action.valueLabel) && (
        <View style={styles.metaRow}>
          {action.progressLabel ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>{action.progressLabel}</Text>
            </View>
          ) : null}
          {action.valueLabel ? (
            <View style={[styles.metaPill, styles.metaPillSoft]}>
              <Text style={styles.metaText}>{action.valueLabel}</Text>
            </View>
          ) : null}
        </View>
      )}
      <AppButton
        disabled={action.disabled}
        label={action.ctaLabel}
        onPress={onPress}
        variant={action.variant ?? "primary"}
      />
    </PrimaryCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: typography.bodyLineHeight,
  },
  header: {
    alignItems: "flex-start",
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
  metaPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillSoft: {
    backgroundColor: colors.primarySoft,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.3,
    marginTop: 3,
  },
  titleGroup: {
    flex: 1,
    paddingRight: 10,
  },
});
