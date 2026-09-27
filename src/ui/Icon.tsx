import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import type { ColorToken } from "./Text";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** `tint` is for icons over camera/photos only (use `media` tokens). */
export function Icon({ name, size = 22, color = "text", tint, accessibilityLabel }: { name: IconName; size?: number; color?: ColorToken; tint?: string; accessibilityLabel?: string }) {
  const theme = useTheme();
  return (
    <Ionicons
      name={name}
      size={Math.round(size * Math.min(theme.fontScale, 1.2))}
      color={tint ?? theme.colors[color]}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no-hide-descendants"}
    />
  );
}
