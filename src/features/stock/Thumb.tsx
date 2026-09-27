import { Image } from "expo-image";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "@/ui";

/**
 * Product thumbnail. Stock rows only carry an R2 object key (not a URL), so they pass no `url`
 * and get a tidy placeholder; screens with real image URLs pass them in.
 */
export function Thumb({ url, size = 52, icon = "shirt-outline", radius }: { url?: string | null; size?: number; icon?: IconName; radius?: number }) {
  const theme = useTheme();
  const r = radius ?? theme.radius.control + 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: theme.colors.surfaceSunken,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden"
      }}
    >
      <Icon name={icon} size={size * 0.44} color="textFaint" />
      {url ? (
        <Image source={{ uri: url }} style={{ position: "absolute", top: 0, left: 0, width: size, height: size }} contentFit="cover" transition={theme.reduceMotion ? 0 : 180} recyclingKey={url} />
      ) : null}
    </View>
  );
}
