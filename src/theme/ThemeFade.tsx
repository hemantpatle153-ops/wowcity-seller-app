import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "./ThemeProvider";

/** Short cross-fade when the appearance mode changes: the old background fades away over the new UI. */
export function ThemeFade() {
  const theme = useTheme();
  const previous = useRef(theme.colors.bg);
  const [color, setColor] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (previous.current !== theme.colors.bg && !theme.reduceMotion) {
      setColor(previous.current);
      opacity.set(1);
      opacity.set(
        withTiming(0, { duration: 240 }, (done) => {
          if (done) runOnJS(setColor)(null);
        })
      );
    }
    previous.current = theme.colors.bg;
  }, [theme.colors.bg, theme.reduceMotion, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!color) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}
