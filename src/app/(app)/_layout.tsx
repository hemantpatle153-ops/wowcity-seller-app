import { Redirect, Stack, usePathname } from "expo-router";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme/ThemeProvider";

export default function AppLayout() {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const storeId = useSession((s) => s.storeId);
  const pathname = usePathname();
  // Billing needs a store: ask once when the person works in several.
  if (me && !storeId && me.stores.length !== 1 && pathname !== "/store-picker") return <Redirect href="/store-picker" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg }, animation: theme.reduceMotion ? "none" : "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="store-picker" options={{ animation: theme.reduceMotion ? "none" : "fade_from_bottom" }} />
    </Stack>
  );
}
