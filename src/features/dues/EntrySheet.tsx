import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api, errorMessage } from "@/api";
import { uuid } from "@/lib/id";
import { formatDate, formatMoney, isoDay } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Button, Calendar, Chip, Icon, Input, Row, Sheet, Stack, Text, toast } from "@/ui";
import { addDays } from "@/features/reports/ranges";
import { entryBody, parseAmount, payModes, quickAmounts, validateEntry, type EntryDraft, type EntryErrors, type Party } from "./logic";

/**
 * Record a payment (or, owner only, add a due) against a customer or supplier.
 * Mount with a fresh `key` each time it opens: the idempotency key is made once per form and
 * reused on every retry, so a flaky network can never record the same payment twice.
 */
export function EntrySheet({
  visible,
  onClose,
  onSaved,
  party,
  partyId,
  partyName,
  balance,
  kind
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  party: Party;
  partyId: string;
  partyName: string;
  balance: number;
  kind: "payment" | "due";
}) {
  const qc = useQueryClient();
  const today = isoDay();
  const [requestId] = useState(uuid);
  const [draft, setDraft] = useState<EntryDraft>({
    amount: kind === "payment" && balance > 0 ? String(Math.round(balance * 100) / 100) : "",
    date: today,
    reference: "",
    note: "",
    mode: kind === "payment" ? "cash" : null
  });
  const [errors, setErrors] = useState<EntryErrors>({});
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "other">("today");
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (patch: Partial<EntryDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key as keyof EntryErrors];
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () => api.dues.record(entryBody({ requestId, party, partyId, kind, draft, today })),
    onSuccess: (res) => {
      haptic.success();
      toast.success(res.message || "Saved");
      void qc.invalidateQueries({ queryKey: ["dues"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
      onSaved?.();
      onClose();
    },
    onError: (e) => {
      haptic.error();
      setServerError(errorMessage(e));
    }
  });

  const submit = () => {
    const found = validateEntry(draft, kind, today);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length) {
      haptic.warning();
      return;
    }
    mutation.mutate();
  };

  const amount = parseAmount(draft.amount);
  const verb = kind === "due" ? "Add due" : "Save payment";
  const title = kind === "due" ? `Add due for ${partyName}` : party === "customer" ? `Payment from ${partyName}` : `Payment to ${partyName}`;
  const subtitle = balance > 0 ? `${party === "customer" ? "Owes" : "You owe"} ${formatMoney(balance)}` : balance < 0 ? `Advance ${formatMoney(-balance)}` : "Nothing outstanding";

  return (
    <Sheet
      visible={visible}
      onClose={mutation.isPending ? () => undefined : onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <Stack gap={2}>
          {serverError ? (
            <Row gap={2}>
              <Icon name="alert-circle" color="danger" size={18} />
              <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                {serverError}
              </Text>
            </Row>
          ) : null}
          <Button
            label={amount && amount > 0 ? `${verb} · ${formatMoney(amount)}` : verb}
            size="lg"
            variant={kind === "due" ? "primary" : "success"}
            icon={kind === "due" ? "add-circle-outline" : "checkmark-circle-outline"}
            onPress={submit}
            loading={mutation.isPending}
            fullWidth
          />
        </Stack>
      }
    >
      <Input
        label="Amount"
        prefix="₹"
        large
        value={draft.amount}
        onChangeText={(t) => set({ amount: t.replace(/[^0-9.,]/g, "") })}
        keyboardType="decimal-pad"
        error={errors.amount}
        autoFocus={kind === "due"}
        accessibilityLabel="Amount in rupees"
      />
      {kind === "payment" ? (
        <Row gap={2} wrap>
          {quickAmounts(balance).map((q) => (
            <Chip key={q.label} label={q.label} selected={amount === q.value} onPress={() => set({ amount: String(q.value) })} />
          ))}
        </Row>
      ) : null}

      {kind === "payment" ? (
        <Stack gap={1}>
          <Text variant="small" weight="600" color="textMuted">
            Paid by
          </Text>
          <Row gap={2} wrap>
            {payModes.map((m) => (
              <Chip key={m.key} label={m.label} icon={m.icon} selected={draft.mode === m.key} onPress={() => set({ mode: m.key })} />
            ))}
          </Row>
          {errors.mode ? (
            <Text variant="small" color="danger">
              {errors.mode}
            </Text>
          ) : null}
        </Stack>
      ) : null}

      <Stack gap={1}>
        <Text variant="small" weight="600" color="textMuted">
          Date
        </Text>
        <Row gap={2} wrap>
          <Chip
            label="Today"
            selected={dateMode === "today"}
            onPress={() => {
              setDateMode("today");
              set({ date: today });
            }}
          />
          <Chip
            label="Yesterday"
            selected={dateMode === "yesterday"}
            onPress={() => {
              setDateMode("yesterday");
              set({ date: addDays(today, -1) });
            }}
          />
          <Chip label="Earlier…" icon="calendar-outline" selected={dateMode === "other"} onPress={() => setDateMode("other")} />
        </Row>
        {dateMode === "other" ? (
          <View style={{ gap: 6 }}>
            <Calendar value={draft.date} max={today} onSelect={(day) => set({ date: day })} />
            <Text variant="small" color={errors.date ? "danger" : "textMuted"} accessibilityLiveRegion="polite">
              {errors.date ?? `Recording for ${formatDate(`${draft.date}T12:00:00`)}. Back-dated entries can't be in the future.`}
            </Text>
          </View>
        ) : errors.date ? (
          <Text variant="small" color="danger">
            {errors.date}
          </Text>
        ) : null}
      </Stack>

      <View style={{ gap: 12 }}>
        {kind === "payment" ? (
          <Input
            label="Reference (optional)"
            value={draft.reference}
            onChangeText={(t) => set({ reference: t })}
            placeholder="UPI ref, cheque no."
            maxLength={60}
            error={errors.reference}
            autoCapitalize="characters"
          />
        ) : null}
        <Input
          label={kind === "due" ? "Reason (shows on the statement)" : "Note (optional)"}
          value={draft.note}
          onChangeText={(t) => set({ note: t })}
          placeholder={kind === "due" ? "e.g. Opening balance" : "e.g. Paid at the counter"}
          maxLength={120}
          error={errors.note}
        />
      </View>
    </Sheet>
  );
}
