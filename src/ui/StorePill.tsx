import { router } from "expo-router";
import { useCurrentStore, useSession } from "@/auth/session";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

/** Current store as a tappable pill; opens the store picker when there's more than one. */
export function StorePill() {
  const theme = useTheme();
  const store = useCurrentStore();
  const count = useSession((s) => s.me?.stores.length ?? 0);
  return (
    <PressableScale
      onPress={() => count > 1 && router.push("/store-picker")}
      disabled={count <= 1}
      accessibilityLabel={`Store: ${store?.name ?? "none"}${count > 1 ? ". Tap to switch" : ""}`}
      scaleTo={0.95}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceSunken,
        borderWidth: 1,
        borderColor: theme.colors.border,
        maxWidth: 220
      }}
    >
      <Icon name="storefront-outline" size={16} color="textMuted" />
      <Text variant="small" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
        {store?.name ?? "Choose store"}
      </Text>
      {count > 1 ? <Icon name="chevron-down" size={14} color="textMuted" /> : null}
    </PressableScale>
  );
}
