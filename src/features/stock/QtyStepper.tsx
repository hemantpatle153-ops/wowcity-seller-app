import { useState } from "react";
import { TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { Icon, PressableScale } from "@/ui";

/** − [typed qty] + with clamping; the number can also be typed for big counts. */
export function QtyStepper({ value, onChange, min = 1, max = 9999, label = "Quantity" }: { value: number; onChange: (value: number) => void; min?: number; max?: number; label?: string }) {
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const bump = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    if (clamped === value) {
      haptic.warning();
      return;
    }
    haptic.select();
    if (!theme.reduceMotion) {
      bump.set(1.15);
      bump.set(withSpring(1, { damping: 10, stiffness: 300 }));
    }
    onChange(clamped);
  };
  const button = (icon: "remove" | "add", delta: number, disabled: boolean) => (
    <PressableScale
      onPress={() => set(value + delta)}
      disabled={disabled}
      accessibilityLabel={`${delta < 0 ? "Decrease" : "Increase"} ${label.toLowerCase()}`}
      scaleTo={0.88}
      style={{ width: TOUCH, height: TOUCH, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceSunken }}
    >
      <Icon name={icon} size={22} color="text" />
    </PressableScale>
  );
  const t = theme.type("title");
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      {button("remove", -1, value <= min)}
      <Animated.View style={style}>
        <TextInput
          value={draft ?? formatQty(value)}
          onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, "").slice(0, 5))}
          onFocus={() => setDraft(String(value))}
          onBlur={() => {
            if (draft !== null && draft !== "") set(Number(draft));
            setDraft(null);
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={`${label}, type a number`}
          maxFontSizeMultiplier={1.4}
          selectionColor={theme.colors.accent}
          style={{
            minWidth: 64,
            height: TOUCH,
            textAlign: "center",
            fontSize: t.fontSize,
            fontWeight: "800",
            color: theme.colors.text,
            borderRadius: theme.radius.control,
            borderWidth: 1,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
            fontVariant: ["tabular-nums"],
            outlineWidth: 0
          }}
        />
      </Animated.View>
      {button("add", 1, value >= max)}
    </View>
  );
}
