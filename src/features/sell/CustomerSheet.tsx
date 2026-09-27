import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { ApiError } from "@/api/errors";
import { useCurrentStore } from "@/auth/session";
import { formatMoney, maskMobile } from "@/lib/format";
import { indianStates } from "@/lib/india";
import { offlineStore } from "@/offline/store";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, Button, Input, ListRow, SearchBar, Segmented, Select, Sheet, SkeletonList, Stack, Text } from "@/ui";
import type { CartCustomer } from "./cart";

type Found = { id: string; name: string; mobile: string | null; state: string | null; balance: number };

function useCustomerSearch(q: string) {
  const online = useConnectivity((s) => s.online);
  const term = q.trim();
  return useQuery({
    queryKey: ["customer-search", term, online],
    enabled: term.length >= 2,
    staleTime: 20_000,
    queryFn: async (): Promise<Found[]> => {
      if (online) {
        try {
          return (await api.customers.search(term)).customers;
        } catch (error) {
          if (!(error instanceof ApiError && error.isNetwork)) throw error;
        }
      }
      return (await offlineStore.searchCustomers(term)).map((c) => ({ id: c.id, name: c.name, mobile: c.mobile, state: c.state, balance: c.balance }));
    }
  });
}

export function balanceBadge(balance: number | undefined) {
  if (!balance) return null;
  return balance > 0 ? <Badge label={`Owes ${formatMoney(balance)}`} tone="warning" /> : <Badge label={`Advance ${formatMoney(-balance)}`} tone="success" />;
}

/** Find a customer by name or mobile, or add a new one to this bill. */
export function CustomerSheet({ visible, onClose, current, onPick }: { visible: boolean; onClose: () => void; current: CartCustomer | null; onPick: (customer: CartCustomer | null) => void }) {
  const theme = useTheme();
  const store = useCurrentStore();
  const [tab, setTab] = useState<"find" | "new">("find");
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [state, setState] = useState(store?.state ?? "");
  const search = useCustomerSearch(q);
  const digits = mobile.replace(/\D/g, "");
  const mobileError = digits && digits.length !== 10 ? "Enter a 10-digit mobile number." : null;
  const pick = (c: CartCustomer | null) => {
    onPick(c);
    setQ("");
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Customer" subtitle="Needed for credit bills and dues">
      <Segmented
        options={[
          { key: "find", label: "Find", icon: "search" },
          { key: "new", label: "New customer", icon: "person-add-outline" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "find" ? (
        <Stack gap={2}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Name or mobile number" autoFocus />
          <View style={{ marginHorizontal: -theme.space[4] }}>
            {current ? <ListRow title="Walk-in customer" subtitle="Remove the customer from this bill" icon="walk-outline" iconTone="neutral" onPress={() => pick(null)} /> : null}
            {search.isFetching && !search.data ? <SkeletonList rows={3} /> : null}
            {(search.data ?? []).map((c) => (
              <ListRow
                key={c.id}
                left={<Avatar name={c.name} />}
                title={c.name}
                subtitle={[maskMobile(c.mobile), c.state].filter(Boolean).join(" · ")}
                right={balanceBadge(c.balance)}
                onPress={() => pick({ id: c.id, name: c.name, mobile: c.mobile ?? "", state: c.state ?? undefined, balance: c.balance })}
              />
            ))}
            {q.trim().length >= 2 && search.data && !search.data.length ? (
              <View style={{ padding: 16, gap: 8, alignItems: "center" }}>
                <Text color="textMuted">No customer matches “{q}”.</Text>
                <Button
                  label="Add as new customer"
                  variant="soft"
                  icon="person-add-outline"
                  onPress={() => {
                    const isNumber = /^\d[\d ]{5,}$/.test(q.trim());
                    if (isNumber) setMobile(q.trim());
                    else setName(q.trim());
                    setTab("new");
                  }}
                />
              </View>
            ) : null}
            {q.trim().length < 2 ? (
              <Text variant="small" color="textMuted" align="center" style={{ padding: 16 }}>
                Type at least 2 letters or digits.
              </Text>
            ) : null}
          </View>
        </Stack>
      ) : (
        <Stack gap={3}>
          <Input label="Name" value={name} onChangeText={setName} autoComplete="name" icon="person-outline" autoFocus />
          <Input label="Mobile" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" icon="call-outline" error={mobileError} hint="Used for WhatsApp receipts and due reminders." />
          <Select label="State" value={state} options={indianStates.map((s) => ({ value: s.name, label: s.name }))} onChange={setState} searchable />
          <Button label="Add to bill" size="lg" fullWidth disabled={!name.trim() || !!mobileError} onPress={() => pick({ name: name.trim(), mobile: digits, state })} />
        </Stack>
      )}
    </Sheet>
  );
}
