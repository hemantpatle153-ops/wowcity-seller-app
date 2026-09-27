import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { usePreferences } from "@/state/preferences";

/** Haptic feedback that respects Settings → Appearance → Haptics and is silent on web. */
function enabled() {
  return Platform.OS !== "web" && usePreferences.getState().haptics;
}

export const haptic = {
  tap() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  select() {
    if (enabled()) Haptics.selectionAsync().catch(() => undefined);
  },
  heavy() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  success() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  warning() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
  error() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }
};
