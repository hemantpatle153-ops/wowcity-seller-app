import { forwardRef, useState, type ReactNode } from "react";
import { TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  prefix?: string;
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** Show/hide toggle for passwords and PINs. */
  secureToggle?: boolean;
  large?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, icon, prefix, right, containerStyle, secureToggle, secureTextEntry, large, style, onFocus, onBlur, ...rest },
  ref
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const border = error ? theme.colors.danger : focused ? theme.colors.accent : theme.colors.borderStrong;
  const t = theme.type(large ? "title" : "body");
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? (
        <Text variant="small" weight="600" color="textMuted">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: large ? 56 : TOUCH,
          borderRadius: theme.radius.control,
          borderWidth: focused || error ? 2 : 1,
          borderColor: border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: focused || error ? 11 : 12,
          gap: 8
        }}
      >
        {icon ? <Icon name={icon} size={20} color="textMuted" /> : null}
        {prefix ? (
          <Text variant="body" color="textMuted">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={theme.colors.textFaint}
          selectionColor={theme.colors.accent}
          secureTextEntry={secureTextEntry && (!secureToggle || hidden)}
          maxFontSizeMultiplier={1.4}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[{ flex: 1, color: theme.colors.text, fontSize: t.fontSize, paddingVertical: 10, fontWeight: large ? "600" : "400", outlineWidth: 0 }, style]}
          {...rest}
        />
        {secureTextEntry && secureToggle ? (
          <IconButton icon={hidden ? "eye-outline" : "eye-off-outline"} label={hidden ? "Show" : "Hide"} color="textMuted" onPress={() => setHidden(!hidden)} size={20} />
        ) : null}
        {right}
      </View>
      {error ? (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Icon name="alert-circle" size={16} color="danger" />
          <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="small" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/** Rounded search field with clear button. */
export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search",
  right,
  autoFocus,
  onSubmitEditing
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  right?: ReactNode;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: TOUCH,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceSunken,
        paddingLeft: 14,
        gap: 6,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <Icon name="search" size={20} color="textMuted" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        selectionColor={theme.colors.accent}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        maxFontSizeMultiplier={1.4}
        style={{ flex: 1, color: theme.colors.text, fontSize: theme.type("body").fontSize, paddingVertical: 10, outlineWidth: 0 }}
      />
      {value ? <IconButton icon="close-circle" label="Clear search" color="textMuted" size={20} onPress={() => onChangeText("")} /> : <View style={{ width: 8 }} />}
      {right}
    </View>
  );
}
