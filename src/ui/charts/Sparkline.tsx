import { useId, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { areaPath, smoothPath, toPoints } from "./scale";
import { useChartProgress } from "./useChartProgress";

/** Tiny trend line for tiles and rows. Decorative unless given an accessibilityLabel. */
export function Sparkline({
  values,
  height = 36,
  width: fixedWidth,
  colorIndex = 0,
  tone,
  fill = true,
  accessibilityLabel
}: {
  values: number[];
  height?: number;
  width?: number;
  colorIndex?: number;
  tone?: "success" | "danger" | "warning" | "accent" | "info";
  fill?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const id = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const progress = useChartProgress(values.join(","), { duration: 800 });
  const reveal = useAnimatedStyle(() => ({ width: width * progress.value }));
  const color = tone ? theme.colors[tone] : theme.colors.chart[colorIndex % theme.colors.chart.length];
  const pad = 3;
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, lo + 1);
  const pts = toPoints(values, Math.max(0, width - pad * 2), height - pad * 2, [lo, hi]).map((p) => ({ x: p.x + pad, y: p.y + pad }));
  const onLayout = (e: LayoutChangeEvent) => setMeasured(Math.round(e.nativeEvent.layout.width));
  const last = pts[pts.length - 1];
  return (
    <View
      onLayout={fixedWidth ? undefined : onLayout}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no-hide-descendants"}
      style={{ width: fixedWidth ?? "100%", height }}
    >
      {width > 0 && values.length > 1 ? (
        <Animated.View style={[{ height, overflow: "hidden" }, reveal]}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.3} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {fill ? <Path d={areaPath(pts, height, true)} fill={`url(#${id})`} /> : null}
            <Path d={smoothPath(pts)} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {last ? <Circle cx={last.x} cy={last.y} r={2.5} fill={color} /> : null}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
