import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

interface Props {
  label: string;
  tone?: "default" | "ready";
  value: string;
}

export function CompactSummaryRow({ label, tone = "default", value }: Props) {
  return (
    <View style={[styles.row, tone === "ready" && styles.ready]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === "ready" && styles.readyValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ready: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  label: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  value: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  readyValue: {
    color: colors.primaryDeep,
  },
});
