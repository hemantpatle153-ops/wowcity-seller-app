import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text, type ColorToken } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "success";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "md" | "lg" | "sm";
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({ label, onPress, variant = "primary", size = "md", icon, iconRight, loading, disabled, fullWidth, style, accessibilityLabel, accessibilityHint, testID }: ButtonProps) {
  const theme = useTheme();
  const c = theme.colors;
  const palette: Record<ButtonVariant, { bg: string; fg: ColorToken; border?: string }> = {
    primary: { bg: c.accent, fg: "accentText" },
    success: { bg: c.success, fg: theme.scheme === "dark" ? "bg" : "surface" },
    danger: { bg: c.danger, fg: theme.scheme === "dark" ? "bg" : "surface" },
    secondary: { bg: c.surface, fg: "text", border: c.borderStrong },
    soft: { bg: c.accentSoft, fg: "accentSoftText" },
    ghost: { bg: "transparent", fg: "accent" }
  };
  const p = palette[variant];
  const height = size === "lg" ? 56 : size === "sm" ? 40 : TOUCH;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      hapticOnPress={variant === "primary" || variant === "success"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      hitSlop={size === "sm" ? 4 : 0}
      style={[
        {
          minHeight: height,
          paddingHorizontal: size === "sm" ? 14 : 20,
          borderRadius: theme.radius.control,
          backgroundColor: p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          alignSelf: fullWidth ? "stretch" : "auto"
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c[p.fg]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} color={p.fg} /> : null}
          <Text variant={size === "lg" ? "title" : size === "sm" ? "small" : "bodyStrong"} weight="700" color={p.fg} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={18} color={p.fg} /> : null}
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color = "text",
  variant = "plain",
  size = 22,
  disabled,
  badge
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: ColorToken;
  variant?: "plain" | "filled" | "soft";
  size?: number;
  disabled?: boolean;
  badge?: number | boolean;
}) {
  const theme = useTheme();
  const bg = variant === "filled" ? theme.colors.accent : variant === "soft" ? theme.colors.surfaceSunken : "transparent";
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      scaleTo={0.9}
      style={{ width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: "center", justifyContent: "center", backgroundColor: bg }}
    >
      <Icon name={icon} size={size} color={variant === "filled" ? "accentText" : color} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: theme.colors.danger,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {typeof badge === "number" ? (
            <Text variant="caption" color={theme.scheme === "dark" ? "bg" : "surface"} style={{ fontSize: 10, lineHeight: 12 }} weight="800">
              {badge > 99 ? "99+" : badge}
            </Text>
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}
