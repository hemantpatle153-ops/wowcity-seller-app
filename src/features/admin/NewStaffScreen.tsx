import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInLeft, FadeInRight, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { PermissionGroup, RolePreset, StaffCreateBody, WorkerGrantablePermission } from "@/api/types";
import { useSession } from "@/auth/session";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Chip, ErrorState, Header, Icon, Input, Row, Screen, SectionTitle, SkeletonCards, Stack, Text } from "@/ui";
import { Callout, CredentialsSheet, FormSection, PermissionEditor, RolePicker, StickyFooter, StorePicker } from "./components";
import { adminKeys, useAdminMutation, useStaffList, useUnsavedGuard } from "./hooks";
import { matchPreset, normalizePermissions } from "./roles";
import { cleanUsername, generatePin, mobileError, nameError, secretError, suggestUsername, usernameError } from "./validation";

const STEPS = ["Details", "Sign-in", "Access"] as const;

function Progress({ step }: { step: number }) {
  const theme = useTheme();
  const target = (step + 1) / STEPS.length;
  const progress = useSharedValue(target);
  useEffect(() => {
    progress.set(theme.reduceMotion ? target : withSpring(target, theme.motion.spring));
  }, [progress, target, theme.reduceMotion, theme.motion.spring]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  return (
    <View style={{ paddingHorizontal: theme.space[4], gap: 8, paddingBottom: theme.space[2] }} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceSunken, overflow: "hidden" }}>
        <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: theme.colors.accent }, fill]} />
      </View>
      <Row justify="space-between">
        {STEPS.map((label, i) => (
          <Row key={label} gap={1}>
            <Icon name={i < step ? "checkmark-circle" : i === step ? "ellipse" : "ellipse-outline"} size={16} color={i <= step ? "accent" : "textFaint"} />
            <Text variant="caption" weight={i === step ? "800" : "600"} color={i <= step ? "text" : "textMuted"}>
              {label}
            </Text>
          </Row>
        ))}
      </Row>
    </View>
  );
}

function Wizard({ groups, presets, taken }: { groups: PermissionGroup[]; presets: RolePreset[]; taken: string[] }) {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const stores = me?.stores ?? [];
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [permissions, setPermissions] = useState<WorkerGrantablePermission[]>(normalizePermissions(presets.find((p) => p.key === "cashier")?.permissions ?? ["sale.create"]));
  const [showAll, setShowAll] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>(stores.length === 1 ? [stores[0].id] : []);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [created, setCreated] = useState<{ id: string; username: string; pin: string; name: string } | null>(null);

  const effectiveUsername = usernameEdited ? username : suggestUsername(name, taken);
  const errors = {
    name: nameError(name),
    mobile: mobileError(mobile),
    username: usernameError(effectiveUsername, taken),
    pin: secretError(pin),
    permissions: permissions.length ? null : "Pick at least one thing they can do.",
    stores: storeIds.length ? null : "Pick at least one store."
  };
  const stepErrors = [
    [errors.name, errors.mobile],
    [errors.username, errors.pin],
    [errors.permissions, errors.stores]
  ];
  const dirty = !created && (!!name || !!mobile || !!pin);
  const guard = useUnsavedGuard(dirty);

  const create = useAdminMutation((body: StaffCreateBody) => api.staff.create(body), {
    invalidate: [adminKeys.staff, adminKeys.stores],
    toast: false,
    onSuccess: (result, body) => {
      guard.allowLeave();
      setCreated({ id: result.workerId, username: body.username, pin: body.password, name: body.displayName });
    }
  });

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const nextStep = () => {
    setTouched({ ...touched, [step]: true });
    if (stepErrors[step].some(Boolean)) {
      haptic.warning();
      return;
    }
    if (step < STEPS.length - 1) {
      go(step + 1);
      return;
    }
    const preset = matchPreset(permissions, presets);
    create.mutate({
      displayName: name.trim(),
      username: cleanUsername(effectiveUsername),
      password: pin,
      mobile: mobile.trim() || undefined,
      ...(preset !== "custom" ? { preset } : { permissions }),
      storeIds
    });
  };
  const show = (i: number) => !!touched[i];
  const entering = theme.reduceMotion ? undefined : (direction === 1 ? FadeInRight : FadeInLeft).duration(240);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen
        header={
          <>
            <Header back title="Add staff" onBack={step > 0 ? () => go(step - 1) : undefined} />
            <Progress step={step} />
          </>
        }
        footerSpace={110}
        footer={
          <StickyFooter error={create.isError ? errorMessage(create.error) : show(step) ? (stepErrors[step].find(Boolean) ?? null) : null}>
            <Row gap={2}>
              {step > 0 ? <Button label="Back" variant="secondary" size="lg" onPress={() => go(step - 1)} style={{ flex: 1 }} /> : null}
              <Button
                label={step < STEPS.length - 1 ? "Next" : "Add staff"}
                iconRight={step < STEPS.length - 1 ? "arrow-forward" : undefined}
                icon={step === STEPS.length - 1 ? "person-add" : undefined}
                size="lg"
                onPress={nextStep}
                loading={create.isPending}
                style={{ flex: 2 }}
              />
            </Row>
          </StickyFooter>
        }
      >
        <Animated.View key={step} entering={entering} layout={theme.reduceMotion ? undefined : LinearTransition} style={{ gap: theme.space[4] }}>
          {step === 0 ? (
            <>
              <Text variant="heading">Who are you adding?</Text>
              <FormSection title="Their details">
                <Input label="Full name" value={name} onChangeText={setName} autoCapitalize="words" autoFocus placeholder="e.g. Ravi Kumar" error={show(0) ? errors.name : null} maxLength={80} />
                <Input
                  label="Mobile (optional)"
                  value={mobile}
                  onChangeText={setMobile}
                  keyboardType="phone-pad"
                  placeholder="10-digit mobile"
                  error={show(0) || mobile.replace(/\D/g, "").length >= 10 ? errors.mobile : null}
                  hint="Only you see this. Handy for sending their sign-in details."
                  maxLength={16}
                />
              </FormSection>
            </>
          ) : step === 1 ? (
            <>
              <Text variant="heading">How they sign in</Text>
              <FormSection title="Username">
                <Input
                  label="Username"
                  value={effectiveUsername}
                  onChangeText={(v) => {
                    setUsernameEdited(true);
                    setUsername(v.toLowerCase().replace(/\s/g, ""));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  prefix="@"
                  maxLength={32}
                  error={effectiveUsername || show(1) ? errors.username : null}
                  right={!errors.username ? <Icon name="checkmark-circle" color="success" accessibilityLabel="Username is available" /> : undefined}
                  hint="Lowercase letters, numbers, dots, dashes or underscores (3–32)."
                />
              </FormSection>
              <FormSection title="PIN or password">
                <Input
                  label="PIN"
                  value={pin}
                  onChangeText={(v) => {
                    setPin(v);
                    setPinVisible(false);
                  }}
                  secureTextEntry
                  secureToggle
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={72}
                  error={show(1) || pin.length >= 6 ? errors.pin : null}
                  hint="At least 6 characters. A 6-digit number is quickest at the counter."
                />
                <Row gap={2} wrap>
                  <Button
                    label="Generate PIN"
                    icon="sparkles-outline"
                    variant="soft"
                    onPress={() => {
                      haptic.tap();
                      setPin(generatePin());
                      setPinVisible(true);
                    }}
                  />
                  {pinVisible && pin ? (
                    <Text variant="title" tabular style={{ letterSpacing: 4 }} accessibilityLabel={`PIN ${pin.split("").join(" ")}`}>
                      {pin}
                    </Text>
                  ) : null}
                </Row>
              </FormSection>
              <Callout icon="key-outline" tone="info">
                {`They sign in with shop code ${me?.shopCode ?? ""}, this username and PIN. You'll get a message you can send them.`}
              </Callout>
            </>
          ) : (
            <>
              <Text variant="heading">What can {name.trim().split(" ")[0] || "they"} do?</Text>
              <Stack gap={2}>
                <SectionTitle title="Role" />
                <RolePicker presets={presets} permissions={permissions} onChange={setPermissions} onCustom={() => setShowAll(true)} />
              </Stack>
              {showAll ? (
                <Stack gap={2}>
                  <SectionTitle title="Permissions" action="Hide" onAction={() => setShowAll(false)} />
                  <PermissionEditor groups={groups} permissions={permissions} onChange={setPermissions} />
                </Stack>
              ) : (
                <View style={{ alignSelf: "flex-start" }}>
                  <Chip label={`Fine-tune ${permissions.length} permissions`} icon="options-outline" onPress={() => setShowAll(true)} />
                </View>
              )}
              {show(2) && errors.permissions ? (
                <Text variant="small" color="danger">
                  {errors.permissions}
                </Text>
              ) : null}
              <Stack gap={2}>
                <SectionTitle title="Stores" />
                <StorePicker stores={stores} value={storeIds} onChange={setStoreIds} error={show(2) ? errors.stores : null} />
              </Stack>
            </>
          )}
        </Animated.View>
      </Screen>
      <CredentialsSheet
        visible={!!created}
        onClose={() => {
          const id = created?.id;
          setCreated(null);
          if (id) router.replace({ pathname: "/staff/[id]", params: { id } });
          else router.back();
        }}
        title={`${created?.name ?? "They"} can now sign in`}
        name={created?.name ?? ""}
        shopCode={me?.shopCode ?? ""}
        username={created?.username ?? ""}
        pin={created?.pin ?? ""}
      />
    </KeyboardAvoidingView>
  );
}

export function NewStaffScreen() {
  const list = useStaffList();
  if (list.data) return <Wizard groups={list.data.permissionGroups} presets={list.data.rolePresets} taken={list.data.staff.map((s) => s.username)} />;
  return (
    <Screen header={<Header back title="Add staff" />}>
      {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : <SkeletonCards count={3} height={120} />}
    </Screen>
  );
}
