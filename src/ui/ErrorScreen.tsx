import type { ErrorBoundaryProps } from "expo-router";
import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "./Button";
import { EmptyState } from "./Display";
import { Text } from "./Text";

/**
 * Shown by Expo Router when a screen throws. Bills and waiting offline bills are stored separately,
 * so nothing is lost; the person can retry or go back to billing.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16, paddingHorizontal: 16, justifyContent: "center" }}>
      <EmptyState icon="bug-outline" tone="danger" title="Something went wrong on this screen" body="Your bills and anything waiting to sync are safe. Try again, or go back to billing." />
      <View style={{ gap: 8 }}>
        <Button label="Try again" icon="refresh" size="lg" onPress={() => void retry()} fullWidth />
        <Button label="Back to billing" variant="ghost" onPress={() => router.replace("/")} fullWidth />
        {__DEV__ ? (
          <Text variant="caption" color="textFaint" selectable>
            {error.message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
