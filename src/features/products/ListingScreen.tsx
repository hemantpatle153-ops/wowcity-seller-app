import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { ProductListingResponse } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { Thumb } from "@/features/stock/Thumb";
import { shortStoreName } from "@/features/stock/stockLogic";
import { formatMoney, formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, confirm, Divider, ErrorState, Header, Icon, Input, PressableScale, Row, Screen, SectionTitle, Skeleton, SkeletonCards, Text, toast, ToggleRow } from "@/ui";
import { buildListingBody, buyerPreview, DESCRIPTION_MAX, draftFromListing, LISTING_TAGS_MAX, listingProblems, publicStatusMeta, type ListingDraft } from "./listingLogic";
import { TagEditor } from "./TagEditor";

function Block({ title, hint, children, index }: { title: string; hint?: string; children: ReactNode; index: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.duration(240).delay(index * 40)} style={{ gap: 4 }}>
      <SectionTitle title={title} />
      {hint ? (
        <Text variant="small" color="textMuted" style={{ marginBottom: 4 }}>
          {hint}
        </Text>
      ) : null}
      {children}
    </Animated.View>
  );
}

function BuyerPreview({ draft, listing }: { draft: ListingDraft; listing: ProductListingResponse }) {
  const theme = useTheme();
  const p = buyerPreview(draft, listing);
  const off = p.price !== null && p.mrp !== null && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  return (
    <View
      accessibilityLabel={`Buyer preview: ${[p.title ?? "no name", p.brand, p.price !== null ? formatMoney(p.price) : "price hidden", p.inStock ? "in stock" : "out of stock"].filter(Boolean).join(", ")}`}
      style={{ flexDirection: "row", gap: 12, padding: 12, borderRadius: theme.radius.card, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, opacity: draft.enabled ? 1 : 0.6 }}
    >
      <Thumb url={p.image} size={92} icon={p.image ? "shirt-outline" : "camera-outline"} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        {p.brand ? (
          <Text variant="caption" color="textMuted" weight="700" uppercase numberOfLines={1}>
            {p.brand}
          </Text>
        ) : null}
        <Text variant="bodyStrong" numberOfLines={2} color={p.title ? "text" : "textFaint"}>
          {p.title ?? "Name hidden"}
        </Text>
        {p.category ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {p.category}
          </Text>
        ) : null}
        <Row gap={2} wrap>
          {p.price !== null ? (
            <Text variant="bodyStrong" tabular>
              {formatMoney(p.price)}
            </Text>
          ) : null}
          {p.mrp !== null && (p.price === null || off > 0) ? (
            <Text variant="small" color="textFaint" tabular style={p.price !== null ? { textDecorationLine: "line-through" } : undefined}>
              {p.price === null ? `MRP ${formatMoney(p.mrp)}` : formatMoney(p.mrp)}
            </Text>
          ) : null}
          {off > 0 ? (
            <Text variant="small" color="success" weight="700">
              {off}% off
            </Text>
          ) : null}
          {p.price === null && p.mrp === null ? (
            <Text variant="small" color="textMuted">
              Price on request
            </Text>
          ) : null}
        </Row>
        {p.options.length ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {p.options.slice(0, 4).join(" · ")}
            {p.options.length > 4 ? ` +${p.options.length - 4}` : ""}
          </Text>
        ) : null}
        {p.customLabels.length ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            Also shows: {p.customLabels.join(", ")}
          </Text>
        ) : null}
        <Row gap={2} wrap style={{ marginTop: 2 }}>
          <Badge label={p.inStock ? "In stock" : "Out of stock"} tone={p.inStock ? "success" : "danger"} />
          {p.stores[0] ? <Badge label={`${shortStoreName(p.stores[0].name)}${p.stores.length > 1 ? ` +${p.stores.length - 1}` : ""}`} icon="location-outline" tone="neutral" /> : null}
        </Row>
      </View>
    </View>
  );
}

function StorePick({ store, selected, onPress, disabled }: { store: ProductListingResponse["stores"][number]; selected: boolean; onPress: () => void; disabled: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${store.name}${store.city ? `, ${store.city}` : ""}${store.discoverable ? "" : ", hidden from buyer search"}`}
      scaleTo={0.99}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: theme.space[4], paddingVertical: 8 }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
          backgroundColor: selected ? theme.colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {selected ? <Icon name="checkmark" size={18} color="accentText" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600" numberOfLines={1}>
          {shortStoreName(store.name)}
        </Text>
        <Row gap={2} wrap>
          {store.city ? (
            <Text variant="caption" color="textMuted">
              {store.city}
            </Text>
          ) : null}
          {store.discoverable ? <Badge label="Discoverable" tone="success" icon="eye-outline" /> : <Badge label="Hidden from search" tone="warning" icon="eye-off-outline" />}
        </Row>
      </View>
    </PressableScale>
  );
}

function ListingEditor({ listing, canPublish }: { listing: ProductListingResponse; canPublish: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [baseline, setBaseline] = useState(() => draftFromListing(listing));
  const [draft, setDraft] = useState<ListingDraft>(baseline);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(buildListingBody(draft, listing)) !== JSON.stringify(buildListingBody(baseline, listing));
  const problems = listingProblems(draft);
  const locked = !canPublish;
  const statusStores = listing.stores.filter((s) => listing.variants.some((v) => v.status[s.id] && v.status[s.id] !== "hidden") || draft.storeIds.includes(s.id));

  const save = useMutation({
    mutationFn: () => api.products.saveListing(listing.product.id, buildListingBody(draft, listing)),
    onSuccess: (result) => {
      toast.success(result.message);
      setBaseline(draft);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (e) => {
      haptic.error();
      setError(errorMessage(e));
    }
  });

  const update = (patch: Partial<ListingDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  const toggleStore = (id: string) => update({ storeIds: draft.storeIds.includes(id) ? draft.storeIds.filter((s) => s !== id) : [...draft.storeIds, id] });

  const leave = async () => {
    if (dirty && !(await confirm({ title: "Discard listing changes?", message: "Your changes are not saved.", confirmLabel: "Discard", destructive: true }))) return;
    router.back();
  };

  const shownCount = Object.values(draft.fields).filter(Boolean).length;
  const liveHint = !draft.enabled
    ? "Hidden from buyers."
    : draft.storeIds.length
      ? `Buyers can find it in ${draft.storeIds.length} store${draft.storeIds.length === 1 ? "" : "s"} while it's in stock.`
      : "Pick at least one store below.";

  return (
    <Screen
      header={<Header back onBack={() => void leave()} title="Online listing" subtitle={listing.product.name} right={dirty ? <Badge label="Unsaved" tone="warning" icon="ellipse" /> : undefined} />}
      footerSpace={canPublish ? 100 : 0}
      footer={
        canPublish ? (
          <View style={{ padding: theme.space[4], paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            {error || problems[0] ? (
              <Row gap={2}>
                <Icon name="alert-circle" color="danger" size={18} />
                <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
                  {error ?? problems[0]}
                </Text>
              </Row>
            ) : null}
            <Button
              label={dirty ? (draft.enabled ? "Save & publish" : "Save") : "Saved"}
              icon={dirty ? "cloud-upload-outline" : "checkmark-done"}
              size="lg"
              fullWidth
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={!dirty || problems.length > 0}
            />
          </View>
        ) : undefined
      }
    >
      {locked ? (
        <Row gap={2} style={{ backgroundColor: theme.colors.infoSoft, padding: theme.space[3], borderRadius: theme.radius.control }}>
          <Icon name="lock-closed-outline" color="info" size={20} />
          <Text variant="small" color="info" style={{ flex: 1 }}>
            Only the owner can change what's published. You can see how it looks.
          </Text>
        </Row>
      ) : null}

      <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(220)}>
        <Card style={{ borderColor: draft.enabled ? theme.colors.success : theme.colors.border, borderWidth: draft.enabled ? 2 : 1, paddingVertical: 4 }}>
          <ToggleRow label="Show on WowCity" hint={liveHint} icon={draft.enabled ? "globe" : "globe-outline"} value={draft.enabled} onChange={(enabled) => update({ enabled })} disabled={locked} />
        </Card>
      </Animated.View>

      <Block title="What buyers see" index={1}>
        <BuyerPreview draft={draft} listing={listing} />
      </Block>

      <Block title="Stores" hint="Buyers near these stores can find this product." index={2}>
        <Card padded={false}>
          {listing.stores.map((store, i) => (
            <View key={store.id}>
              {i ? <Divider inset={54} /> : null}
              <StorePick store={store} selected={draft.storeIds.includes(store.id)} onPress={() => toggleStore(store.id)} disabled={locked} />
            </View>
          ))}
          {!listing.stores.length ? (
            <Text variant="small" color="textMuted" style={{ padding: theme.space[4] }}>
              No open stores.
            </Text>
          ) : null}
        </Card>
      </Block>

      <Block title={`Fields shown · ${shownCount}`} hint="Cost, supplier and private columns are never shared." index={3}>
        <Card style={{ paddingVertical: 0 }}>
          {listing.fieldOptions.map((option, i) => (
            <View key={option.key}>
              {i ? <Divider /> : null}
              <ToggleRow
                label={option.label}
                hint={option.key.startsWith("custom:") ? "Custom column" : undefined}
                value={!!draft.fields[option.key]}
                onChange={(value) => update({ fields: { ...draft.fields, [option.key]: value } })}
                disabled={locked}
              />
            </View>
          ))}
        </Card>
      </Block>

      <Block title="Description" index={4}>
        <Input
          value={draft.description}
          onChangeText={(t) => update({ description: t.slice(0, DESCRIPTION_MAX + 50) })}
          placeholder="Fabric, fit, occasion, care…"
          multiline
          editable={!locked}
          accessibilityLabel="Public description"
          error={draft.description.trim().length > DESCRIPTION_MAX ? `${draft.description.trim().length}/${DESCRIPTION_MAX} · too long` : null}
          hint={`${draft.description.trim().length}/${DESCRIPTION_MAX}`}
          style={{ minHeight: 96, textAlignVertical: "top" }}
        />
      </Block>

      <Block title="Search tags" index={5}>
        <TagEditor value={draft.tags} onChange={(tags) => update({ tags })} max={LISTING_TAGS_MAX} placeholder="e.g. wedding, cotton, summer" disabled={locked} />
      </Block>

      <Block title={`Photos · ${listing.images.length}`} index={6}>
        {listing.images.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {listing.images.map((img, i) => (
              <View
                key={img.id}
                accessibilityLabel={`Photo ${i + 1}${i === 0 ? ", cover" : ""}`}
                style={{ width: 96, height: 120, borderRadius: theme.radius.control, overflow: "hidden", backgroundColor: theme.colors.surfaceSunken, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="image-outline" size={28} color="textFaint" />
                {img.url ? <Image source={{ uri: img.url }} style={{ position: "absolute", width: 96, height: 120 }} contentFit="cover" /> : null}
                {i === 0 ? (
                  <View style={{ position: "absolute", left: 6, bottom: 6 }}>
                    <Badge label="Cover" tone="accent" showIcon={false} />
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Icon name="camera-outline" size={28} color="warning" />
            <Text variant="small" color="textMuted" style={{ flex: 1 }}>
              No photos yet. Products with photos get far more views. Add them when you record a purchase.
            </Text>
          </Card>
        )}
      </Block>

      <Block title="Status by store" hint="Updates automatically with stock. Read only." index={7}>
        <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition} style={{ gap: 8 }}>
          {listing.variants.map((v) => (
            <Card key={v.id} style={{ gap: 8 }}>
              <Row gap={2}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {v.label}
                  </Text>
                  <Text variant="caption" color="textMuted" tabular numberOfLines={1}>
                    {[v.barcode, formatMoney(v.price)].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Row>
              <View style={{ gap: 6 }}>
                {(statusStores.length ? statusStores : listing.stores).map((s) => {
                  const status = v.status[s.id] ?? "hidden";
                  const meta = publicStatusMeta[status];
                  return (
                    <Row key={s.id} gap={2}>
                      <Text variant="small" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
                        {shortStoreName(s.name)} · {formatQty(v.stock[s.id] ?? 0)} pcs
                      </Text>
                      <Badge label={meta.label} tone={meta.tone} icon={meta.icon} />
                    </Row>
                  );
                })}
              </View>
            </Card>
          ))}
        </Animated.View>
      </Block>
    </Screen>
  );
}

/** `/products/[productId]/listing`: publish a product to the WowCity buyer app. */
export function ListingScreen({ productId }: { productId: string }) {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const listing = useQuery({ queryKey: ["products", "listing", productId], queryFn: () => api.products.listing(productId), enabled: !!productId });
  if (listing.isLoading) {
    return (
      <Screen header={<Header back title="Online listing" />}>
        <Skeleton height={64} radius={theme.radius.card} />
        <Skeleton height={120} radius={theme.radius.card} />
        <SkeletonCards count={3} height={110} />
      </Screen>
    );
  }
  if (listing.isError || !listing.data) {
    return (
      <Screen header={<Header back title="Online listing" />}>
        <ErrorState message={listing.isError ? errorMessage(listing.error) : "Product not found."} onRetry={() => listing.refetch()} />
      </Screen>
    );
  }
  return <ListingEditor key={listing.data.product.id} listing={listing.data} canPublish={can(me, "product.publication.manage")} />;
}
