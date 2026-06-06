import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import type { MonsterStage } from "../domain/progression";
import {
  getQaFixtures,
  type QaFixture,
  type QaFixtureId,
} from "../qa/fixtures";
import { colors, radii } from "../theme";

interface Props {
  today: string;
  onApplyQaFixture: (fixtureId: QaFixtureId) => Promise<void>;
  onReadyTestEgg: () => Promise<void>;
  onSetTestStage: (stage: MonsterStage) => Promise<void>;
}

export function QaTestLabScreen({
  today,
  onApplyQaFixture,
  onReadyTestEgg,
  onSetTestStage,
}: Props) {
  return (
    <View style={styles.testLabCard}>
      <Text style={styles.cardTitle}>Local Test Lab</Text>
      <Text style={styles.privacyText}>
        Preview local progression states without changing Apple Health data.
        These tools are included only in accelerated testing builds.
      </Text>
      <View style={styles.testLabButtons}>
        <AppButton
          label="Preview Egg"
          onPress={() => onSetTestStage("egg")}
          variant="secondary"
        />
        <AppButton
          label="Preview Baby"
          onPress={() => onSetTestStage("baby")}
          variant="secondary"
        />
        <AppButton
          label="Preview Teen"
          onPress={() => onSetTestStage("teen")}
          variant="secondary"
        />
        <AppButton
          label="Preview Final"
          onPress={() => onSetTestStage("final")}
          variant="secondary"
        />
        <AppButton
          label="Ready all Eggs"
          onPress={onReadyTestEgg}
          variant="secondary"
        />
      </View>
      <QaFixtureSwitcher
        fixtures={getQaFixtures(today)}
        onApplyFixture={onApplyQaFixture}
      />
    </View>
  );
}

function QaFixtureSwitcher({
  fixtures,
  onApplyFixture,
}: {
  fixtures: QaFixture[];
  onApplyFixture: (fixtureId: QaFixtureId) => Promise<void>;
}) {
  const [applyingFixtureId, setApplyingFixtureId] = useState<QaFixtureId | null>(
    null,
  );

  async function applyFixture(fixtureId: QaFixtureId) {
    setApplyingFixtureId(fixtureId);
    await onApplyFixture(fixtureId);
    setApplyingFixtureId(null);
  }

  return (
    <View style={styles.qaFixturePanel}>
      <Text style={styles.qaFixtureKicker}>QA FIXTURES</Text>
      <Text style={styles.qaFixtureTitle}>Reproduce key states fast</Text>
      <Text style={styles.privacyText}>
        These local fixtures help testers check empty, synced, hatching,
        collection, ranks, permissions, and mock-mode flows before TestFlight.
      </Text>
      <View style={styles.qaFixtureList}>
        {fixtures.map((fixture) => (
          <Pressable
            accessibilityRole="button"
            disabled={applyingFixtureId !== null}
            key={fixture.id}
            onPress={() => {
              void applyFixture(fixture.id);
            }}
            style={[
              styles.qaFixtureRow,
              applyingFixtureId === fixture.id && styles.qaFixtureRowActive,
            ]}
          >
            <View style={styles.qaFixtureText}>
              <Text style={styles.qaFixtureName}>{fixture.title}</Text>
              <Text style={styles.qaFixtureDescription}>
                {fixture.description}
              </Text>
            </View>
            <Text style={styles.qaFixtureApply}>
              {applyingFixtureId === fixture.id ? "Loading" : "Apply"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  privacyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  testLabCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  testLabButtons: {
    gap: 8,
    marginTop: 12,
  },
  qaFixturePanel: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginTop: 14,
    padding: 12,
  },
  qaFixtureKicker: {
    color: colors.primaryDeep,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  qaFixtureTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  qaFixtureList: {
    gap: 8,
  },
  qaFixtureRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  qaFixtureRowActive: {
    borderColor: colors.primary,
    opacity: 0.76,
  },
  qaFixtureText: {
    flex: 1,
  },
  qaFixtureName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  qaFixtureDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  qaFixtureApply: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "900",
  },
});
