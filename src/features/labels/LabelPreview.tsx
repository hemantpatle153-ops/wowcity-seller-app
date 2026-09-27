import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { LabelFieldKey, LabelTemplate } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { media } from "@/theme/tokens";
import { Text } from "@/ui";
import { code128Bars } from "./code128";
import { labelTypeScale, variantText, type LabelContent } from "./labelHtml";

/** Code 128 bars drawn with react-native-svg (black on the label's white). */
export function Barcode({ value, height = 40 }: { value: string; height?: number | "100%" }) {
  const { bars, total } = code128Bars(value || " ");
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${total} 1`} preserveAspectRatio="none" accessibilityLabel={`Barcode ${value}`}>
      {bars.map(([x, w]) => (
        <Rect key={x} x={x} y={0} width={w} height={1} fill={media.black} />
      ))}
    </Svg>
  );
}

/**
 * One label at true proportions, scaled to the width available. Printed labels are black on white
 * paper in every appearance mode, so the preview uses the fixed media colours.
 */
export function LabelPreview({ template, item, fields, shop }: { template: LabelTemplate; item: LabelContent; fields: LabelFieldKey[]; shop: string }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const maxWidth = Math.min(width, 320);
  const scale = maxWidth / template.label.width; // px per mm
  const height = template.label.height * scale;
  const t = labelTypeScale(template.label.height);
  const px = (ptSize: number) => (ptSize / 72) * 25.4 * scale; // pt → mm → px
  const has = (k: LabelFieldKey) => fields.includes(k);
  const variant = variantText(item, true);
  const ink = { color: media.black } as const;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ alignItems: "center" }}>
      {maxWidth > 0 ? (
        <View
          accessibilityLabel={`Label preview: ${item.name}, ${formatMoney(item.price)}`}
          style={{
            width: maxWidth,
            height,
            backgroundColor: media.text,
            borderRadius: Math.max(4, template.radius * scale),
            paddingVertical: 1.8 * scale,
            paddingHorizontal: 2.2 * scale,
            borderWidth: 1,
            borderColor: theme.colors.borderStrong,
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
            overflow: "hidden"
          }}
        >
          {has("shop") && shop ? (
            <Text allowFontScaling={false} numberOfLines={1} style={[ink, { fontSize: px(t.small), lineHeight: px(t.small) * 1.2, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }]}>
              {shop}
            </Text>
          ) : null}
          {has("name") ? (
            <Text allowFontScaling={false} numberOfLines={1} style={[ink, { fontSize: px(t.name), lineHeight: px(t.name) * 1.2, fontWeight: "700" }]}>
              {item.name}
            </Text>
          ) : null}
          {has("variant") && variant ? (
            <Text allowFontScaling={false} numberOfLines={1} style={[ink, { fontSize: px(t.small), lineHeight: px(t.small) * 1.2 }]}>
              {variant}
            </Text>
          ) : null}
          {(has("mrp") && item.mrp) || (has("price") && item.price) ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              {has("mrp") && item.mrp ? (
                <Text allowFontScaling={false} style={[ink, { fontSize: px(t.small), lineHeight: px(t.small) * 1.25 }]}>
                  MRP {formatMoney(item.mrp)}
                </Text>
              ) : (
                <View />
              )}
              {has("price") && item.price ? (
                <Text allowFontScaling={false} style={[ink, { fontSize: px(t.price), lineHeight: px(t.price) * 1.2, fontWeight: "800" }]}>
                  {formatMoney(item.price)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {has("code") && item.barcode ? (
            <View style={{ flex: 1, minHeight: 4 * scale, marginTop: 0.6 * scale }}>
              <View style={{ flex: 1 }}>
                <Barcode value={item.barcode} height="100%" />
              </View>
              <Text allowFontScaling={false} align="center" style={[ink, { fontSize: px(t.code), lineHeight: px(t.code) * 1.2, letterSpacing: 1 }]}>
                {item.barcode}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
