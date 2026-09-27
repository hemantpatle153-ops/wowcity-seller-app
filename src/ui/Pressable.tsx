import { forwardRef, type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** How far it shrinks when pressed (0.97 default). */
  scaleTo?: number;
  /** Light haptic on press. */
  hapticOnPress?: boolean;
};

/** Every tappable surface: springs down a little when pressed, respects reduce motion. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { style, children, scaleTo = 0.97, hapticOnPress, onPressIn, onPressOut, onPress, disabled, ...rest },
  ref
) {
  const theme = useTheme();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    opacity: (disabled ? 0.45 : 1) * (1 - pressed.value * 0.08)
  }));
  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={(event) => {
        pressed.set(theme.reduceMotion ? withTiming(1, { duration: 60 }) : withSpring(1, theme.motion.spring));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(theme.reduceMotion ? withTiming(0, { duration: 80 }) : withSpring(0, theme.motion.spring));
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (hapticOnPress) haptic.tap();
        onPress?.(event);
      }}
      style={[style, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
