import { memo } from "react";
import { View } from "react-native";
import type { StockItem } from "@/api/types";
import { formatMoney, formatQty } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Icon, PressableScale, Text } from "@/ui";
import { shortStoreName, stockLabel, stockStatusOf, stockTone, variantLine } from "./stockLogic";
import { Thumb } from "./Thumb";

export const StockRow = memo(function StockRow({
  item,
  stores,
  showStores,
  onPress
}: {
  item: StockItem;
  stores: { id: string; name: string }[];
  showStores: boolean;
  onPress: (item: StockItem) => void;
}) {
  const theme = useTheme();
  const qty = formatQty(item.qty);
  const status = stockStatusOf(item.qty);
  const detail = [variantLine(item), item.brand].filter(Boolean).join(" · ");
  const discount = item.mrp > item.saleRate;
  const perStore = showStores ? stores.map((s) => ({ ...s, qty: item.byStore[s.id] ?? 0 })) : [];
  return (
    <PressableScale
      onPress={() => onPress(item)}
      scaleTo={0.985}
      accessibilityLabel={[item.name, detail, formatMoney(item.saleRate), stockLabel(item.qty, qty), item.barcode ? `barcode ${item.barcode}` : null].filter(Boolean).join(", ")}
      accessibilityHint="Opens item details"
      style={{
        marginHorizontal: theme.space[4],
        marginBottom: theme.space[2],
        padding: theme.space[3],
        gap: theme.space[2],
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: status === "out" ? theme.colors.dangerSoft : theme.colors.border
      }}
    >
      <View style={{ flexDirection: "row", gap: theme.space[3], alignItems: "flex-start" }}>
        <Thumb url={item.image} size={52} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {item.name}
          </Text>
          {detail ? (
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {item.barcode ? (
              <>
                <Icon name="barcode-outline" size={14} color="textFaint" />
                <Text variant="caption" color="textFaint" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
                  {item.barcode}
                </Text>
              </>
            ) : (
              <Text variant="caption" color="textFaint">
                No barcode
              </Text>
            )}
            {item.isPublic ? <Icon name="globe-outline" size={14} color="success" accessibilityLabel="Listed on WowCity" /> : null}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6, maxWidth: "42%" }}>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="bodyStrong" tabular numberOfLines={1}>
              {formatMoney(item.saleRate)}
            </Text>
            {discount ? (
              <Text variant="caption" color="textFaint" tabular style={{ textDecorationLine: "line-through" }} numberOfLines={1}>
                {formatMoney(item.mrp)}
              </Text>
            ) : null}
          </View>
          <View>
            <Badge label={status === "out" ? (item.qty < 0 ? `${qty} · Out` : "Out") : status === "low" ? `${qty} · Low` : `${qty} pcs`} tone={stockTone(item.qty)} showIcon={status !== "in"} />
          </View>
        </View>
      </View>
      {perStore.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 52 + theme.space[3] }}>
          {perStore.map((s) => (
            <View
              key={s.id}
              style={{
                flexDirection: "row",
                gap: 4,
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.surfaceSunken
              }}
            >
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {shortStoreName(s.name)}
              </Text>
              <Text variant="caption" weight="700" color={s.qty <= 0 ? "danger" : "text"} tabular>
                {formatQty(s.qty)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </PressableScale>
  );
});
