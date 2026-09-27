import { useEffect, useState } from "react";
import { ScrollView, Switch, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

/** Pill filter chip. */
export function Chip({ label, selected, onPress, icon, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; count?: number }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      scaleTo={0.94}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: theme.radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        marginVertical: 4
      }}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? "accentText" : "textMuted"} /> : null}
      <Text variant="small" weight="600" color={selected ? "accentText" : "text"}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="caption" weight="700" color={selected ? "accentText" : "textMuted"} tabular>
          {count}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** Horizontal scrolling single-select chip row. */
export function ChipRow<K extends string>({
  options,
  value,
  onChange,
  padded = true
}: {
  options: { key: K; label: string; count?: number; icon?: IconName }[];
  value: K;
  onChange: (key: K) => void;
  padded?: boolean;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: padded ? theme.space[4] : 0 }} style={{ flexGrow: 0 }}>
      {options.map((option) => (
        <Chip key={option.key} label={option.label} count={option.count} icon={option.icon} selected={option.key === value} onPress={() => onChange(option.key)} />
      ))}
    </ScrollView>
  );
}

/** Segmented control with a sliding indicator. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  accessibilityLabel
}: {
  options: { key: K; label: string; icon?: IconName }[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.key === value)
  );
  const x = useSharedValue(0);
  const segment = width / Math.max(1, options.length);
  useEffect(() => {
    x.set(theme.reduceMotion ? withTiming(index * segment, { duration: 0 }) : withSpring(index * segment, theme.motion.spring));
  }, [index, segment, theme.reduceMotion, theme.motion.spring, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 8)}
      style={{ flexDirection: "row", backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radius.control + 2, padding: 4, borderWidth: 1, borderColor: theme.colors.border }}
    >
      {width > 0 ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 4,
              left: 4,
              bottom: 4,
              width: segment,
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.surfaceRaised,
              borderWidth: 1,
              borderColor: theme.colors.border,
              shadowColor: theme.colors.shadow,
              shadowOpacity: 0.08,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 }
            },
            indicator
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <PressableScale
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (!selected) haptic.select();
              onChange(option.key);
            }}
            scaleTo={0.96}
            style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}
          >
            {option.icon ? <Icon name={option.icon} size={16} color={selected ? "accent" : "textMuted"} /> : null}
            <Text variant="small" weight={selected ? "700" : "500"} color={selected ? "text" : "textMuted"} numberOfLines={1}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Quantity stepper: big − / + targets with the value springing on change. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  label = "Quantity",
  compact
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const bump = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const change = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next * 1000) / 1000));
    if (clamped === value) {
      haptic.warning();
      return;
    }
    haptic.select();
    if (!theme.reduceMotion) {
      bump.set(1.25);
      bump.set(withSpring(1, { damping: 10, stiffness: 300 }));
    }
    onChange(clamped);
  };
  const size = compact ? 40 : TOUCH;
  const button = (icon: IconName, delta: number, a11y: string, disabled: boolean) => (
    <PressableScale
      onPress={() => change(value + delta)}
      disabled={disabled}
      accessibilityLabel={a11y}
      scaleTo={0.88}
      hitSlop={4}
      style={{ width: size, height: size, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSunken }}
    >
      <Icon name={icon} size={20} color="text" />
    </PressableScale>
  );
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => change(value + (e.nativeEvent.actionName === "increment" ? step : -step))}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      {button(value - step <= 0 ? "trash-outline" : "remove", -step, value - step <= 0 ? "Remove" : `Decrease ${label}`, value <= min && min > 0)}
      <Animated.View style={[{ minWidth: 36, alignItems: "center" }, style]}>
        <Text variant="title" tabular weight="700">
          {value}
        </Text>
      </Animated.View>
      {button("add", step, `Increase ${label}`, value >= max)}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, icon, disabled }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; icon?: IconName; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptic.select();
        onChange(!value);
      }}
      disabled={disabled}
      scaleTo={0.99}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 }}
    >
      {icon ? <Icon name={icon} size={22} color="textMuted" /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" weight="500">
          {label}
        </Text>
        {hint ? (
          <Text variant="small" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          haptic.select();
          onChange(next);
        }}
        disabled={disabled}
        trackColor={{ true: theme.colors.accent, false: theme.colors.borderStrong }}
        thumbColor={theme.colors.surfaceRaised}
        ios_backgroundColor={theme.colors.borderStrong}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    </PressableScale>
  );
}
