import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import { useSession } from "@/auth/session";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Header, Input, Screen, Text } from "@/ui";
import { Callout, FormSection, StickyFooter } from "./components";
import { useUnsavedGuard } from "./hooks";
import { passwordStrength } from "./validation";

function StrengthMeter({ value }: { value: string }) {
  const theme = useTheme();
  const { score, label } = passwordStrength(value);
  const colors = [theme.colors.border, theme.colors.danger, theme.colors.warning, theme.colors.info, theme.colors.success];
  const tone = (["textMuted", "danger", "warning", "info", "success"] as const)[score];
  const width = useSharedValue(score / 4);
  useEffect(() => {
    width.set(theme.reduceMotion ? score / 4 : withTiming(score / 4, { duration: 220 }));
  }, [score, theme.reduceMotion, width]);
  const bar = useAnimatedStyle(() => ({ width: `${Math.max(0.04, width.get()) * 100}%` }));
  if (!value) return null;
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`Password strength: ${label}`} accessibilityLiveRegion="polite">
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceSunken, overflow: "hidden" }}>
        <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: colors[score] }, bar]} />
      </View>
      <Text variant="small" weight="700" color={tone}>
        {label}
        {score < 3 ? (
          <Text variant="small" color="textMuted">
            {"  "}Try 12+ characters with a number and a symbol.
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

export function PasswordScreen() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !!(current || next || confirmValue);
  const guard = useUnsavedGuard(dirty && !saving);
  const errors = {
    current: current ? null : "Enter your current password.",
    next: next.length < 8 ? "At least 8 characters." : next.length > 72 ? "At most 72 characters." : next === current ? "Pick a password different from the current one." : null,
    confirm: confirmValue !== next ? "The two new passwords don't match." : null
  };
  const invalid = Object.values(errors).some(Boolean);
  const submit = async () => {
    setTouched(true);
    if (invalid) {
      haptic.warning();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.settings.password({ currentPassword: current, newPassword: next, confirmPassword: confirmValue });
      haptic.success();
      guard.allowLeave();
      qc.clear();
      await useSession.getState().signOut({ remote: false, reason: "Password changed. Sign in with your new password." });
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={<Header back title="Change password" />}
        footerSpace={110}
        footer={
          <StickyFooter error={error}>
            <Button label="Change password" icon="key-outline" size="lg" fullWidth disabled={!dirty} loading={saving} onPress={submit} />
          </StickyFooter>
        }
      >
        <Callout icon="phone-portrait-outline" tone="warning" title="Signs out all your phones">
          After the change, every phone signed in as the owner (including this one) is signed out. Staff are not affected.
        </Callout>
        <FormSection title="Current password">
          <Input
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            error={touched ? errors.current : null}
          />
        </FormSection>
        <FormSection title="New password">
          <Input
            label="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            maxLength={72}
            error={touched ? errors.next : null}
          />
          <StrengthMeter value={next} />
          <Input
            label="Confirm new password"
            value={confirmValue}
            onChangeText={setConfirmValue}
            secureTextEntry
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            maxLength={72}
            error={touched || (confirmValue.length > 0 && confirmValue.length >= next.length) ? errors.confirm : null}
          />
        </FormSection>
      </Screen>
    </KeyboardAvoidingView>
  );
}
