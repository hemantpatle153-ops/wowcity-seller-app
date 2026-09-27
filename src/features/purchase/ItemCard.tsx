import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import type { PurchaseSetupResponse } from "@/api/types";
import { formatMoney, formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Chip, Divider, Icon, IconButton, Input, PressableScale, Row, Select, Text, ToggleRow, type InputProps } from "@/ui";
import { CustomFieldInput } from "./CustomFieldInput";
import { usePurchaseDraft, type ItemDraft } from "./draft";
import { marginPercent, num, typingDecimal, type PurchaseRowCalc } from "./math";
import { firstError, type ItemErrors } from "./payload";
import { PhotosSection } from "./PhotosSection";

type Setup = PurchaseSetupResponse;

/** Two fields side by side that stack when the text is very large. */
export function Pair({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space[3] }}>{children}</View>;
}

function Cell({ children }: { children: ReactNode }) {
  return <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0 }}>{children}</View>;
}

export function MoneyInput(props: Omit<InputProps, "onChangeText"> & { onChangeText: (value: string) => void; places?: number }) {
  const { onChangeText, places = 3, ...rest } = props;
  return <Input prefix="₹" keyboardType="decimal-pad" inputMode="decimal" placeholder="0" {...rest} onChangeText={(t) => onChangeText(typingDecimal(t, places))} />;
}

function Expander({ title, hint, open, onToggle, icon, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; icon: "pricetags-outline" | "images-outline" | "list-outline"; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: theme.radius.control, backgroundColor: theme.colors.surfaceSunken, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
      <PressableScale
        onPress={() => {
          haptic.select();
          onToggle();
        }}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${hint ? `, ${hint}` : ""}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 12 }}
      >
        <Icon name={icon} size={20} color="textMuted" />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="600">
            {title}
          </Text>
          {hint ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="textMuted" />
      </PressableScale>
      {open ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(180)} style={{ padding: 12, paddingTop: 4, gap: 12, backgroundColor: theme.colors.surface }}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const commit = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean);
    if (next.length) onChange([...new Set([...tags, ...next])].slice(0, 25));
    setText("");
  };
  return (
    <View style={{ gap: 8 }}>
      <Input
        label="Tags"
        value={text}
        onChangeText={(t) => (t.includes(",") ? commit(t) : setText(t))}
        onSubmitEditing={() => commit(text)}
        onBlur={() => text.trim() && commit(text)}
        placeholder="festive, cotton, summer"
        hint="Separate with commas. Buyers can search by tags."
        returnKeyType="done"
        icon="pricetag-outline"
      />
      {tags.length ? (
        <Row gap={2} wrap>
          {tags.map((tag) => (
            <Chip key={tag} label={tag} icon="close" selected onPress={() => onChange(tags.filter((t) => t !== tag))} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** One purchase line as a card: collapsed summary, or the full form when open. */
export function ItemCard({
  item,
  index,
  setup,
  errors,
  calc,
  mode,
  onMenu,
  onLayoutY
}: {
  item: ItemDraft;
  index: number;
  setup: Setup;
  errors?: ItemErrors;
  calc?: PurchaseRowCalc;
  mode: "inclusive" | "exclusive";
  onMenu: (item: ItemDraft) => void;
  onLayoutY?: (key: string, y: number) => void;
}) {
  const theme = useTheme();
  const update = (patch: Partial<ItemDraft>) => usePurchaseDraft.getState().updateItem(item.key, patch);
  const [discountsOpen, setDiscountsOpen] = useState(() => num(item.disc1Percent) + num(item.disc1Amount) + num(item.disc2Amount) > 0);
  const [listingOpen, setListingOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!item.restock);
  const [customOpen, setCustomOpen] = useState(() => setup.customFields.some((f) => f.is_required_on_purchase));
  const restock = !!item.restock;
  const detail = [item.brand, item.size, item.colour, item.style].filter(Boolean).join(" · ");
  const qty = num(item.qty);
  const hasError = !!errors && Object.keys(errors).length > 0;
  const unitCost = calc && qty > 0 ? calc.taxable / qty : 0;
  const margin = marginPercent(unitCost, num(item.saleRate));
  const options = (values: string[]) => values.map((v) => ({ value: v, label: v }));
  const discountTotal = calc?.discount ?? 0;
  const slabOptions = setup.gstSlabs.map((s) => ({ value: s.code, label: s.label, hint: s.is_special ? "Special rate" : undefined }));
  const publicOptions = [
    ...setup.publicFieldOptions.map((o) => ({ key: o.key as string, label: o.label })),
    ...setup.customFields.filter((f) => f.is_public_eligible).map((f) => ({ key: `custom:${f.id}`, label: f.name }))
  ];

  const toggle = () => {
    haptic.select();
    update({ collapsed: !item.collapsed });
  };

  const header = (
    <PressableScale
      onPress={toggle}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityState={{ expanded: !item.collapsed }}
      accessibilityLabel={`Item ${index + 1}: ${item.itemName || "new item"}, ${formatQty(qty)} pieces${calc ? `, ${formatMoney(calc.total, { decimals: 2 })}` : ""}${hasError ? ", needs attention" : ""}. ${item.collapsed ? "Expand" : "Collapse"}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: hasError ? theme.colors.dangerSoft : restock ? theme.colors.infoSoft : theme.colors.accentSoft
        }}
      >
        {hasError ? (
          <Icon name="alert" size={18} color="danger" />
        ) : (
          <Text variant="small" weight="800" color={restock ? "info" : "accentSoftText"} tabular>
            {index + 1}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1} color={item.itemName ? "text" : "textFaint"}>
          {item.itemName || "New item"}
        </Text>
        <Row gap={2} wrap>
          <Badge label={restock ? "Restock" : item.entry ? "New · own barcode" : "New product"} tone={restock ? "info" : "accent"} icon={restock ? "refresh" : "sparkles-outline"} />
          {detail ? (
            <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {detail}
            </Text>
          ) : null}
        </Row>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="bodyStrong" tabular>
          {calc && calc.total > 0 ? formatMoney(calc.total, { decimals: "auto" }) : "—"}
        </Text>
        <Text variant="caption" color="textMuted" tabular>
          {formatQty(qty)} pcs
        </Text>
      </View>
      <IconButton icon="ellipsis-vertical" label={`More actions for item ${index + 1}`} onPress={() => onMenu(item)} size={20} color="textMuted" />
    </PressableScale>
  );

  return (
    <Animated.View
      entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(18).stiffness(200)}
      exiting={theme.reduceMotion ? undefined : FadeOut.duration(160)}
      layout={theme.reduceMotion ? undefined : LinearTransition.springify().damping(20).stiffness(220)}
      onLayout={(e) => onLayoutY?.(item.key, e.nativeEvent.layout.y)}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.card,
        borderWidth: hasError ? 2 : 1,
        borderColor: hasError ? theme.colors.danger : theme.colors.border,
        paddingHorizontal: theme.space[3],
        paddingVertical: theme.space[2],
        gap: 12
      }}
    >
      {header}
      {item.collapsed ? (
        hasError ? (
          <Row gap={2} style={{ paddingBottom: 6 }}>
            <Icon name="alert-circle" size={16} color="danger" />
            <Text variant="small" color="danger" style={{ flex: 1 }}>
              {firstError(errors!)}
            </Text>
          </Row>
        ) : null
      ) : (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(200)} style={{ gap: 14, paddingBottom: 8 }}>
          {restock ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: theme.radius.control, backgroundColor: theme.colors.infoSoft }}>
              <Icon name="barcode-outline" size={22} color="info" />
              <View style={{ flex: 1 }}>
                <Text variant="small" weight="700" color="info">
                  Barcode {item.restock!.barcode}
                </Text>
                <Text variant="small" color="info">
                  {formatQty(item.restock!.inStock)} in stock across all stores. Saving adds this quantity.
                </Text>
              </View>
            </View>
          ) : item.entry ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: theme.radius.control, backgroundColor: theme.colors.accentSoft }}>
              <Icon name="barcode-outline" size={22} color="accentSoftText" />
              <Text variant="small" color="accentSoftText" style={{ flex: 1 }}>
                New product. Its label keeps the barcode {item.entry}.
              </Text>
            </View>
          ) : null}

          {restock && !detailsOpen ? (
            <PressableScale
              onPress={() => setDetailsOpen(true)}
              accessibilityLabel="Show product details"
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}
            >
              <Text variant="small" color="accent" weight="700">
                Product details
              </Text>
              <Icon name="chevron-down" size={16} color="accent" />
            </PressableScale>
          ) : (
            <>
              <Input
                label="Item name *"
                value={item.itemName}
                onChangeText={(itemName) => update({ itemName })}
                placeholder="e.g. Cotton straight kurta"
                autoCapitalize="sentences"
                error={errors?.itemName}
                maxLength={160}
                editable={!restock}
                hint={restock ? "Name and variant come from the catalogue for a restock." : undefined}
              />
              <Pair>
                <Cell>
                  <Select label="Brand" value={item.brand} options={options(setup.suggestions.brands)} onChange={(brand) => update({ brand })} allowCustom placeholder="Brand" disabled={restock} />
                </Cell>
                <Cell>
                  <Select label="Category" value={item.category} options={options(setup.suggestions.categories)} onChange={(category) => update({ category })} allowCustom placeholder="Category" disabled={restock} />
                </Cell>
              </Pair>
              <Pair>
                <Cell>
                  <Select label="Size" value={item.size} options={options(setup.suggestions.sizes)} onChange={(size) => update({ size })} allowCustom placeholder="Size" disabled={restock} />
                </Cell>
                <Cell>
                  <Select label="Colour" value={item.colour} options={options(setup.suggestions.colours)} onChange={(colour) => update({ colour })} allowCustom placeholder="Colour" disabled={restock} />
                </Cell>
              </Pair>
              <Select label="Style" value={item.style} options={options(setup.suggestions.styles)} onChange={(style) => update({ style })} allowCustom placeholder="Style (optional)" disabled={restock} />
            </>
          )}

          <Pair>
            <Cell>
              <Input
                label="HSN"
                value={item.hsnCode}
                onChangeText={(t) => update({ hsnCode: t.replace(/\D/g, "").slice(0, 8) })}
                keyboardType="number-pad"
                placeholder="6204"
                error={errors?.hsnCode}
              />
            </Cell>
            <Cell>
              <Select
                label="GST slab"
                value={item.gstCode}
                options={slabOptions}
                onChange={(code) => {
                  const slab = setup.gstSlabs.find((s) => s.code === code);
                  update({ gstCode: code, gstRate: slab ? String(slab.rate) : "" });
                }}
                error={errors?.gst}
              />
            </Cell>
          </Pair>

          <Divider />

          <Row gap={3} align="flex-end">
            <View style={{ flex: 1 }}>
              <Input
                label="Quantity *"
                value={item.qty}
                onChangeText={(t) => update({ qty: typingDecimal(t, 3) })}
                keyboardType="decimal-pad"
                error={errors?.qty}
                style={{ fontVariant: ["tabular-nums"], fontWeight: "700" }}
                right={
                  <Row gap={0}>
                    <IconButton
                      icon="remove"
                      label="One less"
                      size={20}
                      variant="soft"
                      disabled={qty <= 1}
                      onPress={() => {
                        haptic.select();
                        update({ qty: String(Math.max(1, Math.round((qty - 1) * 1000) / 1000)) });
                      }}
                    />
                    <IconButton
                      icon="add"
                      label="One more"
                      size={20}
                      variant="soft"
                      onPress={() => {
                        haptic.select();
                        update({ qty: String(Math.round((qty + 1) * 1000) / 1000) });
                      }}
                    />
                  </Row>
                }
              />
            </View>
          </Row>
          <Pair>
            <Cell>
              <MoneyInput label="Purchase rate" value={item.purchaseRate} onChangeText={(purchaseRate) => update({ purchaseRate })} hint={mode === "inclusive" ? "Per piece, GST included" : "Per piece, before GST"} />
            </Cell>
            <Cell>
              <MoneyInput label="MRP" value={item.mrp} onChangeText={(mrp) => update({ mrp })} places={2} />
            </Cell>
          </Pair>
          <MoneyInput
            label="Sale rate"
            value={item.saleRate}
            onChangeText={(saleRate) => update({ saleRate })}
            places={2}
            error={errors?.saleRate}
            hint={margin !== null ? `Margin ${margin}% on the landed cost of ${formatMoney(unitCost, { decimals: 2 })}` : "What you sell it for. Can't be more than MRP."}
            right={
              num(item.mrp) > 0 && item.saleRate !== item.mrp ? (
                <Chip label="= MRP" onPress={() => update({ saleRate: item.mrp })} />
              ) : undefined
            }
          />
          {calc && calc.total > 0 ? (
            <Animated.View entering={theme.reduceMotion ? undefined : FadeIn} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <Text variant="small" color="textMuted" tabular>
                Taxable {formatMoney(calc.taxable, { decimals: 2 })} + GST {formatMoney(calc.gst, { decimals: 2 })}
              </Text>
              <Text variant="small" weight="700" tabular>
                = {formatMoney(calc.total, { decimals: 2 })}
              </Text>
            </Animated.View>
          ) : null}

          <Expander
            title="Discounts"
            hint={discountTotal > 0 ? `${formatMoney(discountTotal, { decimals: 2 })} off this line` : "Trade discount % and ₹"}
            open={discountsOpen}
            onToggle={() => setDiscountsOpen(!discountsOpen)}
            icon="pricetags-outline"
          >
            <Pair>
              <Cell>
                <Input
                  label="Discount %"
                  value={item.disc1Percent}
                  onChangeText={(t) => update({ disc1Percent: typingDecimal(t, 3) })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  right={
                    <Text variant="body" color="textMuted">
                      %
                    </Text>
                  }
                  error={errors?.disc1Percent}
                />
              </Cell>
              <Cell>
                <MoneyInput label="Discount ₹" value={item.disc1Amount} onChangeText={(disc1Amount) => update({ disc1Amount })} />
              </Cell>
            </Pair>
            <MoneyInput label="Second discount ₹" value={item.disc2Amount} onChangeText={(disc2Amount) => update({ disc2Amount })} hint="Scheme or cash discount on this line." />
          </Expander>

          {setup.customFields.length ? (
            <Expander
              title="More columns"
              hint={setup.customFields.map((f) => f.name).join(", ")}
              open={customOpen || !!errors?.custom}
              onToggle={() => setCustomOpen(!customOpen)}
              icon="list-outline"
            >
              {setup.customFields.map((field) => (
                <CustomFieldInput
                  key={field.id}
                  field={field}
                  value={item.customValues[field.id] ?? ""}
                  onChange={(value) => update({ customValues: { ...item.customValues, [field.id]: value } })}
                  error={errors?.custom?.[field.id]}
                />
              ))}
            </Expander>
          ) : null}

          <Expander
            title="Photos & online listing"
            hint={[item.photos.length ? `${item.photos.length} photo${item.photos.length === 1 ? "" : "s"}` : "No photos", setup.canPublish ? (item.publicEnabled ? "Shown on WowCity" : "Not listed") : null].filter(Boolean).join(" · ")}
            open={listingOpen || !!errors?.photos}
            onToggle={() => setListingOpen(!listingOpen)}
            icon="images-outline"
          >
            <PhotosSection item={item} />
            {setup.canPublish ? (
              <>
                <Divider />
                <ToggleRow
                  label="Show on WowCity app"
                  hint="Buyers nearby can find this item."
                  icon="globe-outline"
                  value={item.publicEnabled}
                  onChange={(publicEnabled) => update({ publicEnabled })}
                />
                {item.publicEnabled ? (
                  <Animated.View entering={theme.reduceMotion ? undefined : FadeIn} style={{ gap: 6 }}>
                    <Text variant="small" weight="600" color="textMuted">
                      Buyers see
                    </Text>
                    <Row gap={2} wrap>
                      {publicOptions.map((o) => {
                        const on = !!item.publicFields[o.key];
                        return (
                          <Chip
                            key={o.key}
                            label={o.label}
                            icon={on ? "eye-outline" : "eye-off-outline"}
                            selected={on}
                            onPress={() => update({ publicFields: { ...item.publicFields, [o.key]: !on } })}
                          />
                        );
                      })}
                    </Row>
                  </Animated.View>
                ) : null}
              </>
            ) : null}
            <Input
              label="Description"
              value={item.description}
              onChangeText={(description) => update({ description })}
              multiline
              maxLength={1000}
              placeholder="Fabric, fit, wash care…"
              style={{ minHeight: 72, textAlignVertical: "top" }}
            />
            <TagsField tags={item.tags} onChange={(tags) => update({ tags })} />
          </Expander>

          <ToggleRow
            label="Print barcode labels"
            hint={item.printLabels ? `${Math.max(1, Math.ceil(qty))} label${Math.ceil(qty) === 1 ? "" : "s"} queued after saving` : "No labels for this item"}
            icon="barcode-outline"
            value={item.printLabels}
            onChange={(printLabels) => update({ printLabels })}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}
