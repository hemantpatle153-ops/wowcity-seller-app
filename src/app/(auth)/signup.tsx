import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import Animated, { FadeInRight, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { OtpSignupShop } from "@/api/types";
import { deviceInfo, useSession } from "@/auth/session";
import { GSTIN_PATTERN, gstStateCode, indianStates } from "@/lib/india";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, Header, Icon, Input, Row, Screen, Select, Stack, Text } from "@/ui";
import { CodeInput } from "@/ui/CodeInput";

const steps = ["You", "Shop", "Address", "GST", "Verify"] as const;
const businessTypes = ["Clothing", "Footwear", "Sarees & ethnic", "Kids wear", "Accessories", "General store"];

function Progress({ step }: { step: number }) {
  const theme = useTheme();
  const bar = useAnimatedStyle(() => ({ width: withSpring(`${((step + 1) / steps.length) * 100}%`, { damping: 20 }) }));
  return (
    <View style={{ gap: 8 }} accessibilityLabel={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceSunken, overflow: "hidden" }}>
        <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: theme.colors.accent }, bar]} />
      </View>
      <Row justify="space-between">
        {steps.map((label, i) => (
          <Text key={label} variant="caption" color={i <= step ? "accent" : "textFaint"} weight={i === step ? "800" : "500"}>
            {label}
          </Text>
        ))}
      </Row>
    </View>
  );
}

export default function Signup() {
  const theme = useTheme();
  const signIn = useSession((s) => s.signIn);
  const [step, setStep] = useState(0);
  const [identifier, setIdentifier] = useState("");
  const [shop, setShop] = useState<OtpSignupShop>({
    ownerName: "",
    phone: "",
    shopName: "",
    businessType: "Clothing",
    gstin: "",
    legalName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: ""
  });
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [shopCode, setShopCode] = useState<string | null>(null);
  const set = (patch: Partial<OtpSignupShop>) => setShop((s) => ({ ...s, ...patch }));

  const isEmail = /^\S+@\S+\.\S+$/.test(identifier.trim());
  const isMobile = identifier.replace(/\D/g, "").length >= 10;
  const gstin = (shop.gstin ?? "").trim().toUpperCase();
  const gstError =
    gstin && !GSTIN_PATTERN.test(gstin)
      ? "GSTIN should look like 23ABCDE1234F1Z5."
      : gstin && shop.state && gstStateCode(gstin) !== gstStateCode(shop.state)
        ? "This GSTIN is from a different state than your shop."
        : null;

  const valid = [
    shop.ownerName.trim().length >= 2 && (isEmail || isMobile) && /^\+?[0-9 ]{10,15}$/.test(shop.phone.trim() || identifier.trim()),
    shop.shopName.trim().length >= 2,
    shop.addressLine1.trim().length >= 3 && shop.city.trim().length >= 2 && !!shop.state && /^\d{6}$/.test(shop.pincode.trim()),
    !gstError,
    code.length === 6
  ];

  const request = useMutation({
    mutationFn: () => api.auth.otpRequest({ identifier: identifier.trim(), purpose: "signup" }),
    onSuccess: (data) => {
      setSentTo(data.sentTo);
      setStep(4);
    }
  });
  const verify = useMutation({
    mutationFn: async (value: string) => {
      const phone = shop.phone.trim() || identifier.trim();
      const result = await api.auth.otpVerify({
        identifier: identifier.trim(),
        code: value,
        purpose: "signup",
        shop: { ...shop, phone, gstin: gstin || undefined, legalName: shop.legalName?.trim() || undefined, addressLine2: shop.addressLine2?.trim() || undefined },
        ...deviceInfo()
      });
      if ("shopCode" in result) setShopCode(result.shopCode);
      return result;
    }
  });

  const next = () => {
    if (step === 3) request.mutate();
    else if (step < 3) setStep(step + 1);
  };

  if (shopCode && verify.data) {
    return (
      <Screen>
        <Stack gap={5} style={{ paddingTop: 48, alignItems: "center" }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.successSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="checkmark-done" size={48} color="success" />
          </View>
          <Text variant="display" align="center">
            {shop.shopName} is ready
          </Text>
          <Text variant="body" color="textMuted" align="center">
            Your shop code is below. Staff need it to sign in on their phones.
          </Text>
          <Card style={{ alignSelf: "stretch", alignItems: "center", gap: 4 }}>
            <Text variant="caption" color="textMuted" uppercase>
              Shop code
            </Text>
            <Text variant="hero" color="accent" tabular selectable>
              {shopCode}
            </Text>
          </Card>
          <Button label="Open my shop" size="lg" iconRight="arrow-forward" onPress={() => signIn(verify.data)} fullWidth />
        </Stack>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={<Header back title="Create your shop" onBack={step > 0 ? () => setStep(step - 1) : undefined} />}
        footerSpace={80}
        footer={
          step < 4 ? (
            <View style={{ padding: theme.space[4], paddingBottom: theme.space[6], backgroundColor: theme.colors.bg, borderTopWidth: 1, borderColor: theme.colors.border }}>
              <Button label={step === 3 ? "Send verification code" : "Continue"} size="lg" iconRight="arrow-forward" onPress={next} disabled={!valid[step]} loading={request.isPending} fullWidth />
            </View>
          ) : null
        }
      >
        <Progress step={step} />
        <Animated.View key={step} entering={theme.reduceMotion ? undefined : FadeInRight.springify().damping(20)} style={{ gap: theme.space[4] }}>
          {step === 0 ? (
            <>
              <Text variant="heading">About you</Text>
              <Input label="Your name" value={shop.ownerName} onChangeText={(t) => set({ ownerName: t })} autoComplete="name" textContentType="name" icon="person-outline" />
              <Input
                label="Email or mobile to sign in"
                hint="We'll send a code here to verify it's you."
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                icon="at-outline"
              />
              {isEmail ? (
                <Input label="Mobile number" value={shop.phone} onChangeText={(t) => set({ phone: t })} keyboardType="phone-pad" autoComplete="tel" icon="call-outline" placeholder="98xxxxxxxx" />
              ) : null}
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Text variant="heading">Your shop</Text>
              <Input label="Shop name" value={shop.shopName} onChangeText={(t) => set({ shopName: t })} icon="storefront-outline" placeholder="e.g. Sharma Garments" />
              <Select label="What do you sell?" value={shop.businessType ?? ""} options={businessTypes.map((b) => ({ value: b, label: b }))} onChange={(v) => set({ businessType: v })} allowCustom />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text variant="heading">Where is it?</Text>
              <Input label="Address line 1" value={shop.addressLine1} onChangeText={(t) => set({ addressLine1: t })} autoComplete="street-address" />
              <Input label="Address line 2 (optional)" value={shop.addressLine2} onChangeText={(t) => set({ addressLine2: t })} />
              <Input label="City" value={shop.city} onChangeText={(t) => set({ city: t })} autoComplete="postal-address-locality" />
              <Select label="State" value={shop.state} options={indianStates.map((s) => ({ value: s.name, label: s.name }))} onChange={(v) => set({ state: v })} searchable />
              <Input label="PIN code" value={shop.pincode} onChangeText={(t) => set({ pincode: t.replace(/\D/g, "").slice(0, 6) })} keyboardType="number-pad" autoComplete="postal-code" />
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text variant="heading">GST (optional)</Text>
              <Text variant="body" color="textMuted">
                Add your GSTIN to print tax invoices. You can do this later in Settings.
              </Text>
              <Input
                label="GSTIN"
                value={shop.gstin}
                onChangeText={(t) => set({ gstin: t.toUpperCase() })}
                autoCapitalize="characters"
                autoCorrect={false}
                error={gstError}
                placeholder="23ABCDE1234F1Z5"
              />
              <Input label="Legal name (as on GST)" value={shop.legalName} onChangeText={(t) => set({ legalName: t })} />
              {request.isError ? (
                <Text variant="small" color="danger">
                  {errorMessage(request.error)}
                </Text>
              ) : null}
            </>
          ) : null}
          {step === 4 ? (
            <>
              <Text variant="heading">Enter the code</Text>
              <Text variant="body" color="textMuted">
                Sent to {sentTo}. It works for 10 minutes.
              </Text>
              <CodeInput value={code} onChange={setCode} onComplete={(v) => !verify.isPending && verify.mutate(v)} error={verify.isError} label="Verification code" />
              {verify.isError ? (
                <Text variant="small" color="danger" align="center">
                  {errorMessage(verify.error)}
                </Text>
              ) : null}
              <Button label="Create my shop" size="lg" onPress={() => verify.mutate(code)} disabled={code.length !== 6} loading={verify.isPending} fullWidth />
              <Button label="Send a new code" variant="ghost" onPress={() => request.mutate()} disabled={request.isPending} />
            </>
          ) : null}
        </Animated.View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
