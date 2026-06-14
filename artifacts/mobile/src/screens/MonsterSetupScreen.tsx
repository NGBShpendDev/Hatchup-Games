import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { EggAvatar } from "../components/EggAvatar";
import { Header } from "../components/Header";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { OnboardingSteps } from "../components/OnboardingSteps";
import { Screen } from "../components/Screen";
import type { EggElement } from "../domain/models";
import { colors, elementColors, radii, typography } from "../theme";

interface Props {
  initialName: string;
  onBack: () => void;
  onContinue: (name: string, starterEggElement: EggElement) => Promise<void>;
}

const STARTER_EGGS: {
  element: EggElement;
  label: string;
  pitch: string;
  firstMission: string;
  trait: string;
}[] = [
  {
    element: "leaf",
    label: "Leaf",
    pitch: "Steady growth",
    firstMission: "Build a streak",
    trait: "Best for bonding and returning tomorrow.",
  },
  {
    element: "ember",
    label: "Ember",
    pitch: "High energy",
    firstMission: "Train your Pal",
    trait: "Best for active days and quick training wins.",
  },
  {
    element: "tide",
    label: "Tide",
    pitch: "Balanced flow",
    firstMission: "Walk for distance",
    trait: "Best for steady movement and longer walks.",
  },
  {
    element: "storm",
    label: "Storm",
    pitch: "Fast sparks",
    firstMission: "Chase challenges",
    trait: "Best for weekly goals and bursty progress.",
  },
];

const NAME_IDEAS = ["Moss", "Nova", "Ripple", "Bolt"];

export function MonsterSetupScreen({ initialName, onBack, onContinue }: Props) {
  const [name, setName] = useState(initialName);
  const [starterEggElement, setStarterEggElement] =
    useState<EggElement>("leaf");
  const canContinue = name.trim().length > 0;
  const selectedEgg =
    STARTER_EGGS.find((egg) => egg.element === starterEggElement) ??
    STARTER_EGGS[0];

  return (
    <Screen>
      <Header onBack={onBack} title="Choose your Egg" />
      <OnboardingSteps currentStep={2} helperText="Pick your first play style" />
      <Text style={styles.title}>Every big evolution starts small.</Text>
      <Text style={styles.body}>
        Name your journey and choose your first starter Egg. More random Eggs
        drop as you hit movement milestones.
      </Text>
      <MonsterAvatar stage="egg" />
      <View style={styles.guidanceCard}>
        <Text style={styles.guidanceTitle}>This is your first Egg, not your forever choice.</Text>
        <Text style={styles.guidanceBody}>
          Start with the style that sounds fun today. Other elements and
          rarities can still appear as milestone rewards.
        </Text>
      </View>
      <Text style={styles.label}>Starter Egg</Text>
      <View style={styles.eggGrid}>
        {STARTER_EGGS.map((egg) => {
          const selected = egg.element === starterEggElement;
          return (
            <Pressable
              key={egg.element}
              onPress={() => setStarterEggElement(egg.element)}
              style={[
                styles.eggOption,
                { borderColor: selected ? elementColors[egg.element] : colors.line },
                selected && styles.eggOptionSelected,
              ]}
            >
              <EggAvatar element={egg.element} rarity="common" size="small" />
              <Text style={styles.eggLabel}>{egg.label}</Text>
              <Text style={styles.eggPitch}>{egg.pitch}</Text>
              <Text style={styles.eggTrait}>{egg.trait}</Text>
              {selected && <Text style={styles.selectedPill}>Selected</Text>}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.starterSummary}>
        <Text style={styles.summaryKicker}>Starter path</Text>
        <Text style={styles.summaryTitle}>
          {selectedEgg.label} Egg selected
        </Text>
        <Text style={styles.summaryBody}>
          First mission: {selectedEgg.firstMission}. This Egg goes into your
          incubator first, then Home will guide your next action.
        </Text>
      </View>
      <Text style={styles.label}>Journey name</Text>
      <View style={styles.nameIdeas}>
        {NAME_IDEAS.map((idea) => (
          <Pressable key={idea} onPress={() => setName(idea)} style={styles.nameIdea}>
            <Text style={styles.nameIdeaText}>{idea}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        autoCapitalize="words"
        maxLength={24}
        onChangeText={setName}
        placeholder="Try Moss, Ember, or Nova"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={name}
      />
      {!canContinue && (
        <Text style={styles.validationText}>
          Give your journey a name to continue.
        </Text>
      )}
      <AppButton
        disabled={!canContinue}
        label="Place Egg in incubator"
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
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    lineHeight: 35,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  guidanceCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  guidanceTitle: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: "900",
  },
  guidanceBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
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
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 10,
    width: "48%",
  },
  eggOptionSelected: {
    backgroundColor: colors.primarySoft,
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
    textAlign: "center",
  },
  eggTrait: {
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 4,
    minHeight: 28,
    textAlign: "center",
  },
  selectedPill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    color: colors.primaryText,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  starterSummary: {
    backgroundColor: colors.softPeach,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 4,
    marginBottom: 18,
    padding: 14,
  },
  summaryKicker: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  summaryBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 17,
    marginBottom: 8,
    padding: 16,
  },
  nameIdeas: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  nameIdea: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  nameIdeaText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
  },
  validationText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 10,
  },
  disabled: {
    opacity: 0.45,
  },
});
