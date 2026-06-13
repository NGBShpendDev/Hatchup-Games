import type { PropsWithChildren } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

interface Props extends PropsWithChildren {
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}

export function Screen({ children, contentStyle, footer }: Props) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, spacing.footerBottom);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomInset + FOOTER_SCROLL_RESERVE },
          contentStyle,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollIndicatorInsets={{ bottom: bottomInset + FOOTER_SCROLL_RESERVE }}
      >
        {children}
      </ScrollView>
      {footer && (
        <View style={[styles.footer, { paddingBottom: bottomInset }]}>
          {footer}
        </View>
      )}
    </SafeAreaView>
  );
}

const FOOTER_SCROLL_RESERVE = 112;

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.screen,
  },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingHorizontal: spacing.screen,
    paddingTop: 7,
    shadowColor: colors.cardShadow,
    shadowOffset: { height: -6, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
});
