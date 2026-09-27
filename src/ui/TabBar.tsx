import type { BottomTabBarProps } from "expo-router/tabs";
import { View } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/lib/haptics";
import { useQueueCount } from "@/offline/useQueue";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { NetworkBanner } from "./NetworkBanner";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

export const tabMeta: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  home: { label: "Home", icon: "home-outline", iconActive: "home" },
  sell: { label: "Sell", icon: "cart-outline", iconActive: "cart" },
  bills: { label: "Bills", icon: "receipt-outline", iconActive: "receipt" },
  purchase: { label: "Purchase", icon: "cube-outline", iconActive: "cube" },
  stock: { label: "Stock", icon: "layers-outline", iconActive: "layers" },
  more: { label: "More", icon: "grid-outline", iconActive: "grid" },
  profile: { label: "Profile", icon: "person-circle-outline", iconActive: "person-circle" }
};

function TabItem({ name, focused, onPress, badge }: { name: string; focused: boolean; onPress: () => void; badge?: number }) {
  const theme = useTheme();
  const meta = tabMeta[name];
  const pill = useAnimatedStyle(() => ({
    opacity: theme.reduceMotion ? (focused ? 1 : 0) : withTiming(focused ? 1 : 0, { duration: 180 }),
    transform: [{ scaleX: theme.reduceMotion ? 1 : withSpring(focused ? 1 : 0.4, { damping: 16, stiffness: 260 }) }]
  }));
  if (!meta) return null;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={badge ? `${meta.label}, ${badge} waiting` : meta.label}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 56, gap: 2 }}
    >
      <View style={{ width: 60, height: 32, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{ position: "absolute", width: 60, height: 32, borderRadius: 16, backgroundColor: theme.colors.accentSoft }, pill]} />
        <Icon name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? "accentSoftText" : "textMuted"} />
        {badge ? (
          <View
            style={{
              position: "absolute",
              top: -2,
              right: 8,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: theme.colors.warning,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
              borderWidth: 2,
              borderColor: theme.colors.surface
            }}
          >
            <Icon name="time" size={10} color="surface" />
          </View>
        ) : null}
      </View>
      <Text variant="caption" weight={focused ? "700" : "500"} color={focused ? "text" : "textMuted"} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {meta.label}
      </Text>
    </PressableScale>
  );
}

/** Bottom tabs: only the tabs this person may use, with a springy active pill and haptics. */
export function TabBar({ state, navigation, visible }: BottomTabBarProps & { visible: readonly string[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queued = useQueueCount();
  return (
    <View>
      <NetworkBanner />
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          paddingHorizontal: 4,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border
        }}
      >
        {state.routes
          .filter((route) => visible.includes(route.name))
          .map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            return (
              <TabItem
                key={route.key}
                name={route.name}
                focused={focused}
                badge={(route.name === "bills" || (route.name === "sell" && !visible.includes("bills"))) && queued ? queued : undefined}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    haptic.select();
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
      </View>
    </View>
  );
}
