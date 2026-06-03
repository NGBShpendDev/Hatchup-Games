import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { EggAvatar } from "../components/EggAvatar";
import { Header } from "../components/Header";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { Screen } from "../components/Screen";
import type { EggElement } from "../domain/models";
import { colors } from "../theme";

interface Props {
  initialName: string;
  onBack: () => void;
  onContinue: (name: string, starterEggElement: EggElement) => Promise<void>;
}

const STARTER_EGGS: { element: EggElement; label: string; pitch: string }[] = [
  { element: "leaf", label: "Leaf", pitch: "Steady growth" },
  { element: "ember", label: "Ember", pitch: "High energy" },
  { element: "tide", label: "Tide", pitch: "Balanced flow" },
  { element: "storm", label: "Storm", pitch: "Fast sparks" },
];

export function MonsterSetupScreen({ initialName, onBack, onContinue }: Props) {
  const [name, setName] = useState(initialName);
  const [starterEggElement, setStarterEggElement] =
    useState<EggElement>("leaf");
  const canContinue = name.trim().length > 0;

  return (
    <Screen>
      <Header onBack={onBack} title="Choose your Egg" />
      <Text style={styles.title}>Every big evolution starts small.</Text>
      <Text style={styles.body}>
        Name your journey and choose your first starter Egg. More random Eggs
        drop as you hit beta milestones.
      </Text>
      <MonsterAvatar stage="egg" />
      <Text style={styles.label}>Starter Egg</Text>
      <View style={styles.eggGrid}>
        {STARTER_EGGS.map((egg) => {
          const selected = egg.element === starterEggElement;
          return (
            <Pressable
              key={egg.element}
              onPress={() => setStarterEggElement(egg.element)}
              style={[styles.eggOption, selected && styles.eggOptionSelected]}
            >
              <EggAvatar element={egg.element} rarity="common" size="small" />
              <Text style={styles.eggLabel}>{egg.label}</Text>
              <Text style={styles.eggPitch}>{egg.pitch}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>Journey name</Text>
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
        label="Start with this Egg"
        onPress={() => onContinue(name, starterEggElement)}
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
  eggGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 18,
  },
  eggOption: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  eggOptionSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  eggLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  eggPitch: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
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
