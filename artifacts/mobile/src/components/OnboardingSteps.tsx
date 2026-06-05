import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

const STEPS = ["Intro", "Starter", "Sync"];

interface Props {
  currentStep: number;
  helperText?: string;
}

export function OnboardingSteps({ currentStep, helperText }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Step {currentStep} of 3</Text>
        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      </View>
      <View style={styles.steps}>
        {STEPS.map((label, index) => {
          const active = index + 1 === currentStep;
          const complete = index + 1 < currentStep;
          return (
            <View
              key={label}
              style={[
                styles.stepPill,
                complete && styles.stepPillComplete,
                active && styles.stepPillActive,
              ]}
            >
              <Text
                style={[
                  styles.stepText,
                  complete && styles.stepTextComplete,
                  active && styles.stepTextActive,
                ]}
              >
                {index + 1}. {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 18,
    marginTop: 8,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryText: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  helperText: {
    color: colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
  steps: {
    flexDirection: "row",
    gap: 7,
  },
  stepPill: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 7,
  },
  stepPillActive: {
    backgroundColor: colors.primaryDeep,
    borderColor: colors.primaryDeep,
  },
  stepPillComplete: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  stepText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  stepTextActive: {
    color: "#FFFFFF",
  },
  stepTextComplete: {
    color: colors.primaryDeep,
  },
});
