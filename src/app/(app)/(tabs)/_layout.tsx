import { Tabs } from "expo-router";
import { View } from "react-native";
import { tabsFor } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme/ThemeProvider";
import { TabBar } from "@/ui/TabBar";

export default function TabsLayout() {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const visible = tabsFor(me);
  const hidden = (name: string) => (visible.includes(name as never) ? {} : { href: null });
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Tabs
        initialRouteName={visible[0]}
        tabBar={(props) => <TabBar {...props} visible={visible} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.bg }, animation: theme.reduceMotion ? "none" : "shift" }}
      >
        <Tabs.Screen name="home" options={hidden("home")} />
        <Tabs.Screen name="sell" options={hidden("sell")} />
        <Tabs.Screen name="bills" options={hidden("bills")} />
        <Tabs.Screen name="purchase" options={hidden("purchase")} />
        <Tabs.Screen name="stock" options={hidden("stock")} />
        <Tabs.Screen name="more" options={hidden("more")} />
        <Tabs.Screen name="profile" options={hidden("profile")} />
      </Tabs>
    </View>
  );
}
