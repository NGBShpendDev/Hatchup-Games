import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "./AppButton";
import { reportCrash } from "../services/observability/observabilityService";
import { colors } from "../theme";

interface Props {
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    if (!this.props.onError) void reportCrash(error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>HatchUp needs a quick reset.</Text>
        <Text style={styles.body}>
          Something unexpected happened. Your local progress should still be
          saved.
        </Text>
        <AppButton
          label="Try again"
          onPress={() => this.setState({ error: null })}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
});
