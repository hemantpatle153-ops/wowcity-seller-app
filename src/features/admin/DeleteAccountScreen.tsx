import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { api, ApiError, errorMessage } from "@/api";
import { useSession } from "@/auth/session";
import { haptic } from "@/lib/haptics";
import { offlineStore } from "@/offline/store";
import { useQueueCount } from "@/offline/useQueue";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, confirm, Header, Icon, IconCircle, Input, PressableScale, Row, Screen, SectionTitle, Stack, Text, toast, type IconName } from "@/ui";
import { Callout, StickyFooter } from "./components";

const SUPPORT = "support@luzzan.com";

function supportMail(shopCode: string, shopName: string) {
  const subject = `Delete my WowCity account (${shopCode})`;
  const body = `Hello WowCity support,\n\nPlease delete the WowCity Seller account for my shop.\n\nShop name: ${shopName}\nShop code: ${shopCode}\n\nI understand this closes the shop, signs out all staff, and cannot be undone.\n\nThank you.`;
  return `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function Consequence({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <Row gap={3} align="flex-start">
      <IconCircle icon={icon} tone="danger" size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="small" color="textMuted">
          {body}
        </Text>
      </View>
    </Row>
  );
}

export function DeleteAccountScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const queued = useQueueCount();
  const shopCode = me?.shopCode ?? "";
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toUpperCase() === shopCode.toUpperCase() && !!shopCode;

  const emailSupport = () => {
    Linking.openURL(supportMail(shopCode, me?.shopName ?? "")).catch(() => toast.info(`Email ${SUPPORT} with your shop code ${shopCode}.`));
  };

  const remove = async () => {
    if (!matches || !understood) return;
    const ok = await confirm({
      title: "Delete your account for good?",
      message: `${me?.shopName ?? "Your shop"} closes, every staff member is signed out, and you can't sign in again. This cannot be undone.`,
      confirmLabel: "Delete account",
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.account.delete(shopCode);
      haptic.success();
      qc.clear();
      await offlineStore.clear().catch(() => undefined);
      await useSession.getState().signOut({ remote: false, reason: "Your WowCity account has been deleted. Thank you for selling with us. Goodbye!" });
    } catch (e) {
      haptic.error();
      if (e instanceof ApiError && e.isNotFound) setPending(true);
      else setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (pending)
    return (
      <Screen header={<Header back title="Delete account" />}>
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(250)} style={{ alignItems: "center", gap: theme.space[3], paddingTop: theme.space[8] }}>
          <IconCircle icon="mail-unread-outline" tone="info" size={88} />
          <Text variant="heading" align="center">
            Almost there
          </Text>
          <Text variant="body" color="textMuted" align="center" style={{ maxWidth: 340 }}>
            Account deletion is being switched on. Email {SUPPORT} and we’ll delete it within 7 days.
          </Text>
          <Card style={{ alignSelf: "stretch", gap: 4 }}>
            <Text variant="caption" color="textMuted" uppercase weight="700">
              Your shop code
            </Text>
            <Text variant="title" tabular selectable>
              {shopCode}
            </Text>
            <Text variant="small" color="textMuted">
              It’s already filled in the email for you.
            </Text>
          </Card>
          <Button label="Email support" icon="mail-outline" size="lg" fullWidth onPress={emailSupport} />
          <Button label="Keep my account" variant="ghost" fullWidth onPress={() => setPending(false)} />
        </Animated.View>
      </Screen>
    );

  const enter = (i: number) => (theme.reduceMotion ? undefined : FadeInDown.duration(260).delay(i * 60));
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={<Header back title="Delete account" />}
        footerSpace={110}
        footer={
          <StickyFooter error={error} note={!understood ? "Tick the box above to continue" : !matches ? `Type ${shopCode} to continue` : null}>
            <Button label="Delete account" icon="trash-outline" variant="danger" size="lg" fullWidth disabled={!understood || !matches} loading={busy} onPress={remove} />
          </StickyFooter>
        }
      >
        <Animated.View entering={enter(0)} style={{ alignItems: "center", gap: theme.space[2], paddingTop: theme.space[2] }}>
          <IconCircle icon="warning-outline" tone="danger" size={72} />
          <Text variant="heading" align="center">
            Delete {me?.shopName ?? "your shop"}?
          </Text>
          <Text variant="body" color="textMuted" align="center" style={{ maxWidth: 360 }}>
            This deletes your WowCity Seller account and closes your shop. Please read what happens first.
          </Text>
        </Animated.View>

        <Animated.View entering={enter(1)} style={{ gap: theme.space[2] }}>
          <SectionTitle title="What happens" />
          <Card style={{ gap: theme.space[4] }}>
            <Consequence icon="storefront-outline" title="Your shop closes" body="All stores stop billing and disappear from WowCity for buyers." />
            <Consequence icon="people-outline" title="Everyone is signed out" body="You and all your staff are signed out on every phone and can't sign in again." />
            <Consequence
              icon="document-lock-outline"
              title="Data is kept only as the law requires"
              body="Bills and GST records are kept for the period Indian tax law requires, then deleted. Nothing else is kept."
            />
            <Consequence icon="close-circle-outline" title="It can't be undone" body="You'd need to sign up again and start from scratch." />
            {queued ? (
              <Consequence
                icon="cloud-offline-outline"
                title={`${queued} bill${queued === 1 ? "" : "s"} not synced`}
                body="Bills waiting on this phone will be lost. Go online and let them sync first."
              />
            ) : null}
          </Card>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <Callout icon="download-outline" tone="info" title="Need your records?">
            Download your reports (sales, GST, stock) from Reports before you delete.
          </Callout>
        </Animated.View>

        <Animated.View entering={enter(3)} style={{ gap: theme.space[3] }}>
          <PressableScale
            onPress={() => {
              haptic.select();
              setUnderstood(!understood);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: understood }}
            accessibilityLabel="I understand my shop closes and this cannot be undone"
            scaleTo={0.99}
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              minHeight: 56,
              padding: theme.space[3],
              borderRadius: theme.radius.card,
              borderWidth: understood ? 2 : 1,
              borderColor: understood ? theme.colors.danger : theme.colors.border,
              backgroundColor: understood ? theme.colors.dangerSoft : theme.colors.surface
            }}
          >
            <Icon name={understood ? "checkbox" : "square-outline"} size={26} color={understood ? "danger" : "textMuted"} />
            <Text variant="body" weight="600" style={{ flex: 1 }}>
              I understand my shop closes and this can’t be undone.
            </Text>
          </PressableScale>
          {understood ? (
            <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(200)}>
              <Stack gap={2}>
                <Input
                  label={`Type your shop code ${shopCode} to confirm`}
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={shopCode}
                  maxLength={20}
                  right={matches ? <Icon name="checkmark-circle" color="danger" accessibilityLabel="Shop code matches" /> : undefined}
                />
              </Stack>
            </Animated.View>
          ) : null}
        </Animated.View>

        <Button label="Questions? Email support" accessibilityLabel={`Questions? Email ${SUPPORT}`} variant="ghost" icon="mail-outline" onPress={emailSupport} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
