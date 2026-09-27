import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { api, errorMessage } from "@/api";
import type { PurchaseSetupResponse } from "@/api/types";
import { maskMobile } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Button, Icon, ListRow, SearchBar, Segmented, Sheet, Stack, Text, toast } from "@/ui";
import { purchaseKeys } from "./queries";
import { SupplierFields, supplierFormErrors, emptySupplierForm, type SupplierForm } from "./SupplierFields";

type Supplier = PurchaseSetupResponse["suppliers"][number];

/** Pick the supplier for a purchase, type a new name, or add a supplier with details. */
export function SupplierSheet({
  visible,
  onClose,
  suppliers,
  current,
  onPick
}: {
  visible: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  current: { id: string | null; name: string } | null;
  onPick: (supplier: { id: string | null; name: string } | null) => void;
}) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"find" | "new">("find");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm);
  const [tried, setTried] = useState(false);
  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => (term ? suppliers.filter((s) => [s.name, s.mobile, s.gstin].some((v) => (v ?? "").toLowerCase().includes(term))) : suppliers).slice(0, 80), [suppliers, term]);
  const exact = suppliers.some((s) => s.name.toLowerCase() === term);
  const errors = supplierFormErrors(form);

  const close = () => {
    setQ("");
    setTab("find");
    setTried(false);
    setForm(emptySupplierForm);
    onClose();
  };
  const pick = (s: { id: string | null; name: string } | null) => {
    haptic.select();
    onPick(s);
    close();
  };

  const add = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const result = await api.suppliers.save({
        name,
        mobile: form.mobile.replace(/\D/g, "") || undefined,
        gstin: form.gstin.trim().toUpperCase() || undefined,
        state: form.state || undefined,
        address: form.address.trim() || undefined
      });
      // POST /suppliers returns no id: refetch the setup and find the new supplier by name.
      await qc.invalidateQueries({ queryKey: purchaseKeys.setup });
      const setup = await qc.fetchQuery({ queryKey: purchaseKeys.setup, queryFn: () => api.purchases.setup() });
      void qc.invalidateQueries({ queryKey: ["purchases", "suppliers"] });
      const created = setup.suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
      return { message: result.message, supplier: created ? { id: created.id, name: created.name } : { id: null, name } };
    },
    onSuccess: ({ message, supplier }) => {
      toast.success(message);
      pick(supplier);
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Supplier"
      subtitle="Who sent this stock?"
      footer={
        tab === "new" ? (
          <Button
            label="Add supplier"
            icon="person-add-outline"
            size="lg"
            fullWidth
            loading={add.isPending}
            onPress={() => {
              setTried(true);
              if (Object.keys(errors).length) {
                haptic.warning();
                return;
              }
              add.mutate();
            }}
          />
        ) : undefined
      }
    >
      <Segmented
        accessibilityLabel="Find or add a supplier"
        options={[
          { key: "find", label: "Find", icon: "search" },
          { key: "new", label: "Add supplier", icon: "person-add-outline" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "find" ? (
        <Stack gap={2}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Supplier name, mobile or GSTIN" />
          <View style={{ marginHorizontal: -theme.space[4] }}>
            {current ? <ListRow title="No supplier" subtitle="Cash purchase without a supplier account" icon="remove-circle-outline" iconTone="neutral" onPress={() => pick(null)} /> : null}
            {q.trim() && !exact ? (
              <ListRow
                title={`Use “${q.trim()}”`}
                subtitle="Saved as a new supplier with this purchase"
                icon="add-circle-outline"
                onPress={() => pick({ id: null, name: q.trim() })}
                accessibilityHint="Uses this name without extra details"
              />
            ) : null}
            {filtered.map((s) => (
              <ListRow
                key={s.id}
                left={<Avatar name={s.name} />}
                title={s.name}
                subtitle={[maskMobile(s.mobile), s.gstin, s.state].filter(Boolean).join(" · ") || undefined}
                right={current?.id === s.id ? <Icon name="checkmark-circle" color="accent" /> : undefined}
                accessibilityLabel={`${s.name}${current?.id === s.id ? ", selected" : ""}`}
                onPress={() => pick({ id: s.id, name: s.name })}
              />
            ))}
            {!filtered.length && !q.trim() ? (
              <View style={{ padding: 16, alignItems: "center", gap: 8 }}>
                <Text color="textMuted" align="center">
                  No suppliers yet.
                </Text>
                <Button label="Add your first supplier" variant="soft" icon="person-add-outline" onPress={() => setTab("new")} />
              </View>
            ) : null}
            {q.trim() && !filtered.length ? (
              <View style={{ padding: 16, alignItems: "center", gap: 8 }}>
                <Text color="textMuted" align="center">
                  No supplier matches “{q.trim()}”.
                </Text>
                <Button
                  label="Add with details"
                  variant="soft"
                  icon="person-add-outline"
                  onPress={() => {
                    setForm({ ...emptySupplierForm, name: q.trim() });
                    setTab("new");
                  }}
                />
              </View>
            ) : null}
          </View>
        </Stack>
      ) : (
        <SupplierFields value={form} onChange={setForm} errors={tried ? errors : {}} />
      )}
    </Sheet>
  );
}
