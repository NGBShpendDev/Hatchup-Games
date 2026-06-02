import { StyleSheet, Text, View } from "react-native";
import { BottomNav } from "../components/BottomNav";
import { Header } from "../components/Header";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import type { HatchUpData } from "../domain/models";
import { getProgression, MONSTER_STAGES } from "../domain/progression";
import { colors } from "../theme";

interface Props {
  data: HatchUpData;
  onBack: () => void;
  onSettingsPress: () => void;
}

export function MonsterDetailScreen({ data, onBack, onSettingsPress }: Props) {
  const progression = getProgression(data.totalXp);

  return (
    <Screen
      footer={
        <BottomNav
          active="monster"
          onHomePress={onBack}
          onMonsterPress={() => undefined}
          onSettingsPress={onSettingsPress}
        />
      }
    >
      <Header onBack={onBack} title="Monster detail" />
      <View style={styles.card}>
        <MonsterAvatar stage={progression.current.id} />
        <Text style={styles.name}>{data.monsterName}</Text>
        <Text style={styles.stage}>{progression.current.label} stage</Text>
        <ProgressBar progress={progression.progress} />
        <Text style={styles.caption}>
          {progression.next
            ? `${progression.xpToNext} XP to evolve into ${progression.next.label}`
            : "Your monster has reached its final evolution."}
        </Text>
      </View>
      <Text style={styles.sectionTitle}>Evolution path</Text>
      {MONSTER_STAGES.map((stage) => {
        const unlocked = data.totalXp >= stage.xp;
        return (
          <View style={styles.stageRow} key={stage.id}>
            <View style={[styles.dot, unlocked && styles.unlockedDot]} />
            <View style={styles.stageText}>
              <Text style={styles.rowTitle}>{stage.label}</Text>
              <Text style={styles.rowCaption}>{stage.xp} total XP</Text>
            </View>
            <Text style={[styles.status, unlocked && styles.unlocked]}>
              {unlocked ? "Unlocked" : "Locked"}
            </Text>
          </View>
        );
      })}
      <View style={styles.stats}>
        <Stat label="Total XP" value={String(data.totalXp)} />
        <Stat label="Longest streak" value={`${data.longestStreak} days`} />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
  },
  name: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  stage: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 14,
    marginTop: 4,
    textAlign: "center",
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 9,
    textAlign: "center",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
    marginTop: 22,
  },
  stageRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 8,
    padding: 14,
  },
  dot: {
    backgroundColor: colors.line,
    borderRadius: 7,
    height: 14,
    marginRight: 11,
    width: 14,
  },
  unlockedDot: {
    backgroundColor: colors.primary,
  },
  stageText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  rowCaption: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  status: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  unlocked: {
    color: colors.primary,
  },
  stats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  stat: {
    backgroundColor: colors.accentSoft,
    borderRadius: 15,
    flex: 1,
    padding: 14,
  },
  statValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
});
