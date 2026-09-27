import { useEffect } from "react";
import { Easing, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * 0 → 1 progress that replays whenever `key` changes (new data). Stays at 1 with reduce motion,
 * so charts render statically.
 */
export function useChartProgress(key: string, { duration = 650, delay = 0 }: { duration?: number; delay?: number } = {}): SharedValue<number> {
  const theme = useTheme();
  const progress = useSharedValue(theme.reduceMotion ? 1 : 0);
  useEffect(() => {
    if (theme.reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [key, theme.reduceMotion, duration, delay, progress]);
  return progress;
}
