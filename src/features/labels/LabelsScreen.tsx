import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useDeferredValue, useEffect, useState } from "react";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import type { LabelJobsResponse, LabelTemplate } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatQty, formatRelative } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  confirm,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  PressableScale,
  Row,
  SearchBar,
  SectionTitle,
  Segmented,
  Skeleton,
  SkeletonList,
  Stack,
  Stepper,
  Text,
  toast
} from "@/ui";
import { variantText } from "./labelHtml";
import { LabelPreview } from "./LabelPreview";
import { printLabelSheet, shareLabelSheet } from "./print";
import { totalLabels, usePrintList } from "./printList";

export const labelKeys = {
  search: (q: string) => ["labels", "search", q] as const,
  jobs: (source: string) => ["labels", "jobs", source] as const,
  job: (id: string) => ["labels", "job", id] as const
};

/** Tiny drawing of a sheet: columns × rows of labels on the page. */
function SheetGlyph({ template, selected }: { template: LabelTemplate; selected: boolean }) {
  const theme = useTheme();
  const w = 44;
  const scale = w / template.page.width;
  const h = Math.min(64, template.page.height * scale);
  const s = Math.min(scale, 64 / template.page.height);
  const color = selected ? theme.colors.accent : theme.colors.borderStrong;
  return (
    <View style={{ width: template.page.width * s, height: h, borderRadius: 3, borderWidth: 1, borderColor: color, backgroundColor: theme.colors.surface, overflow: "hidden" }}>
      {Array.from({ length: Math.min(template.columns * template.rows, 60) }).map((_, i) => {
        const col = i % template.columns;
        const row = Math.floor(i / template.columns);
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: (template.margin.left + col * (template.label.width + template.gap.x)) * s,
              top: (template.margin.top + row * (template.label.height + template.gap.y)) * s,
              width: Math.max(2, template.label.width * s - 1),
              height: Math.max(2, template.label.height * s - 1),
              borderRadius: 1,
              backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceSunken,
              borderWidth: 0.5,
              borderColor: color
            }}
          />
        );
      })}
    </View>
  );
}

function PrintTab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const list = usePrintList();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<null | "print" | "share">(null);
  const term = useDeferredValue(q.trim());
  // q < 2 still returns the templates and fields.
  const base = useQuery({ queryKey: labelKeys.search(""), queryFn: () => api.labels.search(""), staleTime: 10 * 60_000 });
  const search = useQuery({ queryKey: labelKeys.search(term), queryFn: () => api.labels.search(term), enabled: term.length >= 2, placeholderData: (prev) => prev });
  const templates = base.data?.templates ?? [];
  const fieldOptions = base.data?.fields ?? [];
  const template = templates.find((t) => t.key === list.template) ?? templates.find((t) => t.key === "a4-3x8") ?? templates[0];
  const labels = totalLabels(list.lines);
  const perPage = template ? template.columns * template.rows : 1;
  const sheets = Math.ceil(labels / Math.max(1, perPage));
  const sample = list.lines[0]?.item ?? search.data?.items[0] ?? { barcode: "8901234567890", name: "Cotton kurta", brand: "Brand", size: "M", color: "Blue", mrp: 1299, price: 999 };

  const record = useMutation({
    mutationFn: () => api.labels.recordPrint({ template: template!.key, items: list.lines.slice(0, 500).map((l) => ({ barcodeId: l.item.barcodeId, copies: l.copies })) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["labels", "jobs"] });
      toast.success("Saved to print history");
    },
    onError: (e) => toast.error(`Printed, but not saved to history: ${errorMessage(e)}`)
  });

  const print = async (mode: "print" | "share") => {
    if (!template || !list.lines.length) return;
    setBusy(mode);
    try {
      const entries = list.lines.map((l) => ({ item: l.item, copies: l.copies }));
      if (mode === "print") await printLabelSheet(template, entries, list.fields, me?.shopName ?? "");
      else await shareLabelSheet(template, entries, list.fields, me?.shopName ?? "");
      haptic.success();
      record.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const add = (item: (typeof list.lines)[number]["item"]) => {
    const result = list.add(item);
    haptic.select();
    toast.success(result === "more" ? `${item.name}: one more label` : `Added ${item.name}`);
  };

  const clear = async () => {
    if (await confirm({ title: "Clear the print list?", confirmLabel: "Clear", destructive: true })) list.clear();
  };

  if (base.isLoading) {
    return (
      <View style={{ padding: 16, gap: 16 }}>
        <Skeleton height={48} radius={24} />
        <Skeleton height={120} radius={theme.radius.card} />
        <Skeleton height={160} radius={theme.radius.card} />
      </View>
    );
  }
  if (base.isError) return <ErrorState message={errorMessage(base.error)} onRetry={() => base.refetch()} />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SearchBar value={q} onChangeText={setQ} placeholder="Find items: name, brand or barcode" />
        {term.length >= 2 ? (
          <Card padded={false}>
            {search.isLoading ? (
              <SkeletonList rows={3} withAvatar={false} />
            ) : search.isError ? (
              <ErrorState message={errorMessage(search.error)} onRetry={() => search.refetch()} />
            ) : !search.data?.items.length ? (
              <EmptyState compact icon="search" title="No items found" body={`Nothing matches “${term}”.`} />
            ) : (
              search.data.items.map((item, i) => {
                const inList = list.lines.find((l) => l.item.barcodeId === item.barcodeId);
                return (
                  <View key={item.barcodeId}>
                    {i ? <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 16 }} /> : null}
                    <PressableScale
                      onPress={() => add(item)}
                      scaleTo={0.985}
                      accessibilityLabel={`${item.name}, ${variantText(item)}, ${formatQty(item.stock)} in stock. ${inList ? "Add one more label" : "Add to print list"}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 64 }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text variant="small" color="textMuted" numberOfLines={1}>
                          {[variantText(item, true), item.barcode].filter(Boolean).join(" · ")}
                        </Text>
                        <Text variant="caption" color="textFaint" tabular>
                          {formatMoney(item.price)} · {formatQty(item.stock)} in stock
                        </Text>
                      </View>
                      {inList ? <Badge label={`${inList.copies} added`} tone="success" icon="checkmark" /> : <Icon name="add-circle" size={28} color="accent" />}
                    </PressableScale>
                  </View>
                );
              })
            )}
          </Card>
        ) : null}

        <Stack gap={2}>
          <SectionTitle title={list.lines.length ? `Print list · ${labels} label${labels === 1 ? "" : "s"}` : "Print list"} action={list.lines.length ? "Clear" : undefined} onAction={clear} />
          {list.lines.length ? (
            <Card padded={false}>
              {list.lines.map((line, i) => (
                <Animated.View
                  key={line.item.barcodeId}
                  entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(18)}
                  exiting={theme.reduceMotion ? undefined : FadeOut.duration(150)}
                  layout={theme.reduceMotion ? undefined : LinearTransition}
                >
                  {i ? <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: 16 }} /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingVertical: 10, paddingLeft: 14, paddingRight: 8 }}>
                    <View style={{ flexGrow: 1, flexBasis: 150, minWidth: 0 }}>
                      <Text variant="body" weight="600" numberOfLines={1}>
                        {line.item.name}
                      </Text>
                      <Text variant="small" color="textMuted" numberOfLines={1}>
                        {[variantText(line.item), line.item.barcode].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Stepper
                      value={line.copies}
                      min={0}
                      max={2000}
                      label={`Copies of ${line.item.name}`}
                      onChange={(n) => (n <= 0 ? list.remove(line.item.barcodeId) : list.setCopies(line.item.barcodeId, n))}
                    />
                  </View>
                </Animated.View>
              ))}
            </Card>
          ) : (
            <Card>
              <EmptyState compact icon="barcode-outline" title="Nothing to print yet" body="Search for items above. Each starts with one label per piece in stock." />
            </Card>
          )}
        </Stack>

        <Stack gap={2}>
          <SectionTitle title="Label sheet" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -16 }}>
            <View style={{ width: 6 }} />
            {templates.map((t) => {
              const selected = t.key === template?.key;
              return (
                <PressableScale
                  key={t.key}
                  onPress={() => {
                    haptic.select();
                    list.set({ template: t.key });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t.name}. ${t.description}`}
                  scaleTo={0.96}
                  style={{
                    width: 168,
                    padding: 12,
                    gap: 8,
                    borderRadius: theme.radius.card,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface
                  }}
                >
                  <Row justify="space-between" align="flex-start">
                    <SheetGlyph template={t} selected={selected} />
                    {selected ? <Icon name="checkmark-circle" color="accent" /> : null}
                  </Row>
                  <Text variant="small" weight="700" numberOfLines={2} color={selected ? "accentSoftText" : "text"}>
                    {t.name}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={2}>
                    {t.label.width} × {t.label.height} mm · {t.description}
                  </Text>
                </PressableScale>
              );
            })}
            <View style={{ width: 6 }} />
          </ScrollView>
        </Stack>

        <Stack gap={2}>
          <SectionTitle title="On each label" />
          <Row gap={2} wrap>
            {fieldOptions.map((f) => {
              const on = list.fields.includes(f.key);
              return (
                <Chip
                  key={f.key}
                  label={f.label}
                  icon={on ? "checkbox" : "square-outline"}
                  selected={on}
                  onPress={() => list.set({ fields: on ? list.fields.filter((k) => k !== f.key) : [...list.fields, f.key] })}
                />
              );
            })}
          </Row>
        </Stack>

        {template ? (
          <Stack gap={2}>
            <SectionTitle title="Preview" />
            <Card style={{ gap: 12, backgroundColor: theme.colors.surfaceSunken }}>
              <LabelPreview template={template} item={sample} fields={list.fields} shop={me?.shopName ?? ""} />
              <Text variant="small" color="textMuted" align="center">
                Actual size {template.label.width} × {template.label.height} mm{list.lines.length ? "" : " · sample item"}
              </Text>
            </Card>
          </Stack>
        ) : null}
      </ScrollView>

      {list.lines.length ? (
        <Animated.View
          entering={theme.reduceMotion ? undefined : FadeInDown.springify().damping(18)}
          style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}
        >
          <Text variant="small" color="textMuted" tabular>
            {labels} label{labels === 1 ? "" : "s"} · {list.lines.length} item{list.lines.length === 1 ? "" : "s"}
            {template && perPage > 1 ? ` · ${sheets} sheet${sheets === 1 ? "" : "s"}` : ""}
          </Text>
          <Row gap={2}>
            <Button
              label={`Print ${labels} label${labels === 1 ? "" : "s"}`}
              icon="print-outline"
              size="lg"
              style={{ flex: 1 }}
              loading={busy === "print"}
              disabled={!!busy || !template}
              onPress={() => print("print")}
            />
            {Platform.OS !== "web" ? <IconButton icon="share-outline" label="Share as PDF" variant="soft" onPress={() => print("share")} disabled={!!busy} /> : null}
          </Row>
        </Animated.View>
      ) : null}
    </View>
  );
}

const sources = [
  { key: "all", label: "All" },
  { key: "purchase", label: "From purchases" },
  { key: "manual", label: "Printed here" }
] as const;

type JobRow = LabelJobsResponse["rows"][number];

function HistoryTab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<(typeof sources)[number]["key"]>("all");
  const jobs = useInfiniteQuery({
    queryKey: labelKeys.jobs(source),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.labels.jobs({ source: source === "all" ? undefined : source, page: pageParam }),
    getNextPageParam: (last, pages) => (pages.length * 25 < last.total ? pages.length + 1 : undefined)
  });
  const rows = jobs.data?.pages.flatMap((p) => p.rows) ?? [];
  const renderRow = ({ item }: { item: JobRow }) => (
    <PressableScale
      onPress={() => router.push(`/labels/jobs/${item.id}`)}
      scaleTo={0.985}
      accessibilityLabel={`${item.title}, ${formatRelative(item.at)}, ${item.labels} labels`}
      style={{
        marginHorizontal: 16,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.card
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: item.source === "purchase" ? theme.colors.infoSoft : theme.colors.accentSoft
        }}
      >
        <Icon name={item.source === "purchase" ? "cube-outline" : "print-outline"} size={20} color={item.source === "purchase" ? "info" : "accentSoftText"} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {[formatRelative(item.at), item.store].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="bodyStrong" tabular>
          {item.labels}
        </Text>
        <Text variant="caption" color="textMuted">
          labels
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color="textFaint" />
    </PressableScale>
  );
  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={renderRow}
      ListHeaderComponent={
        <View style={{ paddingBottom: 12 }}>
          <ChipRow options={sources.map((s) => ({ key: s.key, label: s.label }))} value={source} onChange={setSource} />
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      ListEmptyComponent={
        jobs.isLoading ? (
          <SkeletonList rows={5} />
        ) : jobs.isError ? (
          <ErrorState message={errorMessage(jobs.error)} onRetry={() => jobs.refetch()} />
        ) : (
          <EmptyState icon="print-outline" title="No label jobs yet" body="Labels queued by purchases and labels you print show up here for 30 days." />
        )
      }
      onEndReached={() => jobs.hasNextPage && !jobs.isFetchingNextPage && jobs.fetchNextPage()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={jobs.isRefetching && !jobs.isFetchingNextPage} onRefresh={() => jobs.refetch()} tintColor={theme.colors.accent} colors={[theme.colors.accent]} />}
    />
  );
}

/** Loads a job (e.g. from a purchase's "Print labels") into the print list once. */
function useJobPreload(jobId: string | undefined) {
  const job = useQuery({ queryKey: labelKeys.job(jobId ?? ""), queryFn: () => api.labels.job(jobId!), enabled: !!jobId });
  const data = job.data;
  useEffect(() => {
    if (jobId && data && usePrintList.getState().source !== jobId) {
      usePrintList.getState().load(
        data.items.map(({ copies, ...item }) => ({ item, copies })),
        jobId
      );
    }
  }, [jobId, data]);
  return job;
}

export function LabelsScreen({ jobId }: { jobId?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me);
  const canPrint = can(me, "barcode.print");
  const [tab, setTab] = useState<"print" | "history">(canPrint ? "print" : "history");
  const job = useJobPreload(canPrint ? jobId : undefined);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
      <Header back title="Barcode labels" subtitle={jobId && job.data ? `Loaded ${job.data.items.length} item${job.data.items.length === 1 ? "" : "s"} from a print job` : undefined} />
      {canPrint ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Segmented
            accessibilityLabel="Labels"
            options={[
              { key: "print", label: "Print", icon: "print-outline" },
              { key: "history", label: "History", icon: "time-outline" }
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
      ) : null}
      {jobId && job.isLoading && tab === "print" ? (
        <Animated.View entering={FadeIn} style={{ paddingHorizontal: 16 }}>
          <Badge label="Loading print job…" tone="info" icon="cloud-download-outline" />
        </Animated.View>
      ) : null}
      {jobId && job.isError ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Badge label={`Couldn't load the job: ${errorMessage(job.error)}`} tone="danger" />
        </View>
      ) : null}
      {tab === "print" && canPrint ? <PrintTab /> : <HistoryTab />}
    </View>
  );
}
