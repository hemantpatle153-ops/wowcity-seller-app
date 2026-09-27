import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "@/api";
import type { StockItemDetail } from "@/api/types";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatPercent, formatQty, formatRelative } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  IconCircle,
  PressableScale,
  Row,
  Screen,
  SectionTitle,
  Skeleton,
  SkeletonCards,
  Stack,
  Text,
  toast
} from "@/ui";
import { useEditableCustomFields, useStockItem } from "./hooks";
import { PhotoManager } from "./PhotoManager";
import { AdjustSheet, TransferSheet } from "./StockActionSheets";
import { customValueText, movementMeta, shortStoreName, stockTone, variantLine } from "./stockLogic";

function Gallery({ images, width }: { images: StockItemDetail["images"]; width: number }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const height = Math.round(Math.min(width * 0.9, 320));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };
  const frame = { width, height, borderRadius: theme.radius.card, backgroundColor: theme.colors.surfaceSunken, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" as const };
  if (!images.length) {
    return (
      <View style={[frame, { height: 160, alignItems: "center", justifyContent: "center", gap: 8 }]} accessibilityLabel="No photos yet">
        <Icon name="image-outline" size={40} color="textFaint" />
        <Text variant="small" color="textMuted">
          No photos yet
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ width, borderRadius: theme.radius.card }}
        accessibilityLabel={`${images.length} photos`}
      >
        {images.map((image, i) => (
          <View key={image.id} style={frame} accessibilityLabel={`Photo ${i + 1} of ${images.length}`}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="image-outline" size={40} color="textFaint" />
              {!image.url ? (
                <Text variant="caption" color="textMuted">
                  Photo not available
                </Text>
              ) : null}
            </View>
            {image.url ? <Image source={{ uri: image.url }} style={{ width, height }} contentFit="cover" transition={theme.reduceMotion ? 0 : 200} /> : null}
          </View>
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <Row gap={1} justify="center">
          {images.map((image, i) => (
            <View key={image.id} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? theme.colors.accent : theme.colors.borderStrong }} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}

function InfoRow({ label, value, right }: { label: string; value: string; right?: ReactNode }) {
  return (
    <Row gap={3} style={{ minHeight: 44 }}>
      <Text variant="small" color="textMuted" style={{ width: 96 }}>
        {label}
      </Text>
      <Text variant="body" weight="600" style={{ flex: 1 }} selectable>
        {value}
      </Text>
      {right}
    </Row>
  );
}

function ActionTile({ icon, label, hint, onPress }: { icon: ComponentProps<typeof IconCircle>["icon"]; label: string; hint: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${label}. ${hint}`}
      scaleTo={0.96}
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        minHeight: 72,
        padding: theme.space[3],
        gap: 6,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <IconCircle icon={icon} size={32} />
      <Text variant="bodyStrong" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={2}>
        {hint}
      </Text>
    </PressableScale>
  );
}

export function ItemDetailScreen({ variantId }: { variantId: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const me = useSession((s) => s.me);
  const storeId = useSession((s) => s.storeId);
  const item = useStockItem(variantId);
  const custom = useEditableCustomFields();
  const [sheet, setSheet] = useState<"adjust" | "transfer" | null>(null);
  // Bumped on every open so the sheet's form starts fresh (and stays mounted while it animates out).
  const [nonce, setNonce] = useState(0);
  const owner = isOwner(me);
  const canEdit = can(me, "product.edit");
  const canPrint = can(me, "barcode.print");
  const canListing = can(me, "product.view");
  const width = Math.min(windowWidth, 680) - theme.space[4] * 2;

  const open = (kind: "adjust" | "transfer") => {
    haptic.tap();
    setNonce(nonce + 1);
    setSheet(kind);
  };

  const copy = async (code: string) => {
    await Clipboard.setStringAsync(code).catch(() => false);
    toast.success(`Copied ${code}`);
  };

  if (item.isLoading) {
    return (
      <Screen header={<Header back title="Item" />}>
        <Skeleton height={260} radius={theme.radius.card} />
        <Skeleton width="70%" height={24} />
        <Skeleton width="40%" height={16} />
        <SkeletonCards count={3} height={88} />
      </Screen>
    );
  }
  if (item.isError || !item.data) {
    return (
      <Screen header={<Header back title="Item" />}>
        {item.isError ? (
          <ErrorState message={errorMessage(item.error)} onRetry={() => item.refetch()} />
        ) : (
          <EmptyState icon="cube-outline" title="Item not found" action="Back to stock" onAction={() => router.back()} />
        )}
      </Screen>
    );
  }

  const d = item.data;
  const detailLine = variantLine(d);
  const off = d.mrp > d.price ? Math.round(((d.mrp - d.price) / d.mrp) * 100) : 0;
  const customEntries = Object.entries(d.customValues).filter(([, v]) => customValueText(v) !== "");
  const canTransfer = owner && d.stock.length >= 2;
  const footerButtons = [owner ? "adjust" : null, canEdit ? "edit" : null].filter(Boolean);
  const enter = (i: number) => (theme.reduceMotion ? undefined : FadeInDown.duration(260).delay(Math.min(i, 6) * 40));

  return (
    <>
      <Screen
        header={
          <Header
            back
            title={d.name}
            subtitle={detailLine || undefined}
            right={
              canPrint ? (
                <IconButton
                  icon="print-outline"
                  label="Print barcode label"
                  onPress={() => router.push(`/labels?variant=${d.variantId}&barcode=${encodeURIComponent(d.barcodes[0]?.barcode ?? "")}` as Href)}
                />
              ) : undefined
            }
          />
        }
        onRefresh={() => void item.refetch()}
        refreshing={item.isRefetching}
        footerSpace={footerButtons.length ? 88 : 0}
        footer={
          footerButtons.length ? (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                padding: theme.space[4],
                paddingBottom: Math.max(insets.bottom, 12),
                backgroundColor: theme.colors.surface,
                borderTopWidth: 1,
                borderColor: theme.colors.border
              }}
            >
              {owner ? <Button label="Adjust" icon="construct-outline" variant="secondary" accessibilityLabel="Adjust stock" size="lg" onPress={() => open("adjust")} style={{ flex: 1 }} /> : null}
              {canEdit ? <Button label="Edit item" icon="create-outline" size="lg" onPress={() => router.push(`/stock/${d.variantId}/edit`)} style={{ flex: 1 }} /> : null}
            </View>
          ) : undefined
        }
      >
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(250)}>
          <Gallery images={d.images} width={width} />
        </Animated.View>
        {can(me, "product.images.manage") ? <PhotoManager productId={d.productId} variantId={d.variantId} images={d.images} /> : null}

        <Animated.View entering={enter(1)} style={{ gap: 6 }}>
          <Text variant="heading" selectable>
            {d.name}
          </Text>
          <Text variant="body" color="textMuted">
            {[d.brand, d.category].filter(Boolean).join(" · ") || "No brand or category"}
          </Text>
          <Row gap={2} wrap align="flex-end" style={{ marginTop: 4 }}>
            <Text variant="display" tabular>
              {formatMoney(d.price)}
            </Text>
            {off > 0 ? (
              <>
                <Text variant="body" color="textFaint" tabular style={{ marginBottom: 4 }}>
                  MRP{" "}
                  <Text variant="body" color="textFaint" tabular style={{ textDecorationLine: "line-through" }}>
                    {formatMoney(d.mrp)}
                  </Text>
                </Text>
                <View style={{ marginBottom: 6 }}>
                  <Badge label={`${off}% off`} tone="success" icon="pricetag" />
                </View>
              </>
            ) : (
              <Text variant="small" color="textMuted" style={{ marginBottom: 6 }}>
                MRP
              </Text>
            )}
          </Row>
          <Row gap={2} wrap>
            <Badge label={d.totalStock <= 0 ? "Out of stock" : `${formatQty(d.totalStock)} in stock`} tone={stockTone(d.totalStock)} />
            {!d.active ? <Badge label="Inactive" tone="neutral" icon="pause-circle-outline" /> : null}
            {d.gst ? <Badge label={`GST ${formatPercent(d.gst.rate, d.gst.rate % 1 ? 1 : 0)}`} tone="info" icon="receipt-outline" /> : null}
          </Row>
        </Animated.View>

        {d.siblings.length ? (
          <Animated.View entering={enter(2)} style={{ gap: 4 }}>
            <SectionTitle title="Other sizes & colours" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -theme.space[4] }}>
              <View style={{ width: theme.space[2] }} />
              <Chip label={[d.size, d.colour].filter(Boolean).join(" / ") || "This one"} selected />
              {d.siblings.map((s) => (
                <Chip key={s.variantId} label={s.label} onPress={() => router.replace(`/stock/${s.variantId}`)} />
              ))}
              <View style={{ width: theme.space[2] }} />
            </ScrollView>
          </Animated.View>
        ) : null}

        <Animated.View entering={enter(3)} style={{ gap: 4 }}>
          <SectionTitle title="Stock by store" />
          <Card padded={false}>
            {d.stock.map((s, i) => (
              <View key={s.storeId}>
                {i ? <Divider inset={16} /> : null}
                <Row gap={3} style={{ minHeight: 56, paddingHorizontal: theme.space[4], paddingVertical: 8 }}>
                  <Icon name="storefront-outline" size={20} color="textMuted" />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {shortStoreName(s.store)}
                    </Text>
                    {s.held > 0 ? (
                      <Text variant="caption" color="warning">
                        {formatQty(s.held)} held
                      </Text>
                    ) : null}
                  </View>
                  <View>
                    <Badge label={s.available <= 0 ? `${formatQty(s.available)} · Out` : `${formatQty(s.available)} pcs`} tone={stockTone(s.available)} showIcon={s.available <= 5} />
                  </View>
                </Row>
              </View>
            ))}
            <Divider />
            <Row justify="space-between" style={{ minHeight: 48, paddingHorizontal: theme.space[4] }}>
              <Text variant="bodyStrong">Total</Text>
              <Text variant="title" tabular>
                {formatQty(d.totalStock)}
              </Text>
            </Row>
          </Card>
        </Animated.View>

        {canTransfer || canListing || canPrint ? (
          <Animated.View entering={enter(4)} style={{ gap: 4 }}>
            <SectionTitle title="Actions" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space[2] }}>
              {canTransfer ? <ActionTile icon="swap-horizontal" label="Transfer" hint="Move pieces to another store" onPress={() => open("transfer")} /> : null}
              {canListing ? <ActionTile icon="globe-outline" label="Online listing" hint="What buyers see on WowCity" onPress={() => router.push(`/products/${d.productId}/listing`)} /> : null}
              {canPrint ? (
                <ActionTile
                  icon="barcode-outline"
                  label="Print label"
                  hint="Barcode label for this item"
                  onPress={() => router.push(`/labels?variant=${d.variantId}&barcode=${encodeURIComponent(d.barcodes[0]?.barcode ?? "")}` as Href)}
                />
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={enter(5)} style={{ gap: 4 }}>
          <SectionTitle title="Details" />
          <Card style={{ paddingVertical: 4 }}>
            {d.barcodes.length ? (
              d.barcodes.map((b) => (
                <InfoRow
                  key={b.id}
                  label="Barcode"
                  value={b.barcode}
                  right={<IconButton icon="copy-outline" label={`Copy barcode ${b.barcode}`} color="accent" size={20} onPress={() => void copy(b.barcode)} />}
                />
              ))
            ) : (
              <InfoRow label="Barcode" value="None yet" />
            )}
            <Divider />
            <InfoRow label="GST" value={d.gst ? d.gst.label : "Not set"} />
            <InfoRow label="HSN" value={d.hsnCode || "Not set"} />
            {d.style ? <InfoRow label="Style" value={d.style} /> : null}
            {d.size ? <InfoRow label="Size" value={d.size} /> : null}
            {d.colour ? <InfoRow label="Colour" value={d.colour} /> : null}
            {customEntries.map(([fieldId, value]) => (
              <InfoRow key={fieldId} label={custom.names[fieldId] ?? "Custom"} value={customValueText(value)} />
            ))}
          </Card>
        </Animated.View>

        {d.tags.length ? (
          <Stack gap={1}>
            <SectionTitle title="Tags" />
            <Row gap={2} wrap>
              {d.tags.map((tag) => (
                <Badge key={tag} label={tag} tone="accent" icon="pricetag-outline" />
              ))}
            </Row>
          </Stack>
        ) : null}

        {d.internalDescription ? (
          <Stack gap={1}>
            <SectionTitle title="Internal note" />
            <Card>
              <Text variant="body" selectable>
                {d.internalDescription}
              </Text>
            </Card>
          </Stack>
        ) : null}

        <Stack gap={1}>
          <SectionTitle title="Stock movements" />
          {d.movements.length ? (
            <Card style={{ paddingVertical: theme.space[2] }}>
              {d.movements.map((m, i) => {
                const meta = movementMeta[m.type] ?? movementMeta.adjustment;
                const last = i === d.movements.length - 1;
                return (
                  <Animated.View
                    key={m.id}
                    entering={theme.reduceMotion || i > 12 ? undefined : FadeInDown.duration(220).delay(i * 30)}
                    style={{ flexDirection: "row", gap: 12 }}
                    accessible
                    accessibilityLabel={`${meta.label}, ${m.qty > 0 ? "plus" : "minus"} ${formatQty(Math.abs(m.qty))}, ${shortStoreName(m.store)}, ${formatRelative(m.at)}`}
                  >
                    <View style={{ alignItems: "center", width: 34 }}>
                      <IconCircle icon={meta.icon} tone={meta.tone} size={34} />
                      {!last ? <View style={{ flex: 1, width: 2, minHeight: 14, backgroundColor: theme.colors.border, marginVertical: 2 }} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 4 : 14, paddingTop: 2 }}>
                      <Row gap={2}>
                        <Text variant="body" weight="600" style={{ flex: 1 }} numberOfLines={1}>
                          {meta.label}
                        </Text>
                        <Text variant="bodyStrong" tabular color={m.qty > 0 ? "success" : m.qty < 0 ? "danger" : "textMuted"}>
                          {m.qty > 0 ? "+" : m.qty < 0 ? "−" : ""}
                          {formatQty(Math.abs(m.qty))}
                        </Text>
                      </Row>
                      <Text variant="small" color="textMuted" numberOfLines={1}>
                        {shortStoreName(m.store)} · {formatRelative(m.at)}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })}
            </Card>
          ) : (
            <EmptyState compact icon="time-outline" title="No movements yet" body="Purchases, sales and transfers show up here." />
          )}
        </Stack>
      </Screen>

      {owner ? (
        <>
          <AdjustSheet key={`adjust-${nonce}`} visible={sheet === "adjust"} onClose={() => setSheet(null)} item={d} defaultStoreId={storeId} />
          {canTransfer ? <TransferSheet key={`transfer-${nonce}`} visible={sheet === "transfer"} onClose={() => setSheet(null)} item={d} defaultStoreId={storeId} /> : null}
        </>
      ) : null}
    </>
  );
}
