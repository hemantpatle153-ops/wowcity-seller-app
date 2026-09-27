import { AccessibilityInfo, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

type ToastKind = "success" | "error" | "info" | "warning";
type ToastItem = { id: number; kind: ToastKind; message: string; action?: { label: string; onPress: () => void } };

type ToastState = { items: ToastItem[]; show: (kind: ToastKind, message: string, action?: ToastItem["action"]) => void; dismiss: (id: number) => void };

let counter = 0;

// With a screen reader on, toasts (and their Undo) stay long enough to reach.
let screenReader = false;
AccessibilityInfo.isScreenReaderEnabled()
  .then((on) => (screenReader = on))
  .catch(() => undefined);
AccessibilityInfo.addEventListener("screenReaderChanged", (on) => (screenReader = on));

export const useToasts = create<ToastState>((set) => ({
  items: [],
  show: (kind, message, action) => {
    const id = ++counter;
    // A new plain toast replaces the previous one of the same kind (fast scanning shows one "Added…"),
    // while toasts with an action (Undo) stay until they time out.
    set((s) => ({ items: [...s.items.filter((t) => t.action || t.kind !== kind).slice(-1), { id, kind, message, action }] }));
    if (screenReader) AccessibilityInfo.announceForAccessibility(message);
    const ms = (action ? 6000 : 3200) * (screenReader ? 3 : 1);
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), ms);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}));

/** Fire-and-forget notifications. `toast.success("Bill saved")`. */
export const toast = {
  success: (message: string, action?: ToastItem["action"]) => {
    haptic.success();
    useToasts.getState().show("success", message, action);
  },
  error: (message: string, action?: ToastItem["action"]) => {
    haptic.error();
    useToasts.getState().show("error", message, action);
  },
  info: (message: string, action?: ToastItem["action"]) => useToasts.getState().show("info", message, action),
  warning: (message: string, action?: ToastItem["action"]) => {
    haptic.warning();
    useToasts.getState().show("warning", message, action);
  }
};

const icons: Record<ToastKind, IconName> = { success: "checkmark-circle", error: "alert-circle", info: "information-circle", warning: "warning" };
const colors = { success: "success", error: "danger", info: "info", warning: "warning" } as const;

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, alignItems: "center", gap: 8 }}>
      {items.map((item) => (
        <Animated.View
          key={item.id}
          entering={theme.reduceMotion ? undefined : FadeInUp.springify().damping(18)}
          exiting={theme.reduceMotion ? undefined : FadeOutUp.duration(160)}
          layout={theme.reduceMotion ? undefined : LinearTransition}
          style={{ width: "100%", maxWidth: 520 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.surfaceRaised,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderLeftWidth: 4,
              borderLeftColor: theme.colors[colors[item.kind]],
              shadowColor: theme.colors.shadow,
              shadowOpacity: 0.18,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6
            }}
          >
            <Icon name={icons[item.kind]} size={22} color={colors[item.kind]} />
            {/* The message is its own element, so a screen reader reaches the action and close buttons separately. */}
            <Text variant="small" weight="600" style={{ flex: 1 }} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {item.message}
            </Text>
            {item.action ? (
              <PressableScale
                onPress={() => {
                  item.action?.onPress();
                  dismiss(item.id);
                }}
                style={{ paddingHorizontal: 10, minHeight: 44, justifyContent: "center" }}
                accessibilityLabel={item.action.label}
              >
                <Text variant="small" weight="800" color="accent">
                  {item.action.label}
                </Text>
              </PressableScale>
            ) : null}
            <PressableScale onPress={() => dismiss(item.id)} accessibilityLabel="Dismiss" hitSlop={8} style={{ minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={18} color="textMuted" />
            </PressableScale>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
