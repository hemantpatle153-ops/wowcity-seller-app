import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { formatMoney, initials } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text, type ColorToken } from "./Text";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneColors: Record<Tone, { fg: ColorToken; bg: ColorToken }> = {
  neutral: { fg: "textMuted", bg: "surfaceSunken" },
  accent: { fg: "accentSoftText", bg: "accentSoft" },
  success: { fg: "success", bg: "successSoft" },
  warning: { fg: "warning", bg: "warningSoft" },
  danger: { fg: "danger", bg: "dangerSoft" },
  info: { fg: "info", bg: "infoSoft" }
};

const toneIcons: Partial<Record<Tone, IconName>> = { success: "checkmark-circle", warning: "alert-circle", danger: "close-circle", info: "information-circle" };

/** Status pill: always text (and usually an icon), never colour alone. */
export function Badge({ label, tone = "neutral", icon, showIcon = true }: { label: string; tone?: Tone; icon?: IconName; showIcon?: boolean }) {
  const theme = useTheme();
  const c = toneColors[tone];
  const name = icon ?? (showIcon ? toneIcons[tone] : undefined);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors[c.bg]
      }}
    >
      {name ? <Icon name={name} size={13} color={c.fg} /> : null}
      <Text variant="caption" weight="700" color={c.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({ name, size = 40, tone = "accent" }: { name: string; size?: number; tone?: Tone }) {
  const theme = useTheme();
  const c = toneColors[tone];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors[c.bg], alignItems: "center", justifyContent: "center" }}
    >
      <Text variant={size >= 48 ? "title" : "small"} weight="700" color={c.fg}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function IconCircle({ icon, tone = "accent", size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const theme = useTheme();
  const c = toneColors[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors[c.bg], alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size * 0.5} color={c.fg} />
    </View>
  );
}

export type ListRowProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  left?: ReactNode;
  icon?: IconName;
  iconTone?: Tone;
  right?: ReactNode;
  value?: string;
  valueColor?: ColorToken;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  /** Extra content under the subtitle (e.g. a status badge). */
  below?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({
  title,
  subtitle,
  meta,
  left,
  icon,
  iconTone = "accent",
  right,
  value,
  valueColor = "text",
  chevron,
  onPress,
  onLongPress,
  destructive,
  below,
  accessibilityLabel,
  accessibilityHint,
  style
}: ListRowProps) {
  const theme = useTheme();
  const content = (
    <>
      {left ?? (icon ? <IconCircle icon={icon} tone={destructive ? "danger" : iconTone} size={38} /> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" weight="600" color={destructive ? "danger" : "text"} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" color="textFaint" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {below ? <View style={{ marginTop: 4 }}>{below}</View> : null}
      </View>
      {value ? (
        <Text variant="bodyStrong" color={valueColor} tabular numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color="textFaint" /> : null}
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: theme.space[4] }, style];
  if (!onPress && !onLongPress) return <View style={rowStyle}>{content}</View>;
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.985}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
      style={rowStyle}
    >
      {content}
    </PressableScale>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 }}>
      <Text variant="small" weight="700" color="textMuted" uppercase accessibilityRole="header">
        {title}
      </Text>
      {action ? <Button label={action} variant="ghost" size="sm" onPress={onAction} /> : null}
    </View>
  );
}

/** Shimmering placeholder. Static when reduce motion is on. */
export function Skeleton({ width = "100%", height = 16, radius, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!theme.reduceMotion) pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse, theme.reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45 }));
  return <Animated.View accessibilityElementsHidden style={[{ width, height, borderRadius: radius ?? theme.radius.control / 2, backgroundColor: theme.colors.skeleton }, animated, style]} />;
}

export function SkeletonList({ rows = 6, withAvatar = true }: { rows?: number; withAvatar?: boolean }) {
  const theme = useTheme();
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ gap: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: theme.space[4] }}>
          {withAvatar ? <Skeleton width={40} height={40} radius={20} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={`${70 - (i % 3) * 12}%`} height={14} />
            <Skeleton width={`${40 + (i % 2) * 10}%`} height={12} />
          </View>
          <Skeleton width={56} height={14} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonCards({ count = 3, height = 96 }: { count?: number; height?: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[3] }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} radius={theme.radius.card} />
      ))}
    </View>
  );
}

/** Friendly empty state: icon in a soft circle, a title, one line and one clear action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
  tone = "accent",
  compact
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  tone?: Tone;
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(250)} style={{ alignItems: "center", paddingVertical: compact ? 24 : 48, paddingHorizontal: 24, gap: 12 }}>
      <View style={{ width: compact ? 72 : 96, height: compact ? 72 : 96, borderRadius: 48, backgroundColor: theme.colors[toneColors[tone].bg], alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", width: compact ? 92 : 124, height: compact ? 92 : 124, borderRadius: 62, borderWidth: 1, borderColor: theme.colors.border }} />
        <Icon name={icon} size={compact ? 32 : 42} color={toneColors[tone].fg} />
      </View>
      <Text variant="title" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textMuted" align="center" style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action ? <Button label={action} onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <EmptyState icon="cloud-offline-outline" tone="danger" title="Couldn't load this" body={message} action={onRetry ? "Try again" : undefined} onAction={onRetry} />;
}

/** Counts up to a number on change (dashboards). Instant when reduce motion is on. */
export function AnimatedNumber({
  value,
  format = (n) => formatMoney(n, { decimals: 0 }),
  variant = "display",
  color = "text",
  duration = 700
}: {
  value: number;
  format?: (n: number) => string;
  variant?: "display" | "hero" | "heading" | "title" | "bodyStrong";
  color?: ColorToken;
  duration?: number;
}) {
  const theme = useTheme();
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (theme.reduceMotion) return;
    let frame = 0;
    const start = Date.now();
    const from = current.current;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const next = from + (value - from) * (1 - Math.pow(1 - t, 3));
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, theme.reduceMotion]);
  const display = theme.reduceMotion ? value : shown;
  return (
    <Text variant={variant} color={color} tabular accessibilityLabel={format(value)}>
      {format(display)}
    </Text>
  );
}

/** Small stat tile. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "accent",
  onPress,
  children
}: {
  label: string;
  value?: string;
  hint?: string;
  icon?: IconName;
  tone?: Tone;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon ? <IconCircle icon={icon} tone={tone} size={30} /> : null}
        <Text variant="small" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      {children ?? (
        <Text variant="heading" tabular numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      )}
      {hint ? (
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </>
  );
  const style: StyleProp<ViewStyle> = {
    flex: 1,
    minWidth: 140,
    gap: 6,
    padding: theme.space[4],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: TOUCH
  };
  return onPress ? (
    <PressableScale onPress={onPress} style={style} scaleTo={0.97} accessibilityLabel={`${label}: ${value ?? ""}`}>
      {body}
    </PressableScale>
  ) : (
    <View style={style}>{body}</View>
  );
}
