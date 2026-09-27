import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import type { SpaceKey } from "@/theme/tokens";
import { PressableScale } from "./Pressable";

export function Row({
  children,
  gap = 2,
  align = "center",
  justify,
  wrap,
  style
}: {
  children: ReactNode;
  gap?: SpaceKey;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return <View style={[{ flexDirection: "row", alignItems: align, justifyContent: justify, gap: theme.space[gap], flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>;
}

export function Stack({ children, gap = 3, style }: { children: ReactNode; gap?: SpaceKey; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ gap: theme.space[gap] }, style]}>{children}</View>;
}

export function Spacer({ size = 4 }: { size?: SpaceKey }) {
  const theme = useTheme();
  return <View style={{ height: theme.space[size] }} />;
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ height: 1, backgroundColor: theme.colors.border, marginLeft: inset }, style]} />;
}

export function Card({
  children,
  style,
  padded = true,
  onPress,
  accessibilityLabel,
  raised
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  raised?: boolean;
}) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: raised ? theme.colors.surfaceRaised : theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: padded ? theme.space[4] : 0,
    ...(theme.scheme === "light" ? { shadowColor: theme.colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 } : null)
  };
  if (onPress)
    return (
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.985} style={[base, style]}>
        {children}
      </PressableScale>
    );
  return <View style={[base, style]}>{children}</View>;
}

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Pull to refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Leave space for a sticky footer (px). */
  footerSpace?: number;
  edges?: ("top" | "bottom")[];
  contentStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  header?: ReactNode;
  footer?: ReactNode;
};

/** Page container: theme background, safe areas, optional scroll with pull to refresh. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  onRefresh,
  refreshing = false,
  footerSpace = 0,
  edges = ["top"],
  contentStyle,
  keyboardShouldPersistTaps = "handled",
  header,
  footer
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const padding = padded ? theme.space[4] : 0;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: edges.includes("top") ? insets.top : 0 }}>
      {header}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ padding, paddingBottom: padding + footerSpace + (edges.includes("bottom") ? insets.bottom : 0) + 16, gap: theme.space[4] }, contentStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode="on-drag"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} colors={[theme.colors.accent]} progressBackgroundColor={theme.colors.surface} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding }, contentStyle]}>{children}</View>
      )}
      {footer}
    </View>
  );
}
