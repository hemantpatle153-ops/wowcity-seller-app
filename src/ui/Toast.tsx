import { View } from "react-native";
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

export const useToasts = create<ToastState>((set) => ({
  items: [],
  show: (kind, message, action) => {
    const id = ++counter;
    set((s) => ({ items: [...s.items.slice(-2), { id, kind, message, action }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), action ? 6000 : 3200);
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
          <PressableScale
            onPress={() => dismiss(item.id)}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={item.message}
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
            <Text variant="small" weight="600" style={{ flex: 1 }}>
              {item.message}
            </Text>
            {item.action ? (
              <PressableScale
                onPress={() => {
                  item.action?.onPress();
                  dismiss(item.id);
                }}
                style={{ paddingHorizontal: 10, minHeight: 36, justifyContent: "center" }}
                accessibilityLabel={item.action.label}
              >
                <Text variant="small" weight="800" color="accent">
                  {item.action.label}
                </Text>
              </PressableScale>
            ) : null}
          </PressableScale>
        </Animated.View>
      ))}
    </View>
  );
}
