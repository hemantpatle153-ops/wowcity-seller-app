import { useId, useState } from "react";
import { Pressable, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "../Text";
import { areaPath, describeSeries, labelIndexes, linePath, nearestIndex, niceTicks, smoothPath, toPoints } from "./scale";
import { useChartProgress } from "./useChartProgress";

export type LineDatum = { label: string; value: number; fullLabel?: string };

export type LineChartProps = {
  data: LineDatum[];
  height?: number;
  format?: (n: number) => string;
  formatFull?: (n: number) => string;
  colorIndex?: number;
  /** Fill under the line with a soft gradient. */
  area?: boolean;
  smooth?: boolean;
  title?: string;
  noun?: string;
  /** Hide the y-axis labels (grid lines stay). */
  hideAxis?: boolean;
};

/** Trend line (optionally filled). Draws in from the left; tap anywhere to inspect the nearest point. */
export function LineChart({
  data,
  height = 150,
  format = formatMoneyShort,
  formatFull = (n) => formatMoney(n),
  colorIndex = 0,
  area = false,
  smooth = true,
  title,
  noun = "days",
  hideAxis
}: LineChartProps) {
  const theme = useTheme();
  const gradientId = `grad-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const dataKey = data.map((d) => `${d.label}:${d.value}`).join("|");
  const progress = useChartProgress(dataKey, { duration: 900 });
  const caption = theme.type("caption");
  const values = data.map((d) => (Number.isFinite(d.value) ? d.value : 0));
  const { ticks, min, max } = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 3);
  const axisWidth = hideAxis ? 0 : Math.round(caption.fontSize * 3.2);
  const plotWidth = Math.max(0, width - axisWidth);
  const pad = 8; // keeps the end dots inside the plot
  const inner = Math.max(0, plotWidth - pad * 2);
  const top = 6;
  const plotHeight = height;
  const points = toPoints(values, inner, plotHeight, [min, max]).map((p) => ({ x: p.x + pad, y: p.y + top }));
  const yOf = (v: number) => top + plotHeight - ((v - min) / (max - min || 1)) * plotHeight;
  const color = theme.colors.chart[colorIndex % theme.colors.chart.length];
  const line = smooth ? smoothPath(points) : linePath(points);
  const fill = area ? areaPath(points, yOf(Math.max(min, 0)), smooth) : "";
  const current = selected !== null ? data[selected] : null;
  const summary = describeSeries(
    data.map((d) => ({ label: d.fullLabel ?? d.label, value: d.value })),
    formatFull,
    noun
  );
  const xLabels = labelIndexes(data.length, Math.max(2, Math.min(5, Math.floor(plotWidth / (caption.fontSize * 5.5)))));

  const reveal = useAnimatedStyle(() => ({ width: plotWidth * progress.value }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const inspect = (e: GestureResponderEvent) => {
    const i = nearestIndex(points, e.nativeEvent.locationX);
    if (i < 0) return;
    haptic.select();
    setSelected(i === selected ? null : i);
  };

  const svgHeight = top + plotHeight + 4;
  const sel = selected !== null ? points[selected] : null;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${title ? `${title}. ` : ""}${summary}`} style={{ gap: 6 }}>
      <View style={{ minHeight: caption.lineHeight + 8, justifyContent: "center" }}>
        {current ? (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <Text variant="small" color="textMuted">
              {current.fullLabel ?? current.label}
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatFull(current.value)}
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="textFaint">
            Tap the chart to see a day
          </Text>
        )}
      </View>
      <View onLayout={onLayout} style={{ height: svgHeight, flexDirection: "row" }}>
        {width > 0 && data.length ? (
          <>
            {ticks.map((t) => (
              <View key={t} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: yOf(t), flexDirection: "row", alignItems: "center" }}>
                {hideAxis ? null : (
                  <Text variant="caption" color="textFaint" tabular numberOfLines={1} style={{ width: axisWidth - 6, textAlign: "right", marginTop: -caption.lineHeight, fontSize: caption.fontSize - 1 }}>
                    {format(t)}
                  </Text>
                )}
                <View style={{ flex: 1, height: 1, marginLeft: hideAxis ? 0 : 6, backgroundColor: t === 0 ? theme.colors.borderStrong : theme.colors.border, opacity: t === 0 ? 1 : 0.7 }} />
              </View>
            ))}
            <View style={{ width: axisWidth }} />
            <Pressable onPress={inspect} accessibilityLabel="Inspect a point" style={{ width: plotWidth, height: svgHeight }}>
              <Animated.View style={[{ height: svgHeight, overflow: "hidden" }, reveal]} pointerEvents="none">
                <Svg width={plotWidth} height={svgHeight}>
                  <Defs>
                    <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={color} stopOpacity={theme.scheme === "dark" ? 0.38 : 0.28} />
                      <Stop offset="1" stopColor={color} stopOpacity={0.02} />
                    </LinearGradient>
                  </Defs>
                  {area ? <Path d={fill} fill={`url(#${gradientId})`} /> : null}
                  <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  {points.length ? <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} stroke={theme.colors.surface} strokeWidth={2} /> : null}
                </Svg>
              </Animated.View>
              {sel ? (
                <Svg width={plotWidth} height={svgHeight} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
                  <Line x1={sel.x} x2={sel.x} y1={top} y2={top + plotHeight} stroke={theme.colors.borderStrong} strokeWidth={1} strokeDasharray="4 4" />
                  <Circle cx={sel.x} cy={sel.y} r={6} fill={color} stroke={theme.colors.surface} strokeWidth={2.5} />
                </Svg>
              ) : null}
            </Pressable>
          </>
        ) : null}
      </View>
      <View style={{ height: caption.lineHeight, marginLeft: axisWidth }}>
        {width > 0
          ? xLabels.map((i) => {
              const x = points[i]?.x ?? 0;
              const w = 72;
              const left = Math.min(Math.max(0, x - w / 2), plotWidth - w);
              const align = left <= 0 ? "left" : left >= plotWidth - w ? "right" : "center";
              return (
                <Text
                  key={i}
                  variant="caption"
                  color={selected === i ? "text" : "textMuted"}
                  weight={selected === i ? "700" : "500"}
                  numberOfLines={1}
                  style={{ position: "absolute", left, width: w, textAlign: align }}
                >
                  {data[i].label}
                </Text>
              );
            })
          : null}
      </View>
    </View>
  );
}

/** Line chart with a gradient fill under the line. */
export function AreaChart(props: Omit<LineChartProps, "area">) {
  return <LineChart {...props} area />;
}
