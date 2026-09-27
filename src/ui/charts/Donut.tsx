import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { formatMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { alpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "../Text";
import { arcPath, donutSegments, percentages } from "./scale";
import { useChartProgress } from "./useChartProgress";

export type DonutDatum = { label: string; value: number };

/** Share-of-total ring (e.g. payment mix) with a legend showing percentages. Tap a slice or legend row to focus it. */
export function Donut({
  data,
  size = 148,
  thickness = 18,
  format = (n) => formatMoney(n, { decimals: 0 }),
  centerLabel = "Total",
  title
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  format?: (n: number) => string;
  centerLabel?: string;
  title?: string;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const values = data.map((d) => d.value);
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const pcts = percentages(values);
  const segments = donutSegments(values);
  const progress = useChartProgress(data.map((d) => `${d.label}:${d.value}`).join("|"), { duration: 700 });
  const intro = useAnimatedStyle(() => ({
    opacity: 0.2 + progress.value * 0.8,
    transform: [{ rotate: `${(progress.value - 1) * 90}deg` }, { scale: 0.86 + progress.value * 0.14 }]
  }));
  const r = (size - thickness) / 2;
  const c = size / 2;
  const colorOf = (i: number) => theme.colors.chart[i % theme.colors.chart.length];
  const summary = total
    ? data
        .map((d, i) => `${d.label} ${pcts[i]}% (${format(d.value)})`)
        .filter((_, i) => values[i] > 0)
        .join(", ")
    : "No data";
  const focus = selected !== null ? data[selected] : null;
  const toggle = (i: number) => {
    haptic.select();
    setSelected(selected === i ? null : i);
  };

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${title ? `${title}. ` : ""}Total ${format(total)}. ${summary}`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
      <View style={{ width: size, height: size, alignSelf: "center" }}>
        <Animated.View style={[{ width: size, height: size }, intro]}>
          <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={r} stroke={theme.colors.surfaceSunken} strokeWidth={thickness} fill="none" />
            {segments.map((s) => (
              <Path
                key={s.index}
                d={arcPath(c, c, r, s.start, s.sweep)}
                stroke={selected !== null && selected !== s.index ? alpha(colorOf(s.index), 0.3) : colorOf(s.index)}
                strokeWidth={selected === s.index ? thickness + 4 : thickness}
                strokeLinecap="butt"
                fill="none"
                onPress={() => toggle(s.index)}
              />
            ))}
          </Svg>
        </Animated.View>
        <View pointerEvents="none" style={{ position: "absolute", left: thickness, right: thickness, top: thickness, bottom: thickness, alignItems: "center", justifyContent: "center" }}>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {focus ? focus.label : centerLabel}
          </Text>
          <Text variant="bodyStrong" tabular numberOfLines={1} adjustsFontSizeToFit>
            {format(focus ? focus.value : total)}
          </Text>
          {focus ? (
            <Text variant="caption" color="textMuted" tabular>
              {pcts[selected!]}%
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 150, gap: 2 }}>
        {data.map((d, i) => (
          <Pressable
            key={d.label}
            onPress={() => toggle(i)}
            accessibilityLabel={`${d.label}: ${format(d.value)}, ${pcts[i]} percent`}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, opacity: selected !== null && selected !== i ? 0.5 : 1 }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: colorOf(i) }} />
            <Text variant="small" weight={selected === i ? "700" : "500"} style={{ flex: 1 }} numberOfLines={1}>
              {d.label}
            </Text>
            <Text variant="small" color="textMuted" tabular style={{ minWidth: 36, textAlign: "right" }}>
              {pcts[i]}%
            </Text>
            <Text variant="small" weight="600" tabular numberOfLines={1} style={{ minWidth: 64, textAlign: "right" }}>
              {format(d.value)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
