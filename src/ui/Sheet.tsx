import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { IconButton } from "./Button";
import { Text } from "./Text";

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Sticky footer (primary action) kept in the thumb zone. */
  footer?: ReactNode;
  /** Max height as a fraction of the screen. */
  maxHeight?: number;
  scroll?: boolean;
  dismissible?: boolean;
};

/**
 * Bottom sheet: springs up, drag the handle or swipe down to dismiss, tap the backdrop to close.
 * Used for pickers, quick actions and confirmations.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer, maxHeight = 0.9, scroll = true, dismissible = true }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // Mount as soon as it becomes visible; unmount after the exit animation finishes.
  if (visible && !mounted) setMounted(true);
  const translate = useSharedValue(height);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translate.set(height);
      backdrop.set(withTiming(1, { duration: theme.reduceMotion ? 0 : 200 }));
      translate.set(theme.reduceMotion ? withTiming(0, { duration: 120 }) : withSpring(0, { damping: 22, stiffness: 240, mass: 0.9 }));
    } else if (mounted) {
      backdrop.set(withTiming(0, { duration: theme.reduceMotion ? 0 : 180 }));
      translate.set(
        withTiming(height, { duration: theme.reduceMotion ? 100 : 220 }, (finished) => {
          if (finished) runOnJS(setMounted)(false);
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    if (dismissible) onClose();
  };

  const pan = Gesture.Pan()
    .enabled(dismissible)
    .activeOffsetY(10)
    .onUpdate((e) => {
      translate.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(onClose)();
      else translate.set(withSpring(0, { damping: 22, stiffness: 240 }));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translate.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent onRequestClose={close} animationType="none">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.overlay }, backdropStyle]}>
            <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                maxHeight: height * maxHeight,
                backgroundColor: theme.colors.surfaceRaised,
                borderTopLeftRadius: theme.radius.sheet,
                borderTopRightRadius: theme.radius.sheet,
                paddingBottom: Math.max(insets.bottom, 12),
                borderWidth: theme.scheme === "dark" ? 1 : 0,
                borderColor: theme.colors.border,
                width: "100%",
                maxWidth: 640,
                alignSelf: "center"
              },
              sheetStyle
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={{ paddingTop: 10, paddingHorizontal: theme.space[4] }}>
                <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: theme.colors.borderStrong, marginBottom: 6 }} />
                {title ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="title" accessibilityRole="header">
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text variant="small" color="textMuted">
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {dismissible ? <IconButton icon="close" label="Close" onPress={onClose} variant="soft" size={20} /> : null}
                  </View>
                ) : null}
              </View>
            </GestureDetector>
            <Body
              style={scroll ? { flexGrow: 0 } : undefined}
              contentContainerStyle={scroll ? { padding: theme.space[4], paddingTop: theme.space[2], gap: theme.space[3] } : undefined}
              keyboardShouldPersistTaps="handled"
            >
              {scroll ? children : <View style={{ padding: theme.space[4], paddingTop: theme.space[2], gap: theme.space[3] }}>{children}</View>}
            </Body>
            {footer ? <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[2], gap: theme.space[2] }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
