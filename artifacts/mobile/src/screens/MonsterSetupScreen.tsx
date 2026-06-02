import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { AppButton } from "../components/AppButton";
import { Header } from "../components/Header";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { Screen } from "../components/Screen";
import { colors } from "../theme";

interface Props {
  initialName: string;
  onBack: () => void;
  onContinue: (name: string) => Promise<void>;
}

export function MonsterSetupScreen({ initialName, onBack, onContinue }: Props) {
  const [name, setName] = useState(initialName);
  const canContinue = name.trim().length > 0;

  return (
    <Screen>
      <Header onBack={onBack} title="Meet your egg" />
      <Text style={styles.title}>Every big evolution starts small.</Text>
      <Text style={styles.body}>
        Give your new monster a name. You can build XP by moving after health sync
        is connected.
      </Text>
      <MonsterAvatar stage="egg" />
      <Text style={styles.label}>Monster name</Text>
      <TextInput
        autoCapitalize="words"
        maxLength={24}
        onChangeText={setName}
        placeholder="Try Moss, Ember, or Nova"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={name}
      />
      <AppButton
        disabled={!canContinue}
        label="Keep this name"
        onPress={() => onContinue(name)}
        style={!canContinue ? styles.disabled : undefined}
      />
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
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 15,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 17,
    marginBottom: 16,
    padding: 16,
  },
  disabled: {
    opacity: 0.45,
  },
});
