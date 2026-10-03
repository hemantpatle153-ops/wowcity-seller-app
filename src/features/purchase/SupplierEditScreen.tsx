import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { SupplierRow } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, EmptyState, ErrorState, Header, Icon, Row, Screen, SkeletonCards, Text, toast } from "@/ui";
import { useSuppliers } from "./queries";
import { emptySupplierForm, SupplierFields, supplierFormErrors, type SupplierForm } from "./SupplierFields";

function SupplierFormView({ supplier, initialName }: { supplier: SupplierRow | null; initialName?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const [form, setForm] = useState<SupplierForm>(() =>
    supplier ? { name: supplier.name, mobile: supplier.mobile, gstin: supplier.gstin, state: supplier.state, address: supplier.address } : { ...emptySupplierForm, name: initialName ?? "" }
  );
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = supplierFormErrors(form);
  const save = useMutation({
    // POST /suppliers replaces the record: send every field, starting from the loaded values
    // (a form action treats an omitted field as empty, so blanks are left out rather than sent as "").
    mutationFn: () =>
      api.suppliers.save({
        ...(supplier ? { supplierId: supplier.id } : {}),
        name: form.name.trim(),
        mobile: form.mobile.replace(/\D/g, "") || undefined,
        gstin: form.gstin.trim().toUpperCase() || undefined,
        state: form.state || undefined,
        address: form.address.trim() || undefined
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void qc.invalidateQueries({ queryKey: ["purchases"] });
      void qc.invalidateQueries({ queryKey: ["dues"] });
      router.back();
    },
    onError: (e) => {
      haptic.error();
      setError(errorMessage(e));
    }
  });
  const submit = () => {
    setTried(true);
    setError(null);
    if (Object.keys(errors).length) {
      haptic.warning();
      return;
    }
    save.mutate();
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen
        header={<Header back title={supplier ? "Edit supplier" : "New supplier"} subtitle={supplier?.name} />}
        footerSpace={90}
        footer={
          <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            {error ? (
              <Row gap={2}>
                <Icon name="alert-circle" color="danger" size={18} />
                <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                  {error}
                </Text>
              </Row>
            ) : null}
            <Button label={supplier ? "Save changes" : "Add supplier"} icon="checkmark" size="lg" fullWidth loading={save.isPending} onPress={submit} />
          </View>
        }
      >
        {supplier ? (
          <Card style={{ gap: 10 }}>
            <Row gap={2} wrap>
              <Badge label={`${supplier.bills} bill${supplier.bills === 1 ? "" : "s"}`} icon="receipt-outline" />
              {supplier.purchased !== null ? <Badge label={`Bought ${formatMoney(supplier.purchased, { decimals: 0 })}`} showIcon={false} /> : null}
              {supplier.balance !== null && supplier.balance > 0 ? <Badge label={`You owe ${formatMoney(supplier.balance)}`} tone="warning" /> : null}
              {!supplier.active ? <Badge label="Inactive" icon="pause-circle-outline" /> : null}
            </Row>
            {can(me, "reports.due") ? <Button label="Statement & dues" icon="document-text-outline" variant="soft" onPress={() => router.push(`/dues/supplier/${supplier.id}`)} /> : null}
          </Card>
        ) : null}
        <Card>
          <SupplierFields value={form} onChange={setForm} errors={tried ? errors : {}} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function SupplierEditScreen({ id, name }: { id?: string; name?: string }) {
  const list = useSuppliers("");
  const me = useSession((s) => s.me);
  if (!can(me, "purchase.create")) {
    return (
      <Screen header={<Header back title="Supplier" />}>
        <EmptyState icon="lock-closed-outline" title="You can't edit suppliers" body="Ask the owner for purchase access." />
      </Screen>
    );
  }
  if (!id) return <SupplierFormView supplier={null} initialName={name} />;
  if (list.isLoading) {
    return (
      <Screen header={<Header back title="Edit supplier" />}>
        <SkeletonCards count={2} height={160} />
      </Screen>
    );
  }
  const supplier = list.data?.suppliers.find((s) => s.id === id);
  if (list.isError || !supplier) {
    return (
      <Screen header={<Header back title="Edit supplier" />}>
        <ErrorState message={list.isError ? errorMessage(list.error) : "This supplier was not found."} onRetry={() => list.refetch()} />
      </Screen>
    );
  }
  return <SupplierFormView key={supplier.id} supplier={supplier} />;
}
