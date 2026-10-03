import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { resetLocalData } from "@/auth/localData";
import { onSignedOut, useSession } from "@/auth/session";
import { startUpdateChecks } from "@/lib/updates";
import { initOffline, startQueueAutoSync, syncNow } from "@/offline/useQueue";
import { startConnectivityMonitor } from "@/state/connectivity";
import { queryClient } from "@/state/queryClient";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { ThemeFade } from "@/theme/ThemeFade";
import { ConfirmHost, ToastHost } from "@/ui";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Root() {
  const theme = useTheme();
  const status = useSession((s) => s.status);
  const storeId = useSession((s) => s.storeId);

  useEffect(() => {
    const stopNet = startConnectivityMonitor();
    const stopQueue = startQueueAutoSync(() => useSession.getState().storeId);
    const stopUpdates = startUpdateChecks();
    const stopReset = onSignedOut(resetLocalData);
    void initOffline().finally(() => useSession.getState().bootstrap());
    return () => {
      stopNet();
      stopQueue();
      stopUpdates();
      stopReset();
    };
  }, []);

  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  useEffect(() => {
    if (status === "signedIn") void syncNow(storeId);
  }, [status, storeId]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => undefined);
  }, [theme.colors.bg]);

  if (status === "loading") return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  const signedIn = status === "signedIn";
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg }, animation: theme.reduceMotion ? "none" : "slide_from_right" }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <ThemeFade />
      <ToastHost />
      <ConfirmHost />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <Root />
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
