import { View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "../Pressable";
import { Text } from "../Text";
import { useChartProgress } from "./useChartProgress";

export type HBarDatum = { key?: string; label: string; value: number; /** Second line under the label, e.g. "4 bills · 9 items". */ detail?: string; onPress?: () => void };

function Fill({ progress, fraction, index, color }: { progress: SharedValue<number>; fraction: number; index: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, progress.value * 1.3 - index * 0.08));
    return { width: `${Math.max(fraction > 0 ? 2 : 0, fraction * 100 * local)}%` };
  });
  return <Animated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: color }, style]} />;
}

/** Ranked bars (top items, staff): label and value above a bar scaled to the largest value. */
export function HorizontalBars({
  data,
  format = (n) => formatMoney(n, { decimals: 0 }),
  colorIndex = 0,
  title,
  barHeight = 10
}: {
  data: HBarDatum[];
  format?: (n: number) => string;
  colorIndex?: number;
  title?: string;
  barHeight?: number;
}) {
  const theme = useTheme();
  const progress = useChartProgress(data.map((d) => `${d.label}:${d.value}`).join("|"), { duration: 700 });
  const max = Math.max(0, ...data.map((d) => d.value));
  const color = theme.colors.chart[colorIndex % theme.colors.chart.length];
  const summary = data.map((d, i) => `${i + 1}. ${d.label}: ${format(d.value)}`).join(". ");
  return (
    <View accessibilityLabel={title ? `${title}. ${summary}` : summary} style={{ gap: 12 }}>
      {data.map((d, i) => {
        const fraction = max > 0 ? Math.max(0, d.value) / max : 0;
        const body = (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="small" weight="600" numberOfLines={1}>
                  {d.label}
                </Text>
                {d.detail ? (
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {d.detail}
                  </Text>
                ) : null}
              </View>
              <Text variant="small" weight="700" tabular numberOfLines={1}>
                {format(d.value)}
              </Text>
            </View>
            <View style={{ height: barHeight, borderRadius: 999, backgroundColor: theme.colors.surfaceSunken, overflow: "hidden" }}>
              <Fill progress={progress} fraction={fraction} index={i} color={i === 0 ? color : theme.colors.chart[(colorIndex + 5) % theme.colors.chart.length]} />
            </View>
          </>
        );
        return d.onPress ? (
          <PressableScale key={d.key ?? `${d.label}-${i}`} onPress={d.onPress} scaleTo={0.98} accessibilityLabel={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ""}`} style={{ gap: 6, minHeight: 44, justifyContent: "center" }}>
            {body}
          </PressableScale>
        ) : (
          <View key={d.key ?? `${d.label}-${i}`} accessible accessibilityLabel={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ""}`} style={{ gap: 6 }}>
            {body}
          </View>
        );
      })}
    </View>
  );
}
