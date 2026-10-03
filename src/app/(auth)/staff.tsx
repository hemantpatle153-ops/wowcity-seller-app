import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { type TextInput } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { api, errorMessage } from "@/api";
import { deviceInfo, useSession } from "@/auth/session";
import { usePreferences } from "@/state/preferences";
import { Button, Card, Header, Icon, Input, Row, Screen, Stack, Text } from "@/ui";

export default function StaffSignIn() {
  const signIn = useSession((s) => s.signIn);
  const prefs = usePreferences();
  const [shopCode, setShopCode] = useState(prefs.lastShopCode);
  const [username, setUsername] = useState(prefs.lastUsername);
  const [pin, setPin] = useState("");
  const [numeric, setNumeric] = useState(true);
  const userRef = useRef<TextInput>(null);
  const pinRef = useRef<TextInput>(null);

  const login = useMutation({
    mutationFn: async () => {
      const tokens = await api.auth.staffLogin({ shopCode: shopCode.trim().toUpperCase(), username: username.trim().toLowerCase(), pin, ...deviceInfo() });
      prefs.set({ lastShopCode: shopCode.trim().toUpperCase(), lastUsername: username.trim().toLowerCase() });
      return signIn(tokens);
    },
    onError: () => setPin("")
  });
  const ready = shopCode.trim().length >= 3 && username.trim().length > 0 && pin.length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen header={<Header back title="Staff sign in" subtitle="Your owner gives you these details" />}>
        <Stack gap={4}>
          <Input
            label="Shop code"
            placeholder="e.g. ABC123"
            value={shopCode}
            onChangeText={(t) => setShopCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            icon="storefront-outline"
            returnKeyType="next"
            onSubmitEditing={() => userRef.current?.focus()}
            large
          />
          <Input
            ref={userRef}
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
            icon="person-outline"
            returnKeyType="next"
            onSubmitEditing={() => pinRef.current?.focus()}
            large
          />
          <Input
            ref={pinRef}
            label={numeric ? "PIN" : "Password"}
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            secureToggle
            keyboardType={numeric ? "number-pad" : "default"}
            textContentType="password"
            autoComplete="password"
            icon="lock-closed-outline"
            returnKeyType="go"
            onSubmitEditing={() => ready && !login.isPending && login.mutate()}
            error={login.isError ? errorMessage(login.error) : null}
            large
          />
          <Button label={numeric ? "My login uses letters (password)" : "My login is a number (PIN)"} variant="ghost" size="sm" onPress={() => setNumeric(!numeric)} />
          <Button label="Sign in" size="lg" onPress={() => login.mutate()} disabled={!ready} loading={login.isPending} fullWidth />
          <Card>
            <Row gap={3} align="flex-start">
              <Icon name="time-outline" color="textMuted" size={20} />
              <Text variant="small" color="textMuted" style={{ flex: 1 }}>
                You can sign in during your working hours. If you can&apos;t, ask the shop owner to check your access in Staff.
              </Text>
            </Row>
          </Card>
        </Stack>
      </Screen>
    </KeyboardAvoidingView>
  );
}
