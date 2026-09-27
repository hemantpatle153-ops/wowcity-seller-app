import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/** Six boxes for a one-time code or PIN; autofills from SMS on both platforms. */
export function CodeInput({
  value,
  onChange,
  length = 6,
  secure,
  autoFocus = true,
  error,
  onComplete,
  label = "Code"
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  secure?: boolean;
  autoFocus?: boolean;
  error?: boolean;
  onComplete?: (value: string) => void;
  label?: string;
}) {
  const theme = useTheme();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={`${label}, ${value.length} of ${length} digits entered`} accessibilityRole="none">
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
        {Array.from({ length }).map((_, i) => {
          const char = value[i];
          const active = focused && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 52,
                height: 60,
                borderRadius: theme.radius.control,
                borderWidth: active ? 2 : 1,
                borderColor: error ? theme.colors.danger : active ? theme.colors.accent : theme.colors.borderStrong,
                backgroundColor: theme.colors.surface,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text variant="heading" tabular>
                {char ? (secure ? "•" : char) : ""}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType={secure ? "password" : "oneTimeCode"}
        autoComplete={secure ? "off" : "sms-otp"}
        maxLength={length}
        caretHidden
        accessibilityLabel={label}
        style={{ position: "absolute", opacity: 0.01, width: 1, height: 1 }}
      />
    </Pressable>
  );
}
