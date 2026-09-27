import { View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { formatMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Icon, PressableScale, Stepper, Text } from "@/ui";
import type { CartLine } from "./cart";

function DeleteAction({ drag }: { drag: SharedValue<number> }) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => ({ transform: [{ scale: Math.min(1, Math.max(0.6, -drag.get() / 90)) }] }));
  return (
    <View style={{ width: 96, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.danger, borderRadius: theme.radius.card, marginLeft: 8 }}>
      <Animated.View style={[{ alignItems: "center", gap: 2 }, style]}>
        <Icon name="trash" color={theme.scheme === "dark" ? "bg" : "surface"} />
        <Text variant="caption" weight="700" color={theme.scheme === "dark" ? "bg" : "surface"}>
          Remove
        </Text>
      </Animated.View>
    </View>
  );
}

/** One cart line: swipe left to remove, stepper for qty, tap to edit price/discount. */
export function CartLineRow({
  line,
  net,
  onQty,
  onRemove,
  onEdit,
  returnMode,
  offline
}: {
  line: CartLine;
  net: number;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onEdit?: () => void;
  returnMode?: boolean;
  offline?: boolean;
}) {
  const theme = useTheme();
  const discounted = line.discountAmount > 0 || line.discountPercent > 0 || line.rate < line.mrp;
  const lowStock = !returnMode && line.availableQty !== null && line.qty > line.availableQty;
  return (
    <Animated.View
      entering={theme.reduceMotion ? undefined : FadeIn.springify().damping(18)}
      exiting={theme.reduceMotion ? undefined : FadeOut.duration(150)}
      layout={theme.reduceMotion ? undefined : LinearTransition.springify().damping(20)}
    >
      <ReanimatedSwipeable
        friction={1.6}
        rightThreshold={60}
        overshootRight={false}
        renderRightActions={(_progress, drag) => <DeleteAction drag={drag} />}
        onSwipeableWillOpen={() => haptic.heavy()}
        onSwipeableOpen={() => onRemove()}
      >
        <PressableScale
          onPress={onEdit}
          disabled={!onEdit}
          scaleTo={0.99}
          accessibilityLabel={`${line.itemName} ${line.detail}, ${line.qty} at ${formatMoney(line.unitRefund ?? line.rate)}, total ${formatMoney(net)}`}
          accessibilityHint={onEdit ? "Tap to change price or discount. Swipe left to remove." : "Swipe left to remove."}
          accessibilityActions={[{ name: "delete", label: "Remove" }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === "delete" && onRemove()}
          style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: lowStock ? theme.colors.warning : theme.colors.border, padding: 12, gap: 8 }}
        >
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {line.itemName}
              </Text>
              <Text variant="small" color="textMuted" numberOfLines={1}>
                {[line.detail, line.barcode].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="title" tabular>
                {formatMoney(net)}
              </Text>
              {discounted && line.mrp > 0 ? (
                <Text variant="caption" color="textFaint" tabular style={{ textDecorationLine: "line-through" }}>
                  {formatMoney(line.mrp * line.qty)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <Text variant="small" color="textMuted" tabular>
                {formatMoney(line.unitRefund ?? line.rate)} each
              </Text>
              {line.discountPercent > 0 ? <Badge label={`−${line.discountPercent}%`} tone="success" showIcon={false} /> : null}
              {line.discountAmount > 0 ? <Badge label={`−${formatMoney(line.discountAmount)}`} tone="success" showIcon={false} /> : null}
              {lowStock ? (
                <Badge label={line.availableQty && line.availableQty > 0 ? `Only ${line.availableQty} in stock` : offline ? "Out of stock (offline)" : "Out of stock"} tone="warning" />
              ) : null}
              {returnMode && line.maxQty !== undefined ? <Badge label={`Up to ${line.maxQty}`} tone="info" showIcon={false} /> : null}
            </View>
            <Stepper value={line.qty} min={0} max={line.maxQty ?? 9999} onChange={onQty} label={`${line.itemName} quantity`} compact />
          </View>
        </PressableScale>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}
