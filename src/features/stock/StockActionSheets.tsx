import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api, errorMessage } from "@/api";
import type { StockItemDetail } from "@/api/types";
import { formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { uuid } from "@/lib/id";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Icon, Input, Row, Segmented, Select, Sheet, Text, toast } from "@/ui";
import { QtyStepper } from "./QtyStepper";
import { adjustReasons, qtyString, shortStoreName, type AdjustReason } from "./stockLogic";

type StoreStock = StockItemDetail["stock"][number];

function Arrow({ from, to, label }: { from: number; to: number; label: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={`${label}: ${formatQty(from)} becomes ${formatQty(to)}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: theme.radius.control, backgroundColor: theme.colors.surfaceSunken }}
    >
      <Text variant="small" color="textMuted" style={{ flex: 1 }} numberOfLines={2}>
        {label}
      </Text>
      <Text variant="title" tabular color="textMuted">
        {formatQty(from)}
      </Text>
      <Icon name="arrow-forward" size={18} color="textMuted" />
      <Text variant="title" tabular weight="800" color={to <= 0 ? "danger" : "text"}>
        {formatQty(to)}
      </Text>
    </View>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Row gap={2}>
      <Icon name="alert-circle" color="danger" size={18} />
      <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
        {message}
      </Text>
    </Row>
  );
}

/** Owner-only stock correction. Mount with a fresh `key` each time it opens so the form resets. */
export function AdjustSheet({ visible, onClose, item, defaultStoreId }: { visible: boolean; onClose: () => void; item: StockItemDetail; defaultStoreId: string | null }) {
  const qc = useQueryClient();
  const stores = item.stock;
  const [storeId, setStoreId] = useState(stores.find((s) => s.storeId === defaultStoreId)?.storeId ?? stores[0]?.storeId ?? "");
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<AdjustReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const store = stores.find((s) => s.storeId === storeId);
  const available = store?.available ?? 0;
  const maxRemove = Math.max(0, available);
  const after = direction === "add" ? available + qty : available - qty;

  const save = useMutation({
    mutationFn: () => api.stock.adjust({ variantId: item.variantId, storeId, direction, qty: qtyString(qty), reason: reason as AdjustReason, note: note.trim() || undefined }),
    onSuccess: (result) => {
      toast.success(result.message);
      void qc.invalidateQueries({ queryKey: ["stock"] });
      onClose();
    },
    onError: (e) => {
      haptic.error();
      setError(errorMessage(e));
    }
  });

  const submit = () => {
    if (!reason) {
      haptic.warning();
      setError("Pick a reason.");
      return;
    }
    if (direction === "remove" && qty > maxRemove) {
      haptic.warning();
      setError(`Only ${formatQty(available)} in this store.`);
      return;
    }
    setError(null);
    save.mutate();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Adjust stock"
      subtitle="Record damage, loss, finds and count fixes"
      footer={
        <>
          <ErrorLine message={error} />
          <Button
            label={direction === "add" ? `Add ${formatQty(qty)}` : `Remove ${formatQty(qty)}`}
            icon={direction === "add" ? "add-circle-outline" : "remove-circle-outline"}
            variant={direction === "add" ? "primary" : "danger"}
            size="lg"
            fullWidth
            loading={save.isPending}
            disabled={!storeId || qty <= 0 || (direction === "remove" && maxRemove <= 0)}
            onPress={submit}
          />
        </>
      }
    >
      {stores.length > 1 ? (
        <Select
          label="Store"
          value={storeId}
          onChange={(v) => {
            setStoreId(v);
            setError(null);
          }}
          options={stores.map((s) => ({ value: s.storeId, label: shortStoreName(s.store), hint: `${formatQty(s.available)} available`, icon: "storefront-outline" as const }))}
        />
      ) : null}
      <Segmented
        accessibilityLabel="Add or remove"
        options={[
          { key: "remove", label: "Remove", icon: "remove-circle-outline" },
          { key: "add", label: "Add", icon: "add-circle-outline" }
        ]}
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setError(null);
          if (d === "remove" && qty > maxRemove) setQty(Math.max(1, maxRemove));
        }}
      />
      <Row justify="space-between" gap={3} wrap>
        <Text variant="bodyStrong" style={{ flex: 1, minWidth: 100 }}>
          Quantity
        </Text>
        <QtyStepper value={qty} onChange={setQty} min={1} max={direction === "remove" ? Math.max(1, maxRemove) : 9999} />
      </Row>
      <Arrow from={available} to={after} label={store ? `${shortStoreName(store.store)} stock` : "Stock"} />
      <Select
        label="Reason"
        value={reason}
        placeholder="Why is stock changing?"
        onChange={(v) => {
          setReason(v);
          setError(null);
        }}
        options={adjustReasons.map((r) => ({ value: r.value, label: r.label, icon: r.icon }))}
        error={error === "Pick a reason." ? error : null}
      />
      <Input label="Note (optional)" value={note} onChangeText={(t) => setNote(t.slice(0, 200))} placeholder="e.g. torn seam, found in back room" hint={`${note.length}/200`} multiline />
    </Sheet>
  );
}

/** Owner-only move between two stores. The idempotency key lives as long as this form. */
export function TransferSheet({ visible, onClose, item, defaultStoreId }: { visible: boolean; onClose: () => void; item: StockItemDetail; defaultStoreId: string | null }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const stores: StoreStock[] = item.stock;
  const firstWithStock = stores.find((s) => s.storeId === defaultStoreId && s.available > 0) ?? stores.find((s) => s.available > 0) ?? stores[0];
  const [fromId, setFromId] = useState(firstWithStock?.storeId ?? "");
  const [toId, setToId] = useState(stores.find((s) => s.storeId !== firstWithStock?.storeId)?.storeId ?? "");
  const [qty, setQty] = useState(1);
  const [key, setKey] = useState(uuid);
  const [error, setError] = useState<string | null>(null);
  const from = stores.find((s) => s.storeId === fromId);
  const to = stores.find((s) => s.storeId === toId);
  const available = Math.max(0, from?.available ?? 0);

  const save = useMutation({
    mutationFn: () => api.stock.transfer({ variantId: item.variantId, fromStoreId: fromId, toStoreId: toId, qty: qtyString(qty), idempotencyKey: key }),
    onSuccess: (result) => {
      toast.success(result.message);
      setKey(uuid());
      void qc.invalidateQueries({ queryKey: ["stock"] });
      onClose();
    },
    onError: (e) => {
      haptic.error();
      setError(errorMessage(e));
    }
  });

  const pickFrom = (id: string) => {
    setFromId(id);
    setError(null);
    if (id === toId) setToId(stores.find((s) => s.storeId !== id)?.storeId ?? "");
    const nextAvailable = Math.max(0, stores.find((s) => s.storeId === id)?.available ?? 0);
    if (qty > nextAvailable) setQty(Math.max(1, nextAvailable));
  };

  const options = stores.map((s) => ({ value: s.storeId, label: shortStoreName(s.store), hint: `${formatQty(s.available)} available`, icon: "storefront-outline" as const }));
  const blocked = !fromId || !toId || fromId === toId || available <= 0 || qty > available;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Move to another store"
      subtitle="A transfer challan is created"
      footer={
        <>
          <ErrorLine message={error ?? (available <= 0 && from ? `No stock in ${shortStoreName(from.store)} to move.` : null)} />
          <Button label={`Move ${formatQty(qty)} pcs`} icon="swap-horizontal" size="lg" fullWidth loading={save.isPending} disabled={blocked} onPress={() => save.mutate()} />
        </>
      }
    >
      <Select label="From" value={fromId} onChange={pickFrom} options={options} />
      <View style={{ alignItems: "center", marginVertical: -4 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accentSoft }}>
          <Icon name="arrow-down" size={18} color="accentSoftText" />
        </View>
      </View>
      <Select
        label="To"
        value={toId}
        onChange={(id) => {
          setToId(id);
          setError(null);
        }}
        options={options.filter((o) => o.value !== fromId)}
      />
      <Row justify="space-between" gap={3} wrap>
        <View style={{ flex: 1, minWidth: 100 }}>
          <Text variant="bodyStrong">Quantity</Text>
          <Text variant="small" color="textMuted">
            Up to {formatQty(available)}
          </Text>
        </View>
        <QtyStepper value={qty} onChange={setQty} min={1} max={Math.max(1, available)} />
      </Row>
      {from && to ? (
        <View style={{ gap: 8 }}>
          <Arrow from={from.available} to={from.available - qty} label={shortStoreName(from.store)} />
          <Arrow from={to.available} to={to.available + qty} label={shortStoreName(to.store)} />
        </View>
      ) : null}
    </Sheet>
  );
}
