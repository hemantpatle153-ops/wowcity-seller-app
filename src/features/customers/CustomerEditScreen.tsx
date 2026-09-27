import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { CustomerDetailResponse } from "@/api/types";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { haptic } from "@/lib/haptics";
import { indianStates } from "@/lib/india";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, confirm, EmptyState, ErrorState, Header, Icon, Input, Row, Screen, Select, Skeleton, Stack, Text, toast } from "@/ui";
import { customerBody, formFromCustomer, gstinStateHint, sameForm, validateCustomer, type CustomerForm, type CustomerFormErrors } from "./form";

const stateOptions = indianStates.map((s) => ({ value: s.name as string, label: s.name as string }));

function EditForm({ customer }: { customer: CustomerDetailResponse["customer"] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [initial] = useState(() => formFromCustomer(customer));
  const [form, setForm] = useState<CustomerForm>(initial);
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const dirty = !sameForm(form, initial);
  const set = (patch: Partial<CustomerForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof CustomerForm];
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () => api.customers.update(customer.id, customerBody(form)),
    onSuccess: (res) => {
      haptic.success();
      toast.success(res.message || "Customer updated.");
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["dues"] });
      void qc.invalidateQueries({ queryKey: ["customer-search"] });
      router.back();
    },
    onError: (e) => {
      haptic.error();
      setServerError(errorMessage(e));
    }
  });

  const save = () => {
    const found = validateCustomer(form);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length) {
      haptic.warning();
      return;
    }
    mutation.mutate();
  };

  const leave = async () => {
    if (dirty && !(await confirm({ title: "Discard changes?", message: "Your edits to this customer will be lost.", confirmLabel: "Discard", destructive: true }))) return;
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/customers/[id]", params: { id: customer.id } });
  };

  const hint = gstinStateHint(form);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        header={<Header back onBack={leave} title="Edit customer" subtitle={customer.name} />}
        footerSpace={100}
        footer={
          <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            {serverError ? (
              <Row gap={2}>
                <Icon name="alert-circle" color="danger" size={18} />
                <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                  {serverError}
                </Text>
              </Row>
            ) : null}
            <Button label={dirty ? "Save changes" : "No changes yet"} icon="checkmark" size="lg" variant={dirty ? "primary" : "secondary"} onPress={save} loading={mutation.isPending} disabled={!dirty} fullWidth />
          </View>
        }
      >
        <Card style={{ gap: 14 }}>
          <Input label="Name" value={form.name} onChangeText={(t) => set({ name: t })} error={errors.name} maxLength={120} autoCapitalize="words" textContentType="name" />
          <Input
            label="Mobile"
            prefix="+91"
            value={form.mobile}
            onChangeText={(t) => set({ mobile: t.replace(/\D/g, "").slice(0, 10) })}
            error={errors.mobile}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            hint="10 digits. Leave empty to remove it."
          />
        </Card>
        <Card style={{ gap: 14 }}>
          <Input label="Address" value={form.address} onChangeText={(t) => set({ address: t })} multiline maxLength={200} style={{ minHeight: 64, textAlignVertical: "top" }} />
          <Input label="City" value={form.city} onChangeText={(t) => set({ city: t })} maxLength={60} autoCapitalize="words" />
          <Select label="State" value={form.state} options={stateOptions} onChange={(v) => set({ state: v })} placeholder="Choose state" searchable error={errors.state} sheetTitle="State" />
        </Card>
        <Card style={{ gap: 8 }}>
          <Input
            label="GSTIN (for B2B bills)"
            value={form.gstin}
            onChangeText={(t) => set({ gstin: t.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15) })}
            error={errors.gstin}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="23ABCDE1234F1Z5"
            hint={hint ?? "Optional. 15 characters."}
          />
        </Card>
        <Text variant="caption" color="textMuted" align="center">
          Saving replaces all of these details. Empty fields are cleared.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function CustomerEditScreen({ id }: { id: string }) {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const query = useQuery({ queryKey: ["customers", "detail", id], queryFn: () => api.customers.get(id), enabled: owner });
  if (!owner)
    return (
      <Screen header={<Header back title="Edit customer" />}>
        <EmptyState icon="lock-closed-outline" tone="warning" title="Owner only" body="Only the shop owner can edit customers." />
      </Screen>
    );
  if (query.data) return <EditForm key={query.data.customer.id} customer={query.data.customer} />;
  return (
    <Screen header={<Header back title="Edit customer" />}>
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <Stack gap={4}>
          <Skeleton height={170} radius={theme.radius.card} />
          <Skeleton height={230} radius={theme.radius.card} />
        </Stack>
      )}
    </Screen>
  );
}
