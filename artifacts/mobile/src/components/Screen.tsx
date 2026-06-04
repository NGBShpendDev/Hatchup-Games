import type { PropsWithChildren } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { colors, spacing } from "../theme";

interface Props extends PropsWithChildren {
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}

export function Screen({ children, contentStyle, footer }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.screen,
    paddingBottom: spacing.footerBottom + 84,
  },
  footer: {
    backgroundColor: colors.background,
    padding: spacing.screen,
    paddingBottom: spacing.footerBottom,
    paddingTop: 8,
  },
});
