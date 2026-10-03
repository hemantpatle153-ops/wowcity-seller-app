import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { StockItemDetail } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useEditableCustomFields, useGstSlabs, useStockItem } from "@/features/stock/hooks";
import { formatMoney, toNumber } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, confirm, ErrorState, Header, Icon, Input, Row, Screen, SectionTitle, Select, Skeleton, SkeletonCards, Stack, Text, toast } from "@/ui";
import { CustomFieldInput } from "./CustomFieldInput";
import { buildVariantPatch, cleanDecimal, formFromDetail, validateForm, type EditableCustomField, type FormErrors, type VariantForm } from "./editForm";
import { TagEditor } from "./TagEditor";

type Slab = { code: string; label: string; rate: number };

function Section({ title, children, index }: { title: string; children: ReactNode; index: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.duration(240).delay(index * 40)} style={{ gap: 4 }}>
      <SectionTitle title={title} />
      <Card style={{ gap: theme.space[3] }}>{children}</Card>
    </Animated.View>
  );
}

function EditForm({
  detail,
  fields,
  slabs,
  initialPublicDescription,
  canPublish
}: {
  detail: StockItemDetail;
  fields: EditableCustomField[];
  slabs: Slab[] | null;
  initialPublicDescription: string;
  canPublish: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [initial] = useState(() => formFromDetail(detail, fields, initialPublicDescription));
  const [form, setForm] = useState<VariantForm>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const canSeeInternal = detail.internalDescription !== null;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof VariantForm>(key: K, value: VariantForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setCustom = (id: string, value: string) => {
    setForm((f) => ({ ...f, custom: { ...f.custom, [id]: value } }));
    const k = `custom_${id}` as const;
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = useMutation({
    mutationFn: () => api.products.updateVariant(detail.productId, detail.variantId, buildVariantPatch(form, fields, { canPublish, canSeeInternal })),
    onSuccess: (result) => {
      toast.success(result.message || "Changes saved.");
      void qc.invalidateQueries({ queryKey: ["stock"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      router.back();
    },
    onError: (e) => {
      haptic.error();
      setServerError(errorMessage(e));
    }
  });

  const submit = () => {
    const next = validateForm(form, fields);
    setErrors(next);
    setServerError(null);
    if (Object.values(next).some(Boolean)) {
      haptic.warning();
      setServerError("Fix the highlighted fields.");
      return;
    }
    save.mutate();
  };

  const leave = async () => {
    if (dirty && !(await confirm({ title: "Discard your changes?", message: "Your edits to this item are not saved.", confirmLabel: "Discard", destructive: true }))) return;
    router.back();
  };

  const mrp = toNumber(form.mrp);
  const rate = toNumber(form.saleRate);
  const off = mrp > 0 && rate > 0 && rate < mrp ? Math.round(((mrp - rate) / mrp) * 100) : 0;
  const currentGst = slabs?.find((s) => s.code === form.gstCode) ?? detail.gst;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen
        header={
          <Header
            back
            onBack={() => void leave()}
            title="Edit item"
            subtitle={detail.name}
            right={
              dirty ? (
                <View>
                  <Badge label="Unsaved" tone="warning" icon="ellipse" />
                </View>
              ) : undefined
            }
          />
        }
        footerSpace={100}
        footer={
          <View style={{ padding: theme.space[4], paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            {serverError ? (
              <Row gap={2}>
                <Icon name="alert-circle" color="danger" size={18} />
                <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                  {serverError}
                </Text>
              </Row>
            ) : null}
            <Button label="Save changes" variant={dirty ? "primary" : "secondary"} icon="checkmark" size="lg" fullWidth onPress={submit} loading={save.isPending} disabled={!dirty} />
          </View>
        }
      >
        <Row gap={2} style={{ backgroundColor: theme.colors.infoSoft, padding: theme.space[3], borderRadius: theme.radius.control }}>
          <Icon name="information-circle" color="info" size={20} />
          <Text variant="small" color="info" style={{ flex: 1 }}>
            Name, brand, category and HSN apply to every size and colour of this product.
          </Text>
        </Row>

        <Section title="Product" index={0}>
          <Input label="Product name *" value={form.productName} onChangeText={(t) => set("productName", t.slice(0, 160))} error={errors.productName} autoCapitalize="words" />
          <Input label="Brand" value={form.brand} onChangeText={(t) => set("brand", t.slice(0, 80))} autoCapitalize="words" />
          <Input label="Category" value={form.category} onChangeText={(t) => set("category", t.slice(0, 80))} autoCapitalize="words" />
        </Section>

        <Section title="This variant" index={1}>
          <Row gap={3} align="flex-start">
            <Input label="Size" value={form.size} onChangeText={(t) => set("size", t.slice(0, 40))} containerStyle={{ flex: 1 }} autoCapitalize="characters" />
            <Input label="Colour" value={form.colour} onChangeText={(t) => set("colour", t.slice(0, 40))} containerStyle={{ flex: 1 }} autoCapitalize="words" />
          </Row>
          <Input label="Style" value={form.style} onChangeText={(t) => set("style", t.slice(0, 60))} placeholder="e.g. Straight, A-line" />
        </Section>

        <Section title="Price" index={2}>
          <Row gap={3} align="flex-start">
            <Input label="MRP *" prefix="₹" value={form.mrp} onChangeText={(t) => set("mrp", cleanDecimal(t))} keyboardType="decimal-pad" error={errors.mrp} containerStyle={{ flex: 1 }} />
            <Input
              label="Selling price *"
              prefix="₹"
              value={form.saleRate}
              onChangeText={(t) => set("saleRate", cleanDecimal(t))}
              keyboardType="decimal-pad"
              error={errors.saleRate}
              containerStyle={{ flex: 1 }}
            />
          </Row>
          {off > 0 ? <Badge label={`${off}% off MRP · customer saves ${formatMoney(mrp - rate)}`} tone="success" icon="pricetag" /> : null}
        </Section>

        <Section title="Tax" index={3}>
          {slabs ? (
            <Select
              label="GST rate"
              value={form.gstCode}
              placeholder={detail.gst ? detail.gst.label : "Choose a GST rate"}
              onChange={(v) => set("gstCode", v)}
              options={slabs.map((s) => ({ value: s.code, label: s.label, hint: `${s.rate}%` }))}
            />
          ) : (
            <View style={{ gap: 4 }}>
              <Text variant="small" weight="600" color="textMuted">
                GST rate
              </Text>
              <Text variant="body">{currentGst ? currentGst.label : "Not set"}</Text>
              <Text variant="caption" color="textMuted">
                Kept as is. Ask the owner to change the GST rate.
              </Text>
            </View>
          )}
          <Input
            label="HSN code"
            value={form.hsnCode}
            onChangeText={(t) => set("hsnCode", t.replace(/\D/g, "").slice(0, 8))}
            keyboardType="number-pad"
            placeholder="4 to 8 digits"
            error={errors.hsnCode}
          />
        </Section>

        {canSeeInternal || canPublish ? (
          <Section title="Descriptions" index={4}>
            {canSeeInternal ? (
              <Input
                label="Internal note"
                value={form.internalDescription}
                onChangeText={(t) => set("internalDescription", t.slice(0, 1000))}
                multiline
                placeholder="Only your team sees this"
                hint={`${form.internalDescription.length}/1000`}
                error={errors.internalDescription}
                style={{ minHeight: 72, textAlignVertical: "top" }}
              />
            ) : null}
            {canPublish ? (
              <Input
                label="Public description"
                value={form.publicDescription}
                onChangeText={(t) => set("publicDescription", t.slice(0, 1000))}
                multiline
                placeholder="What buyers read on WowCity"
                hint={`${form.publicDescription.length}/1000 · shared by every variant`}
                error={errors.publicDescription}
                style={{ minHeight: 88, textAlignVertical: "top" }}
              />
            ) : null}
          </Section>
        ) : null}

        {canPublish ? (
          <Section title="Tags" index={5}>
            <TagEditor value={form.tags} onChange={(tags) => set("tags", tags)} max={25} placeholder="e.g. festive, cotton" />
          </Section>
        ) : form.tags.length ? (
          <Stack gap={1}>
            <SectionTitle title="Tags" />
            <Row gap={2} wrap>
              {form.tags.map((t) => (
                <Badge key={t} label={t} tone="accent" icon="pricetag-outline" />
              ))}
            </Row>
          </Stack>
        ) : null}

        {fields.length ? (
          <Section title="Custom columns" index={6}>
            {fields.map((field) => (
              <CustomFieldInput key={field.id} field={field} value={form.custom[field.id] ?? ""} onChange={(v) => setCustom(field.id, v)} error={errors[`custom_${field.id}`]} />
            ))}
          </Section>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** `/stock/[variantId]/edit`: full-replace form, prefilled from every loaded value. */
export function EditProductScreen({ variantId }: { variantId: string }) {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const canPublish = can(me, "product.publication.manage");
  const item = useStockItem(variantId);
  const custom = useEditableCustomFields();
  const gst = useGstSlabs();
  const productId = item.data?.productId;
  // The public description lives on the listing; it must be sent back or the PATCH clears it.
  const listing = useQuery({ queryKey: ["products", "listing", productId], queryFn: () => api.products.listing(productId!), enabled: canPublish && !!productId });

  if (!can(me, "product.edit")) {
    return (
      <Screen header={<Header back title="Edit item" />}>
        <ErrorState message="You don't have permission to edit products." />
      </Screen>
    );
  }
  const error = item.error ?? custom.error ?? (canPublish ? listing.error : null);
  if (error) {
    return (
      <Screen header={<Header back title="Edit item" />}>
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => {
            void item.refetch();
            if (canPublish) void listing.refetch();
          }}
        />
      </Screen>
    );
  }
  const loading = item.isLoading || custom.isLoading || gst.isLoading || (canPublish && (listing.isLoading || !listing.data));
  if (loading || !item.data) {
    return (
      <Screen header={<Header back title="Edit item" />}>
        <Skeleton height={48} radius={theme.radius.control} />
        <SkeletonCards count={4} height={150} />
      </Screen>
    );
  }
  return <EditForm detail={item.data} fields={custom.fields} slabs={gst.slabs} initialPublicDescription={listing.data?.description ?? ""} canPublish={canPublish} />;
}
