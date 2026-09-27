import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useConnectivity } from "@/state/connectivity";
import { useQueueCount } from "@/offline/useQueue";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Calm, not alarming: a slim bar saying we're offline and how many bills are waiting. */
export function NetworkBanner() {
  const theme = useTheme();
  const online = useConnectivity((s) => s.online);
  const queued = useQueueCount();
  if (online && queued === 0) return null;
  const text = !online
    ? queued
      ? `Offline · ${queued} bill${queued === 1 ? "" : "s"} will sync when you're back online`
      : "Offline · billing still works, bills sync later"
    : `Syncing ${queued} bill${queued === 1 ? "" : "s"}…`;
  return (
    <Animated.View
      entering={theme.reduceMotion ? undefined : FadeInUp.duration(200)}
      exiting={theme.reduceMotion ? undefined : FadeOutUp.duration(160)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: online ? theme.colors.infoSoft : theme.colors.warningSoft }}
    >
      <Icon name={online ? "sync" : "cloud-offline-outline"} size={16} color={online ? "info" : "warning"} />
      <Text variant="small" weight="600" color={online ? "info" : "warning"} style={{ flex: 1 }}>
        {text}
      </Text>
    </Animated.View>
  );
}
