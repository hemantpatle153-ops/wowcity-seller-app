import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, IconButton, Input, PressableScale, Text } from "@/ui";
import { normaliseTags } from "./editForm";

/**
 * Chip editor for tags and option lists. Type and press return (or a comma) to add; tap a chip's ✕ to remove.
 */
export function TagEditor({
  label,
  value,
  onChange,
  max = 25,
  placeholder = "Add a tag",
  hint,
  error,
  disabled
}: {
  label?: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const full = value.length >= max;

  const add = (raw: string) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    if (full) {
      haptic.warning();
      return;
    }
    const next = normaliseTags([...value, ...parts], max);
    if (next.length === value.length) haptic.warning();
    else haptic.select();
    onChange(next);
    setText("");
  };

  const remove = (tag: string) => {
    haptic.select();
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <View style={{ gap: 8 }}>
      <Input
        label={label}
        value={text}
        editable={!disabled && !full}
        onChangeText={(t) => {
          if (t.includes(",")) add(t);
          else setText(t);
        }}
        onSubmitEditing={() => add(text)}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={full ? `Limit of ${max} reached` : placeholder}
        autoCapitalize="none"
        error={error}
        hint={hint ?? `${value.length}/${max} · press return or type a comma to add`}
        right={text.trim() ? <IconButton icon="add-circle" label={`Add ${text.trim()}`} color="accent" onPress={() => add(text)} /> : undefined}
      />
      {value.length ? (
        <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition.duration(180)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {value.map((tag) => (
            <Animated.View key={tag} entering={theme.reduceMotion ? undefined : FadeIn.duration(160)} exiting={theme.reduceMotion ? undefined : FadeOut.duration(120)}>
              <PressableScale
                onPress={() => !disabled && remove(tag)}
                disabled={disabled}
                accessibilityLabel={`${tag}. Remove`}
                scaleTo={0.94}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 40,
                  paddingLeft: 12,
                  paddingRight: 10,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.accentSoft
                }}
              >
                <Text variant="small" weight="600" color="accentSoftText" numberOfLines={1} style={{ maxWidth: 220 }}>
                  {tag}
                </Text>
                {!disabled ? <Icon name="close" size={16} color="accentSoftText" /> : null}
              </PressableScale>
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
