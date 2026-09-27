import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOCK_MODE } from "@/api/config";
import { demoCredentials } from "@/mock/server";
import { useSession } from "@/auth/session";
import { mix } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Icon, Stack, Text } from "@/ui";
import { BrandMark } from "@/ui/Brand";

export default function Welcome() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const endedReason = useSession((s) => s.endedReason);
  const enter = (delay: number) => (theme.reduceMotion ? undefined : FadeInDown.delay(delay).springify().damping(18));
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <LinearGradient
        colors={[mix(theme.colors.bg, theme.colors.accent, theme.scheme === "dark" ? 0.28 : 0.16), theme.colors.bg]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 420 }}
      />
      <View
        style={{ flex: 1, paddingTop: insets.top + 48, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, justifyContent: "space-between", maxWidth: 560, width: "100%", alignSelf: "center" }}
      >
        <Animated.View entering={enter(0)} style={{ gap: 20 }}>
          <BrandMark size={72} />
          <View style={{ gap: 8 }}>
            <Text variant="hero" accessibilityRole="header">
              WowCity Seller
            </Text>
            <Text variant="title" color="textMuted" weight="400">
              Billing, stock and dues for your shop. Works even when the internet doesn&apos;t.
            </Text>
          </View>
          <Stack gap={2}>
            {[
              ["scan-outline", "Scan barcodes with your camera"],
              ["cloud-offline-outline", "Keep billing offline, sync later"],
              ["print-outline", "Print or WhatsApp receipts"]
            ].map(([icon, label], i) => (
              <Animated.View key={label} entering={enter(120 + i * 70)} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Icon name={icon as "scan-outline"} size={20} color="accent" />
                <Text variant="body" color="textMuted">
                  {label}
                </Text>
              </Animated.View>
            ))}
          </Stack>
        </Animated.View>

        <Animated.View entering={enter(320)} style={{ gap: 12 }}>
          {endedReason ? (
            <Card style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft }}>
              <Icon name="information-circle" color="warning" />
              <Text variant="small" color="warning" weight="600" style={{ flex: 1 }}>
                {endedReason}
              </Text>
            </Card>
          ) : null}
          {MOCK_MODE && demoCredentials ? (
            <Card style={{ gap: 6 }}>
              <Badge label="Demo mode" tone="info" />
              <Text variant="small" color="textMuted">
                {demoCredentials}
              </Text>
            </Card>
          ) : null}
          <Button label="Sign in as owner" icon="storefront-outline" size="lg" onPress={() => router.push("/(auth)/owner")} fullWidth />
          <Button label="Staff sign in" icon="people-outline" variant="secondary" size="lg" onPress={() => router.push("/(auth)/staff")} fullWidth />
          <Button label="New here? Create your shop" variant="ghost" onPress={() => router.push("/(auth)/signup")} fullWidth />
        </Animated.View>
      </View>
    </View>
  );
}
