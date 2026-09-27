import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { Query } from "@/api/client";
import type { RangePreset, ReportStat, ReportTableOut } from "@/api/types";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatMoneyShort, formatNumber } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import {
  AnimatedNumber,
  Badge,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  Row,
  Screen,
  SearchBar,
  Segmented,
  Skeleton,
  SkeletonCards,
  StatTile,
  Stack,
  Text,
  toast,
  type IconName
} from "@/ui";
import { BarChart, HorizontalBars } from "@/ui/charts";
import { useDebounced } from "@/features/dues/useDebounced";
import { pickReportChart } from "./chart";
import { shareReportCsv, shareReportPdf } from "./exporting";
import { formatCell, formatStat, isNumericFormat, statTone } from "./format";
import { RangeSheet } from "./RangeSheet";
import { rangePresets } from "./ranges";
import { ReportTable } from "./ReportTable";
import { useReportsIndex } from "./ReportsIndexScreen";

const toneIcon: Partial<Record<NonNullable<ReportStat["tone"]>, IconName>> = { positive: "trending-up", negative: "trending-down", warning: "alert-circle" };

function StatValue({ stat }: { stat: ReportStat }) {
  const color = stat.tone === "positive" ? "success" : stat.tone === "negative" ? "danger" : stat.tone === "warning" ? "warning" : "text";
  if (typeof stat.value === "number" && isNumericFormat(stat.format ?? "qty")) {
    return <AnimatedNumber value={stat.value} variant="heading" color={color} format={(n) => formatCell(stat.format === "qty" || !stat.format ? Math.round(n) : n, stat.format ?? "qty")} />;
  }
  return (
    <Text variant={formatStat(stat).length > 12 ? "title" : "heading"} color={color} numberOfLines={2}>
      {formatStat(stat)}
    </Text>
  );
}

function ChartCard({ table, dated }: { table: ReportTableOut | undefined; dated: boolean }) {
  const chart = pickReportChart(table, { dated });
  if (!chart) return null;
  const fmtShort = chart.format === "money" ? formatMoneyShort : (n: number) => formatNumber(Math.round(n));
  const fmtFull = chart.format === "money" ? (n: number) => formatMoney(n) : (n: number) => formatNumber(n);
  return (
    <Card style={{ gap: 8 }}>
      <Text variant="title" accessibilityRole="header">
        {chart.title}
      </Text>
      {chart.kind === "bars" ? (
        <BarChart data={chart.data} format={fmtShort} formatFull={fmtFull} title={chart.title} noun="days" height={150} />
      ) : (
        <HorizontalBars data={chart.data} format={fmtFull} title={chart.title} />
      )}
    </Card>
  );
}

function ViewerSkeleton() {
  return (
    <Stack gap={3}>
      <Row gap={3}>
        <Skeleton height={92} radius={16} style={{ flex: 1 }} width="auto" />
        <Skeleton height={92} radius={16} style={{ flex: 1 }} width="auto" />
      </Row>
      <Row gap={3}>
        <Skeleton height={92} radius={16} style={{ flex: 1 }} width="auto" />
        <Skeleton height={92} radius={16} style={{ flex: 1 }} width="auto" />
      </Row>
      <SkeletonCards count={1} height={220} />
      <SkeletonCards count={3} height={84} />
    </Stack>
  );
}

/** Any report from GET /reports/{slug}: range, store, view and search filters; stats, a chart, and tables. */
export function ReportViewerScreen({ slug }: { slug: string }) {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const canExport = owner && can(me, "reports.export");
  const index = useReportsIndex();
  const meta = index.data?.groups.flatMap((g) => g.reports).find((r) => r.slug === slug);

  const [range, setRange] = useState<RangePreset | null>(null);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [rangeSheet, setRangeSheet] = useState<number | null>(null);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const [store, setStore] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim(), 350);
  const [mode, setMode] = useState<"cards" | "table">("cards");
  const [pulling, setPulling] = useState(false);
  const [exporting, setExporting] = useState<{ table: string; kind: "csv" | "pdf" } | null>(null);

  const dated = meta?.dated ?? true;
  const filters: Query = {
    range: dated && range ? range : undefined,
    from: range === "custom" ? custom?.from : undefined,
    to: range === "custom" ? custom?.to : undefined,
    store: owner && store ? store : undefined,
    view: view ?? undefined,
    q: search || undefined
  };
  const query = useQuery({
    queryKey: ["reports", "run", slug, filters],
    queryFn: () => api.reports.run(slug, filters),
    placeholderData: keepPreviousData
  });
  const data = query.data;
  const activeRange: RangePreset | null = range ?? meta?.defaultRange ?? null;
  const activeView = view ?? data?.view ?? meta?.views[0]?.key ?? null;
  const stores = owner ? (me?.stores ?? []) : [];

  const runExport = async (table: ReportTableOut, kind: "csv" | "pdf") => {
    if (!data) return;
    setExporting({ table: table.key, kind });
    try {
      if (kind === "csv") {
        const name = await shareReportCsv(slug, filters, table, data.period);
        haptic.success();
        toast.success(`Saved ${name}`);
      } else {
        await shareReportPdf(data, table, me?.shopName);
        haptic.success();
      }
    } catch (e) {
      haptic.error();
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  const title = data?.title ?? meta?.title ?? "Report";
  const firstWithRows = data?.tables.find((t) => t.rows.length > 0);

  return (
    <Screen
      header={<Header back title={title} subtitle={data?.period?.label ?? (meta?.dated === false ? "As of now" : undefined)} />}
      onRefresh={() => {
        setPulling(true);
        query.refetch().finally(() => setPulling(false));
      }}
      refreshing={pulling}
    >
      {meta?.description ? (
        <Text variant="small" color="textMuted" style={{ marginTop: -theme.space[2] }}>
          {meta.description}
        </Text>
      ) : null}

      {/* Filters */}
      {dated ? (
        <View style={{ marginHorizontal: -theme.space[4] }}>
          <ChipRow
            options={rangePresets.map((r) => ({
              key: r.key,
              label: r.key === "custom" && range === "custom" && custom ? `${custom.from.slice(5)} → ${custom.to.slice(5)}` : r.label,
              icon: r.key === "custom" ? ("calendar-outline" as const) : undefined
            }))}
            value={activeRange ?? "30d"}
            onChange={(key) => {
              if (key === "custom") {
                setRangeSheet(Date.now());
                setRangeSheetOpen(true);
                return;
              }
              setRange(key);
            }}
          />
        </View>
      ) : null}
      {stores.length > 1 ? (
        <View style={{ marginHorizontal: -theme.space[4], marginTop: -theme.space[2] }}>
          <ChipRow
            options={[{ key: "all", label: "All stores", icon: "layers-outline" as const }, ...stores.map((s) => ({ key: s.id, label: s.name, icon: "storefront-outline" as const }))]}
            value={store ?? "all"}
            onChange={(key) => setStore(key === "all" ? null : key)}
          />
        </View>
      ) : null}
      {meta && meta.views.length > 1 ? (
        meta.views.length <= 3 ? (
          <Segmented accessibilityLabel="Report view" options={meta.views.map((v) => ({ key: v.key, label: v.label }))} value={activeView ?? meta.views[0].key} onChange={setView} />
        ) : (
          <View style={{ marginHorizontal: -theme.space[4], marginTop: -theme.space[2] }}>
            <ChipRow options={meta.views.map((v) => ({ key: v.key, label: v.label }))} value={activeView ?? meta.views[0].key} onChange={setView} />
          </View>
        )
      ) : null}
      {meta?.searchable ? <SearchBar value={q} onChangeText={setQ} placeholder={meta.searchable} /> : null}

      {data ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(200)} style={{ gap: theme.space[4], opacity: query.isPlaceholderData ? 0.6 : 1 }}>
          <Row gap={2} wrap>
            <Icon name={data.period ? "calendar-outline" : "time-outline"} size={16} color="textMuted" />
            <Text variant="small" color="textMuted" style={{ flex: 1 }}>
              {data.period
                ? `${data.period.label} · ${formatCell(data.period.from, "date")}${data.period.to !== data.period.from ? ` – ${formatCell(data.period.to, "date")}` : ""}`
                : "Current position"}
            </Text>
            {query.isFetching ? <Badge label="Updating" tone="info" icon="sync-outline" /> : null}
            {query.isError ? <Badge label="Couldn't refresh" tone="warning" /> : null}
          </Row>

          {data.stats.length ? (
            <Row gap={3} wrap align="stretch">
              {data.stats.map((s) => (
                <StatTile key={s.label} label={s.label} hint={s.hint} tone={statTone(s.tone)} icon={s.tone ? toneIcon[s.tone] : undefined} value={formatStat(s)}>
                  <StatValue stat={s} />
                </StatTile>
              ))}
            </Row>
          ) : null}

          {data.notes.length ? (
            <View style={{ flexDirection: "row", gap: 10, padding: theme.space[3], borderRadius: theme.radius.card, backgroundColor: theme.colors.infoSoft }}>
              <Icon name="information-circle" size={20} color="info" />
              <View style={{ flex: 1, gap: 4 }}>
                {data.notes.map((n) => (
                  <Text key={n} variant="small" color="text">
                    {n}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          <ChartCard table={firstWithRows} dated={!!data.period} />

          {data.tables.some((t) => t.rows.length) ? (
            <Row justify="space-between" gap={3}>
              <Text variant="small" weight="700" color="textMuted" uppercase style={{ flex: 1 }}>
                Details
              </Text>
              <View style={{ width: 200 }}>
                <Segmented
                  accessibilityLabel="Show rows as"
                  options={[
                    { key: "cards", label: "Cards", icon: "albums-outline" },
                    { key: "table", label: "Table", icon: "grid-outline" }
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              </View>
            </Row>
          ) : null}

          {data.tables.map((t) => (
            <ReportTable
              key={`${t.key}-${mode}-${activeView}-${JSON.stringify(filters)}`}
              table={t}
              mode={mode}
              onCsv={canExport ? () => runExport(t, "csv") : undefined}
              onPdf={canExport ? () => runExport(t, "pdf") : undefined}
              exporting={exporting?.table === t.key ? exporting.kind : null}
            />
          ))}
          {!data.tables.length && !data.stats.length ? <EmptyState icon="document-outline" title="Nothing in this report" body="Try a different date range." compact /> : null}
          {data.tables.length > 0 && !canExport ? (
            <Text variant="caption" color="textFaint" align="center">
              Exports are available to the shop owner.
            </Text>
          ) : null}
        </Animated.View>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <ViewerSkeleton />
      )}

      {rangeSheet !== null ? (
        <RangeSheet
          key={rangeSheet}
          visible={rangeSheetOpen}
          onClose={() => setRangeSheetOpen(false)}
          initialFrom={custom?.from ?? data?.period?.from}
          initialTo={custom?.to ?? data?.period?.to}
          onApply={(from, to) => {
            setCustom({ from, to });
            setRange("custom");
            setRangeSheetOpen(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
