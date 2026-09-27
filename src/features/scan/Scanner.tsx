import { useAudioPlayer } from "expo-audio";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/lib/haptics";
import { usePreferences } from "@/state/preferences";
import { useTheme } from "@/theme/ThemeProvider";
import { media } from "@/theme/tokens";
import { Button, EmptyState, Icon, IconButton, Input, PressableScale, Sheet, Text } from "@/ui";

export type ScanFeedback = { ok: boolean; title: string; subtitle?: string };

const BARCODES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "qr"];
/** Same code is ignored for this long (so holding the camera on a label adds it once). */
const SAME_CODE_MS = 1800;
/** Any code is ignored for this long after a handled scan. */
const COOLDOWN_MS = 650;

/**
 * Full-screen barcode scanner: torch, debounce, beep + haptic feedback, manual entry fallback.
 * `onScan` resolves the code and returns what to show (added item / not found).
 */
export function Scanner({
  title,
  onScan,
  onClose,
  continuous = true,
  footer
}: {
  title: string;
  onScan: (code: string) => Promise<ScanFeedback>;
  onClose: () => void;
  continuous?: boolean;
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<(ScanFeedback & { id: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const handledAt = useRef(0);
  const sound = usePreferences((s) => s.scanSound);
  const beep = useAudioPlayer(require("../../../assets/sounds/beep.wav"));
  const buzz = useAudioPlayer(require("../../../assets/sounds/error.wav"));
  const line = useSharedValue(0);

  useEffect(() => {
    if (!theme.reduceMotion) line.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [line, theme.reduceMotion]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: line.get() * 150 }] }));

  const handle = async (raw: string, fromCamera: boolean) => {
    const value = raw.trim();
    const now = Date.now();
    if (!value || busy) return;
    if (fromCamera && (now - handledAt.current < COOLDOWN_MS || (value === last.current.code && now - last.current.at < SAME_CODE_MS))) return;
    last.current = { code: value, at: now };
    handledAt.current = now;
    setBusy(true);
    try {
      const result = await onScan(value);
      if (result.ok) {
        haptic.success();
        if (sound) {
          beep.seekTo(0);
          beep.play();
        }
      } else {
        haptic.error();
        if (sound) {
          buzz.seekTo(0);
          buzz.play();
        }
      }
      setFeedback({ ...result, id: now });
      if (result.ok && !continuous) onClose();
    } finally {
      setBusy(false);
      last.current = { code: value, at: Date.now() };
    }
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: media.black }} />;

  const manualSheet = (
    <Sheet
      visible={manual}
      onClose={() => setManual(false)}
      title="Type the barcode"
      footer={
        <Button
          label="Add"
          size="lg"
          fullWidth
          disabled={!code.trim()}
          onPress={() => {
            void handle(code, false);
            setCode("");
            setManual(false);
          }}
        />
      }
    >
      <Input
        value={code}
        onChangeText={setCode}
        placeholder="e.g. 8901234500012"
        autoFocus
        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => code.trim() && (void handle(code, false), setCode(""), setManual(false))}
        large
        icon="barcode-outline"
      />
    </Sheet>
  );

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", padding: 4 }}>
          <IconButton icon="close" label="Close scanner" onPress={onClose} />
        </View>
        <EmptyState
          icon="camera-outline"
          title="Allow the camera to scan"
          body={
            permission.canAskAgain
              ? "WowCity uses the camera only to read barcodes and take product photos."
              : "Camera access is off. Turn it on in your phone's settings, or type the barcode instead."
          }
          action={permission.canAskAgain ? "Allow camera" : "Open settings"}
          onAction={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
        <Button label="Type the barcode instead" variant="ghost" onPress={() => setManual(true)} />
        {manualSheet}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: media.black }}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: BARCODES }} onBarcodeScanned={(result) => void handle(result.data, true)} />
      {/* Dimmed frame around the scan window */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <View style={{ width: 280, height: 170, borderRadius: 20, borderWidth: 3, borderColor: media.frame, overflow: "hidden" }}>
          <Animated.View
            style={[
              { position: "absolute", left: 12, right: 12, top: 8, height: 2, backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOpacity: 0.9, shadowRadius: 8 },
              lineStyle
            ]}
          />
        </View>
        <Text variant="small" weight="600" style={{ color: media.text, marginTop: 16, textShadowColor: media.shadow, textShadowRadius: 4 }}>
          Point at the barcode
        </Text>
      </View>

      <View style={{ position: "absolute", top: insets.top + 8, left: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <PressableScale onPress={onClose} accessibilityLabel="Close scanner" style={styles.round}>
          <Icon name="close" tint={media.text} size={24} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text variant="title" style={{ color: media.text }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <PressableScale
          onPress={() => setTorch(!torch)}
          accessibilityLabel={torch ? "Turn torch off" : "Turn torch on"}
          accessibilityState={{ selected: torch }}
          style={[styles.round, torch ? { backgroundColor: media.torch } : null]}
        >
          <Icon name={torch ? "flashlight" : "flashlight-outline"} tint={torch ? media.torchIcon : media.text} size={22} />
        </PressableScale>
      </View>

      <View style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 16, gap: 12 }}>
        {feedback ? (
          <Animated.View key={feedback.id} entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(16)} exiting={theme.reduceMotion ? undefined : FadeOutDown.duration(120)}>
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surfaceRaised,
                borderLeftWidth: 5,
                borderLeftColor: feedback.ok ? theme.colors.success : theme.colors.danger
              }}
            >
              <Icon name={feedback.ok ? "checkmark-circle" : "alert-circle"} color={feedback.ok ? "success" : "danger"} size={28} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {feedback.title}
                </Text>
                {feedback.subtitle ? (
                  <Text variant="small" color="textMuted" numberOfLines={1}>
                    {feedback.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button label="Type code" icon="keypad-outline" variant="secondary" onPress={() => setManual(true)} style={{ flex: 1 }} />
          {footer}
        </View>
      </View>
      {manualSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: media.scrim, alignItems: "center", justifyContent: "center" }
});
