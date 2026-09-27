import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Divider, Icon, ListRow, SkeletonList, Text } from "@/ui";
import type { CatalogHit } from "./catalog";

export function SearchResults({
  items,
  loading,
  source,
  onPick,
  query
}: {
  items: CatalogHit[] | undefined;
  loading: boolean;
  source?: "server" | "offline";
  onPick: (hit: CatalogHit) => void;
  query: string;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={theme.reduceMotion ? undefined : FadeIn.duration(120)}
      style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden", maxHeight: 420 }}
    >
      {source === "offline" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.colors.warningSoft }}>
          <Icon name="cloud-offline-outline" size={14} color="warning" />
          <Text variant="caption" color="warning" weight="700">
            From this phone&apos;s catalogue · stock may be out of date
          </Text>
        </View>
      ) : null}
      {loading && !items ? <SkeletonList rows={3} withAvatar={false} /> : null}
      {items?.map((hit, i) => (
        <View key={hit.variantId}>
          {i > 0 ? <Divider inset={16} /> : null}
          <ListRow
            title={hit.itemName}
            subtitle={[hit.brand, hit.detail, hit.barcode].filter(Boolean).join(" · ")}
            value={formatMoney(hit.rate)}
            right={
              hit.availableQty <= 0 ? (
                <Badge label="Out" tone="danger" />
              ) : hit.availableQty <= 5 ? (
                <Badge label={`${hit.availableQty} left`} tone="warning" showIcon={false} />
              ) : (
                <Badge label={`${hit.availableQty}`} tone="neutral" icon="cube-outline" />
              )
            }
            onPress={() => onPick(hit)}
            accessibilityHint="Adds to the bill"
          />
        </View>
      ))}
      {items && !items.length && !loading ? (
        <Text variant="body" color="textMuted" align="center" style={{ padding: 20 }}>
          Nothing matches “{query}”.
        </Text>
      ) : null}
    </Animated.View>
  );
}
