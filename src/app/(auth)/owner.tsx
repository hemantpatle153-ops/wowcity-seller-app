import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { api, errorMessage } from "@/api";
import { deviceInfo, useSession } from "@/auth/session";
import { Button, Header, Input, Screen, Segmented, Stack, Text } from "@/ui";
import { CodeInput } from "@/ui/CodeInput";

type Mode = "code" | "password";

export default function OwnerSignIn() {
  const signIn = useSession((s) => s.signIn);
  const [mode, setMode] = useState<Mode>("code");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ sentTo: string; channel: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const request = useMutation({
    mutationFn: () => api.auth.otpRequest({ identifier: identifier.trim(), purpose: "login" }),
    onSuccess: (data) => {
      setSent(data);
      setCode("");
      setCooldown(30);
    }
  });
  const verify = useMutation({
    mutationFn: async (value: string) => signIn(await api.auth.otpVerify({ identifier: identifier.trim(), code: value, purpose: "login", ...deviceInfo() }))
  });
  const passwordLogin = useMutation({
    mutationFn: async () => signIn(await api.auth.ownerLogin({ email: email.trim(), password, ...deviceInfo() }))
  });

  const idValid = /^\S+@\S+\.\S+$/.test(identifier.trim()) || identifier.replace(/\D/g, "").length >= 10;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen header={<Header back title="Owner sign in" />}>
        <Segmented
          accessibilityLabel="Sign-in method"
          options={[
            { key: "code", label: "One-time code", icon: "keypad-outline" },
            { key: "password", label: "Password", icon: "key-outline" }
          ]}
          value={mode}
          onChange={(m) => setMode(m)}
        />
        {mode === "code" ? (
          sent ? (
            <Stack gap={4}>
              <Text variant="body" color="textMuted">
                We sent a 6-digit code by {sent.channel === "sms" ? "SMS" : "email"} to <Text weight="700">{sent.sentTo}</Text>. It works for 10 minutes.
              </Text>
              <CodeInput value={code} onChange={setCode} error={verify.isError} onComplete={(value) => !verify.isPending && verify.mutate(value)} label="Sign-in code" />
              {verify.isError ? (
                <Text variant="small" color="danger" align="center" accessibilityLiveRegion="polite">
                  {errorMessage(verify.error)}
                </Text>
              ) : null}
              <Button label="Sign in" size="lg" onPress={() => verify.mutate(code)} disabled={code.length !== 6} loading={verify.isPending} fullWidth />
              <Button label={cooldown > 0 ? `Send again in ${cooldown}s` : "Send a new code"} variant="ghost" disabled={cooldown > 0 || request.isPending} onPress={() => request.mutate()} />
              <Button label="Use a different email or mobile" variant="ghost" onPress={() => setSent(null)} />
            </Stack>
          ) : (
            <Stack gap={4}>
              <Input
                label="Email or mobile number"
                placeholder="you@shop.com or 98xxxxxxxx"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="username"
                icon="person-outline"
                error={request.isError ? errorMessage(request.error) : null}
                returnKeyType="send"
                onSubmitEditing={() => idValid && !request.isPending && request.mutate()}
                large
              />
              <Button label="Send code" size="lg" iconRight="arrow-forward" onPress={() => request.mutate()} disabled={!idValid} loading={request.isPending} fullWidth />
              <Text variant="small" color="textMuted" align="center">
                New shop? Go back and choose “Create your shop”.
              </Text>
            </Stack>
          )
        ) : (
          <Stack gap={4}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              icon="mail-outline"
              large
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              secureToggle
              textContentType="password"
              autoComplete="password"
              icon="lock-closed-outline"
              returnKeyType="go"
              onSubmitEditing={() => !passwordLogin.isPending && passwordLogin.mutate()}
              error={passwordLogin.isError ? errorMessage(passwordLogin.error) : null}
              large
            />
            <Button label="Sign in" size="lg" onPress={() => passwordLogin.mutate()} disabled={!email.includes("@") || !password} loading={passwordLogin.isPending} fullWidth />
            <Text variant="small" color="textMuted" align="center">
              Forgot your password? Sign in with a one-time code instead, then change it in Settings.
            </Text>
          </Stack>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
