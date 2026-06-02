import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

interface Props {
  title: string;
  onBack?: () => void;
}

export function Header({ onBack, title }: Props) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  back: {
    paddingVertical: 8,
    width: 64,
  },
  backText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  placeholder: {
    width: 64,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
  },
});
