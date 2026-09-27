import { router } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "./Button";
import { Text } from "./Text";

/** Screen header: back button, title (large on top-level screens) and right-side actions. */
export function Header({ title, subtitle, back, large, right, onBack }: { title: string; subtitle?: string; back?: boolean; large?: boolean; right?: ReactNode; onBack?: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: back ? theme.space[1] : theme.space[4],
        paddingTop: theme.space[2],
        paddingBottom: theme.space[2],
        minHeight: 56,
        gap: theme.space[1],
        backgroundColor: theme.colors.bg
      }}
    >
      {back ? <IconButton icon="chevron-back" label="Go back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant={large ? "display" : "title"} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center" }}>{right}</View> : null}
    </View>
  );
}
