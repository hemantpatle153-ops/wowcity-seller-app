import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { alpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "../Text";
import { describeSeries, labelIndexes, linearScale, niceTicks } from "./scale";
import { useChartProgress } from "./useChartProgress";

export type BarDatum = { label: string; value: number; /** Longer label for the tooltip and screen reader. */ fullLabel?: string };

function Bar({
  progress,
  index,
  count,
  zeroY,
  length,
  negative,
  width,
  color
}: {
  progress: SharedValue<number>;
  index: number;
  count: number;
  zeroY: number;
  length: number;
  negative: boolean;
  width: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    // Stagger left to right: each bar starts a little after the previous one.
    const spread = 0.35;
    const local = Math.min(1, Math.max(0, (progress.value * (1 + spread) - (index / Math.max(1, count)) * spread) / 1));
    const h = Math.max(length > 0 ? 2 : 0, length * local);
    return { height: h, top: negative ? zeroY : zeroY - h };
  });
  return <Animated.View style={[{ position: "absolute", width, left: "50%", marginLeft: -width / 2, backgroundColor: color, borderRadius: Math.min(6, width / 3) }, style]} />;
}

/** Centre labels under their bar, but keep the first and last inside the chart. */
function edgeAlign(i: number, n: number) {
  if (n > 1 && i === 0) return "flex-start" as const;
  if (n > 1 && i === n - 1) return "flex-end" as const;
  return "center" as const;
}
function edgeText(i: number, n: number) {
  if (n > 1 && i === 0) return "left" as const;
  if (n > 1 && i === n - 1) return "right" as const;
  return "center" as const;
}

/**
 * Vertical bar chart. Tap a bar to see its value in the callout above the chart.
 * Value labels are shown on bars when there is room (and always for the selected bar).
 */
export function BarChart({
  data,
  height = 168,
  format = formatMoneyShort,
  formatFull = (n) => formatMoney(n),
  colorIndex = 0,
  showValues = "auto",
  highlightLast,
  title,
  noun = "bars"
}: {
  data: BarDatum[];
  height?: number;
  format?: (n: number) => string;
  formatFull?: (n: number) => string;
  colorIndex?: number;
  showValues?: "auto" | "all" | "none";
  highlightLast?: boolean;
  title?: string;
  noun?: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const dataKey = data.map((d) => `${d.label}:${d.value}`).join("|");
  const progress = useChartProgress(dataKey);
  const caption = theme.type("caption");
  const values = data.map((d) => (Number.isFinite(d.value) ? d.value : 0));
  const { ticks, min, max } = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 3);
  const labelSpace = caption.lineHeight + 4;
  const plotTop = labelSpace; // room for value labels above the tallest bar
  const plotHeight = height;
  const y = linearScale([min, max], [plotTop + plotHeight, plotTop]);
  const zeroY = y(0);
  const axisWidth = Math.round(caption.fontSize * 3.2);
  const plotWidth = Math.max(0, width - axisWidth);
  const step = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(4, Math.min(40, step * 0.62));
  const roomForValues = showValues === "all" || (showValues === "auto" && step >= caption.fontSize * 3.4);
  const xLabels = new Set(labelIndexes(data.length, Math.max(2, Math.floor(plotWidth / (caption.fontSize * 4.6)))));
  const base = theme.colors.chart[colorIndex % theme.colors.chart.length];
  const summary = describeSeries(
    data.map((d) => ({ label: d.fullLabel ?? d.label, value: d.value })),
    formatFull,
    noun
  );
  const current = selected !== null ? data[selected] : null;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${title ? `${title}. ` : ""}${summary}`} style={{ gap: 6 }}>
      <View style={{ minHeight: caption.lineHeight * 2 + 4, justifyContent: "center" }}>
        {current ? (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {current.fullLabel ?? current.label}
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatFull(current.value)}
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="textFaint">
            Tap a bar for details
          </Text>
        )}
      </View>
      <View onLayout={onLayout} style={{ height: plotTop + plotHeight, flexDirection: "row" }}>
        {width > 0 ? (
          <>
            {/* Grid lines and axis labels */}
            {ticks.map((t) => (
              <View key={t} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: y(t), flexDirection: "row", alignItems: "center" }}>
                <Text variant="caption" color="textFaint" tabular numberOfLines={1} style={{ width: axisWidth - 6, textAlign: "right", marginTop: -caption.lineHeight, fontSize: caption.fontSize - 1 }}>
                  {format(t)}
                </Text>
                <View style={{ flex: 1, height: t === 0 ? 1.5 : 1, marginLeft: 6, backgroundColor: t === 0 ? theme.colors.borderStrong : theme.colors.border, opacity: t === 0 ? 1 : 0.7 }} />
              </View>
            ))}
            <View style={{ width: axisWidth }} />
            {data.map((d, i) => {
              const value = values[i];
              const length = Math.abs(y(value) - zeroY);
              const isSelected = selected === i;
              const dim = selected !== null ? !isSelected : highlightLast ? i !== data.length - 1 : false;
              const color = dim ? alpha(base, selected !== null ? 0.35 : 0.55) : base;
              const showValue = (roomForValues || isSelected) && value !== 0;
              const top = value >= 0 ? zeroY - length - labelSpace : zeroY + length;
              return (
                <Pressable
                  key={`${d.label}-${i}`}
                  onPress={() => {
                    haptic.select();
                    setSelected(isSelected ? null : i);
                  }}
                  accessibilityLabel={`${d.fullLabel ?? d.label}: ${formatFull(value)}`}
                  style={{ flex: 1, height: "100%" }}
                >
                  <Bar progress={progress} index={i} count={data.length} zeroY={zeroY} length={length} negative={value < 0} width={barWidth} color={color} />
                  {showValue ? (
                    <Text
                      variant="caption"
                      weight={isSelected ? "800" : "600"}
                      color={isSelected ? "text" : "textMuted"}
                      tabular
                      numberOfLines={1}
                      style={{ position: "absolute", top, left: -20, right: -20, textAlign: "center", fontSize: caption.fontSize - 1 }}
                    >
                      {format(value)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", paddingLeft: axisWidth }}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={{ flex: 1, alignItems: edgeAlign(i, data.length), overflow: "visible" }}>
            {xLabels.has(i) ? (
              <Text
                variant="caption"
                color={selected === i ? "text" : "textMuted"}
                weight={selected === i ? "700" : "500"}
                numberOfLines={1}
                style={{ width: 80, textAlign: edgeText(i, data.length), marginHorizontal: data.length > 1 && (i === 0 || i === data.length - 1) ? -4 : 0 }}
              >
                {d.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
