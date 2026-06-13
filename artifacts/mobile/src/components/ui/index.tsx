import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { colors, radii, spacing, typography } from "../../theme";
import { ProgressBar } from "../ProgressBar";

type Tone = "default" | "primary" | "accent" | "danger" | "muted";
type ToneTarget = "button" | "buttonText" | "pill" | "pillText" | "text";

interface WithStyle {
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  elevated = false,
  style,
  warm = false,
}: WithStyle & {
  children: React.ReactNode;
  elevated?: boolean;
  warm?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        warm && styles.warmCard,
        elevated && styles.elevatedCard,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PrimaryCard({
  children,
  style,
}: WithStyle & {
  children: React.ReactNode;
}) {
  return <View style={[styles.primaryCard, style]}>{children}</View>;
}

export function SecondaryCard({
  children,
  style,
}: WithStyle & {
  children: React.ReactNode;
}) {
  return <View style={[styles.secondaryCard, style]}>{children}</View>;
}

export function UtilityCard({
  children,
  style,
}: WithStyle & {
  children: React.ReactNode;
}) {
  return <View style={[styles.utilityCard, style]}>{children}</View>;
}

export function SectionHeader({
  action,
  eyebrow,
  meta,
  subtitle,
  title,
}: {
  action?: React.ReactNode;
  eyebrow?: string;
  meta?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {meta && <Text style={styles.sectionMeta}>{meta}</Text>}
        </View>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <View style={[styles.pill, getToneViewStyle(tone, "pill")]}>
      <Text style={[styles.pillText, getToneTextStyle(tone, "pillText")]}>
        {children}
      </Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <Card style={styles.statTile}>
      <Text style={[styles.statValue, getToneTextStyle(tone, "text")]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export function ActionCard({
  body,
  cta,
  disabled = false,
  eyebrow,
  onPress,
  title,
}: {
  body: string;
  cta?: string;
  disabled?: boolean;
  eyebrow?: string;
  onPress?: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {cta && <Text style={styles.actionCta}>{cta}</Text>}
    </Pressable>
  );
}

export function EmptyState({
  action,
  body,
  title,
}: {
  action?: React.ReactNode;
  body: string;
  title: string;
}) {
  return (
    <Card style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action}
    </Card>
  );
}

export function PageTitle({
  eyebrow,
  right,
  subtitle,
  title,
}: {
  eyebrow?: string;
  right?: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.pageTitleWrap}>
      <View style={styles.pageTitleText}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle && <Text style={styles.pageSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: Tone;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        getToneViewStyle(tone, "button"),
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.iconButtonText, getToneTextStyle(tone, "buttonText")]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProgressMetric({
  caption,
  label,
  progress,
  value,
}: {
  caption?: string;
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <Card>
      <View style={styles.progressMetricHeader}>
        <Text style={styles.progressMetricLabel}>{label}</Text>
        <Text style={styles.progressMetricValue}>{value}</Text>
      </View>
      <ProgressBar progress={progress} />
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </Card>
  );
}

export function ScreenHeader({
  onBack,
  right,
  subtitle,
  title,
}: {
  onBack?: () => void;
  right?: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.screenHeader}>
      {onBack && (
        <IconButton
          accessibilityLabel="Go back"
          label="Back"
          onPress={onBack}
          tone="muted"
        />
      )}
      <View style={styles.screenHeaderText}>
        <Text style={styles.screenHeaderTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

function getToneStyle(tone: Tone, target: ToneTarget) {
  const map = {
    accent: {
      button: { backgroundColor: colors.accentSoft },
      buttonText: { color: colors.primaryDeep },
      pill: { backgroundColor: colors.accentSoft },
      pillText: { color: colors.primaryDeep },
      text: { color: colors.accent },
    },
    danger: {
      button: { backgroundColor: colors.dangerSoft },
      buttonText: { color: colors.danger },
      pill: { backgroundColor: colors.dangerSoft },
      pillText: { color: colors.danger },
      text: { color: colors.danger },
    },
    default: {
      button: { backgroundColor: colors.primarySoft },
      buttonText: { color: colors.primaryDeep },
      pill: { backgroundColor: colors.primarySoft },
      pillText: { color: colors.primaryDeep },
      text: { color: colors.ink },
    },
    muted: {
      button: { backgroundColor: colors.surface },
      buttonText: { color: colors.muted },
      pill: { backgroundColor: colors.surface },
      pillText: { color: colors.muted },
      text: { color: colors.muted },
    },
    primary: {
      button: { backgroundColor: colors.primaryDeep },
      buttonText: { color: colors.surface },
      pill: { backgroundColor: colors.primaryDeep },
      pillText: { color: colors.surface },
      text: { color: colors.primaryDeep },
    },
  } satisfies Record<Tone, Record<ToneTarget, object>>;

  return map[tone][target] ?? {};
}

function getToneViewStyle(tone: Tone, target: "button" | "pill"): ViewStyle {
  return getToneStyle(tone, target) as ViewStyle;
}

function getToneTextStyle(
  tone: Tone,
  target: "buttonText" | "pillText" | "text",
): TextStyle {
  return getToneStyle(tone, target) as TextStyle;
}

const styles = StyleSheet.create({
  actionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    padding: spacing.card,
  },
  actionCta: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },
  actionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: typography.titleWeight,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: typography.bodyLineHeight,
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.card,
  },
  primaryCard: {
    backgroundColor: colors.warmSurface,
    borderColor: colors.rewardGold,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    padding: 15,
    shadowColor: colors.cardShadowStrong,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 22,
  },
  secondaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  utilityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    gap: 7,
    padding: 11,
  },
  disabled: {
    opacity: 0.55,
  },
  elevatedCard: {
    shadowColor: colors.cardShadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  emptyState: {
    gap: 10,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: typography.titleWeight,
  },
  eyebrow: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  iconButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: 14,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: "900",
  },
  pageSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.7,
    lineHeight: 30,
  },
  pageTitleText: {
    flex: 1,
  },
  pageTitleWrap: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  pill: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.78,
  },
  progressMetricHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressMetricLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  progressMetricValue: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
  },
  screenHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  screenHeaderText: {
    flex: 1,
  },
  screenHeaderTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: typography.titleWeight,
  },
  sectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },
  sectionMeta: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: typography.titleWeight,
  },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  segment: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  segmentActive: {
    backgroundColor: colors.primaryDeep,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: colors.surface,
  },
  segmented: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  statTile: {
    flex: 1,
    gap: 4,
  },
  statValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: typography.titleWeight,
  },
  warmCard: {
    backgroundColor: colors.warmSurface,
  },
});
