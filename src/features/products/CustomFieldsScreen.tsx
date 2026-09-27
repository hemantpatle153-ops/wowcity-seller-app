import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { CustomField, CustomFieldsResponse } from "@/api/types";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useCustomFields } from "@/features/stock/hooks";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  Badge,
  Button,
  Card,
  confirm,
  Divider,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  IconCircle,
  Input,
  PressableScale,
  Row,
  Screen,
  SectionTitle,
  Select,
  Sheet,
  SkeletonList,
  Text,
  toast,
  ToggleRow
} from "@/ui";
import { buildFieldBody, draftFromField, emptyFieldDraft, fieldDraftError, fieldTypeMeta, fieldTypes, looksPrivate, needsOptions, sortFields, type CustomFieldDraft } from "./listingLogic";
import { TagEditor } from "./TagEditor";

const KEY = ["stock", "custom-fields"];

function FieldSheet({ visible, onClose, field, onArchive }: { visible: boolean; onClose: () => void; field: CustomField | null; onArchive: (field: CustomField) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CustomFieldDraft>(() => (field ? draftFromField(field) : emptyFieldDraft));
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<CustomFieldDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  const save = useMutation({
    mutationFn: () => api.customFields.save(buildFieldBody(draft)),
    onSuccess: (result) => {
      toast.success(result.message);
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["purchases", "setup"] });
      onClose();
    },
    onError: (e) => {
      haptic.error();
      setError(errorMessage(e));
    }
  });
  const submit = () => {
    const problem = fieldDraftError(draft);
    if (problem) {
      haptic.warning();
      setError(problem);
      return;
    }
    save.mutate();
  };
  const privateName = looksPrivate(draft.name);
  const typeMeta = fieldTypeMeta(draft.fieldType);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={field ? `Edit ${field.name}` : "New column"}
      subtitle="Extra details you record for each item"
      footer={
        <>
          {error ? (
            <Row gap={2}>
              <Icon name="alert-circle" color="danger" size={18} />
              <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                {error}
              </Text>
            </Row>
          ) : null}
          <Button label={field ? "Save column" : "Add column"} icon="checkmark" size="lg" fullWidth loading={save.isPending} onPress={submit} />
          {field ? <Button label="Archive column" variant="ghost" icon="archive-outline" onPress={() => onArchive(field)} fullWidth /> : null}
        </>
      }
    >
      <Input label="Name" value={draft.name} onChangeText={(t) => update({ name: t.slice(0, 48) })} placeholder="e.g. Fabric, Fit, Season" hint={`${draft.name.length}/48`} autoCapitalize="words" />
      <Select label="Type" value={draft.fieldType} onChange={(fieldType) => update({ fieldType })} options={fieldTypes.map((t) => ({ value: t.value, label: t.label, hint: t.hint, icon: t.icon }))} />
      {typeMeta.hint ? (
        <Text variant="caption" color="textMuted" style={{ marginTop: -6 }}>
          {typeMeta.hint}
        </Text>
      ) : null}
      {needsOptions(draft.fieldType) ? <TagEditor label="Options" value={draft.options} onChange={(options) => update({ options })} max={50} placeholder="Type an option" /> : null}
      <View>
        <SectionTitle title="Where it shows" />
        <ToggleRow label="Show in purchase grid" hint="A column when recording purchases" value={draft.showInPurchaseGrid} onChange={(v) => update({ showInPurchaseGrid: v })} />
        <ToggleRow label="Required on purchase" hint="Can't save a purchase row without it" value={draft.isRequiredOnPurchase} onChange={(v) => update({ isRequiredOnPurchase: v })} />
        <ToggleRow label="Searchable when billing" hint="Find items by this value in Sell" value={draft.showInSaleSearch} onChange={(v) => update({ showInSaleSearch: v })} />
        <Divider />
        <ToggleRow
          label="Can be shown to buyers"
          hint={privateName ? "Names like cost, supplier or margin always stay private" : "Lets you add it to WowCity listings"}
          value={draft.isPublicEligible && !privateName}
          disabled={privateName}
          onChange={(v) => update({ isPublicEligible: v, defaultPublicEnabled: v ? draft.defaultPublicEnabled : false })}
        />
        {draft.isPublicEligible && !privateName ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <ToggleRow label="Show on new listings by default" value={draft.defaultPublicEnabled} onChange={(v) => update({ defaultPublicEnabled: v })} />
          </Animated.View>
        ) : null}
      </View>
    </Sheet>
  );
}

function FieldRow({
  field,
  first,
  last,
  onEdit,
  onMove,
  moving
}: {
  field: CustomField;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  moving: boolean;
}) {
  const theme = useTheme();
  const meta = fieldTypeMeta(field.field_type);
  const flags = [
    field.is_required_on_purchase ? { label: "Required", tone: "warning" as const, icon: "alert-circle-outline" as const } : null,
    field.is_public_eligible ? { label: field.default_public_enabled ? "Public by default" : "Can be public", tone: "success" as const, icon: "globe-outline" as const } : null,
    field.show_in_sale_search ? { label: "Sale search", tone: "info" as const, icon: "search-outline" as const } : null,
    !field.show_in_purchase_grid ? { label: "Not in purchase grid", tone: "neutral" as const, icon: "eye-off-outline" as const } : null
  ].filter((f) => f !== null);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: theme.space[4], paddingRight: theme.space[1], gap: 4 }}>
      <PressableScale
        onPress={onEdit}
        scaleTo={0.985}
        accessibilityLabel={`${field.name}, ${meta.label}. Edit`}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 64 }}
      >
        <IconCircle icon={meta.icon} size={38} />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text variant="body" weight="600" numberOfLines={1}>
            {field.name}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {meta.label}
            {field.options_json.length ? ` · ${field.options_json.slice(0, 4).join(", ")}${field.options_json.length > 4 ? "…" : ""}` : ""}
          </Text>
          {flags.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {flags.map((f) => (
                <Badge key={f.label} label={f.label} tone={f.tone} icon={f.icon} />
              ))}
            </View>
          ) : null}
        </View>
      </PressableScale>
      <View>
        <IconButton icon="chevron-up" label={`Move ${field.name} up`} disabled={first || moving} onPress={() => onMove("up")} size={20} color={first ? "textFaint" : "text"} />
        <IconButton icon="chevron-down" label={`Move ${field.name} down`} disabled={last || moving} onPress={() => onMove("down")} size={20} color={last ? "textFaint" : "text"} />
      </View>
    </View>
  );
}

/** `/custom-fields` (owner only): the extra columns recorded for every item. */
export function CustomFieldsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const qc = useQueryClient();
  const fields = useCustomFields();
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { active, archived } = sortFields(fields.data?.fields ?? []);

  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => api.customFields.move(id, direction),
    onMutate: async ({ id, direction }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<CustomFieldsResponse>(KEY);
      if (previous) {
        const list = sortFields(previous.fields).active;
        const index = list.findIndex((f) => f.id === id);
        const other = list[direction === "up" ? index - 1 : index + 1];
        if (index >= 0 && other) {
          const a = list[index].sort_order;
          const b = other.sort_order;
          qc.setQueryData<CustomFieldsResponse>(KEY, {
            fields: previous.fields.map((f) => (f.id === id ? { ...f, sort_order: b } : f.id === other.id ? { ...f, sort_order: a } : f))
          });
        }
      }
      return { previous };
    },
    onError: (e, _vars, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous);
      toast.error(errorMessage(e));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY })
  });

  const archive = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) => api.customFields.archive(id, restore),
    onSuccess: (_r, { restore }) => {
      toast.success(restore ? "Column restored." : "Column archived.");
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["purchases", "setup"] });
    },
    onError: (e) => toast.error(errorMessage(e))
  });

  const startEdit = (field: CustomField | null) => {
    haptic.tap();
    setEditing(field);
    setNonce(nonce + 1);
    setOpen(true);
  };

  const askArchive = async (field: CustomField) => {
    setOpen(false);
    // Let the edit sheet slide away before the confirmation sheet appears.
    await new Promise((resolve) => setTimeout(resolve, 260));
    const ok = await confirm({
      title: `Archive ${field.name}?`,
      message: "It disappears from purchases, billing search and listings. Values already saved are kept, and you can restore it any time.",
      confirmLabel: "Archive",
      destructive: true
    });
    if (ok) archive.mutate({ id: field.id, restore: false });
  };

  const askRestore = async (field: CustomField) => {
    const ok = await confirm({ title: `Restore ${field.name}?`, message: "It comes back in purchases and item forms.", confirmLabel: "Restore" });
    if (ok) archive.mutate({ id: field.id, restore: true });
  };

  if (!isOwner(me)) {
    return (
      <Screen header={<Header back title="Custom columns" />}>
        <EmptyState icon="lock-closed-outline" title="Owner only" body="Ask the shop owner to add or change custom columns." tone="warning" />
      </Screen>
    );
  }

  return (
    <>
      <Screen
        header={<Header back title="Custom columns" subtitle="Extra details for every item" />}
        onRefresh={() => void fields.refetch()}
        refreshing={fields.isRefetching}
        footerSpace={88}
        footer={
          <View style={{ padding: theme.space[4], paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            <Button label="Add column" icon="add" size="lg" fullWidth onPress={() => startEdit(null)} />
          </View>
        }
      >
        {fields.isLoading ? (
          <Card padded={false}>
            <SkeletonList rows={4} />
          </Card>
        ) : fields.isError ? (
          <ErrorState message={errorMessage(fields.error)} onRetry={() => fields.refetch()} />
        ) : (
          <>
            <Text variant="small" color="textMuted">
              Columns like Fabric or Fit appear when you record purchases and edit items. Use the arrows to set their order.
            </Text>
            {active.length ? (
              <Card padded={false}>
                {active.map((field, i) => (
                  <Animated.View key={field.id} layout={theme.reduceMotion ? undefined : LinearTransition.springify().damping(20)} entering={theme.reduceMotion ? undefined : FadeIn.duration(200)}>
                    {i ? <Divider inset={66} /> : null}
                    <FieldRow
                      field={field}
                      first={i === 0}
                      last={i === active.length - 1}
                      moving={move.isPending}
                      onEdit={() => startEdit(field)}
                      onMove={(direction) => move.mutate({ id: field.id, direction })}
                    />
                  </Animated.View>
                ))}
              </Card>
            ) : (
              <EmptyState
                icon="list-outline"
                title="No custom columns"
                body="Add columns like Fabric, Fit or Season to record more about each item."
                action="Add a column"
                onAction={() => startEdit(null)}
              />
            )}
            {archived.length ? (
              <View style={{ gap: 4 }}>
                <SectionTitle title={`Archived · ${archived.length}`} />
                <Card padded={false}>
                  {archived.map((field, i) => (
                    <Animated.View key={field.id} layout={theme.reduceMotion ? undefined : LinearTransition} entering={theme.reduceMotion ? undefined : FadeIn.duration(200)}>
                      {i ? <Divider inset={66} /> : null}
                      <Row gap={3} style={{ paddingHorizontal: theme.space[4], paddingVertical: 10, minHeight: 60 }}>
                        <IconCircle icon="archive-outline" tone="neutral" size={38} />
                        <View style={{ flex: 1 }}>
                          <Text variant="body" weight="600" color="textMuted" numberOfLines={1}>
                            {field.name}
                          </Text>
                          <Text variant="caption" color="textFaint">
                            {fieldTypeMeta(field.field_type).label}
                          </Text>
                        </View>
                        <Button label="Restore" variant="soft" size="sm" icon="refresh" onPress={() => void askRestore(field)} loading={archive.isPending && archive.variables?.id === field.id} />
                      </Row>
                    </Animated.View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </Screen>
      <FieldSheet key={`field-${nonce}`} visible={open} onClose={() => setOpen(false)} field={editing} onArchive={(f) => void askArchive(f)} />
    </>
  );
}
