import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { ReportColumn, ReportRow, ReportTableOut } from "@/api/types";
import { formatNumber } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, EmptyState, Icon, PressableScale, Row, Text } from "@/ui";
import { badgeTone, cardLayout, cellFormat, columnWidth, EMPTY_CELL, formatCell, isNumericFormat, visibleColumns } from "./format";
import { appHref } from "./links";
import { openPath } from "./navigate";

const PAGE = 40;

function rowHref(row: ReportRow, columns: ReportColumn[]): string | null {
  for (const c of columns) {
    const raw = c.hrefKey ? row[c.hrefKey] : c.href;
    const href = appHref(raw);
    if (href) return href;
  }
  return null;
}

function Cell({ row, column, strong, align, link }: { row: ReportRow; column: ReportColumn; strong?: boolean; align?: "left" | "right"; link?: boolean }) {
  const format = cellFormat(row, column);
  const value = row[column.key];
  const text = formatCell(value, format);
  if (format === "badge" && text !== EMPTY_CELL) return <Badge label={text} tone={badgeTone(text)} showIcon={false} />;
  const numeric = isNumericFormat(format);
  const negative = numeric && typeof value === "number" && value < 0;
  return (
    <Text
      variant="small"
      weight={strong ? "700" : numeric ? "600" : "400"}
      color={link ? "accent" : negative ? "danger" : text === EMPTY_CELL ? "textFaint" : "text"}
      tabular={numeric || format === "mono"}
      align={align ?? (numeric ? "right" : "left")}
      numberOfLines={2}
    >
      {text}
    </Text>
  );
}

function RowCard({ row, columns, layout }: { row: ReportRow; columns: ReportColumn[]; layout: ReturnType<typeof cardLayout> }) {
  const theme = useTheme();
  const href = rowHref(row, columns);
  const strong = !!row.emphasis;
  const titleText = layout.title ? formatCell(row[layout.title.key], cellFormat(row, layout.title)) : "";
  const valueText = layout.value ? formatCell(row[layout.value.key], cellFormat(row, layout.value)) : "";
  const a11y = columns.map((c) => `${c.label}: ${formatCell(row[c.key], cellFormat(row, c))}`).join(", ");
  const body = (
    <View style={{ paddingHorizontal: theme.space[4], paddingVertical: 12, gap: 6 }}>
      <Row gap={3} align="flex-start">
        <View style={{ flex: 1, minWidth: 0 }}>
          {layout.title ? <Cell row={row} column={layout.title} strong align="left" link={!!href && strong === false && titleText !== EMPTY_CELL} /> : null}
          {layout.date ? (
            <Text variant="caption" color="textMuted">
              {formatCell(row[layout.date.key], cellFormat(row, layout.date))}
            </Text>
          ) : null}
        </View>
        {layout.value ? (
          <View style={{ alignItems: "flex-end", maxWidth: "50%" }}>
            <Text variant="caption" color="textFaint" numberOfLines={1}>
              {layout.value.label}
            </Text>
            <Text variant="bodyStrong" weight={strong ? "800" : "700"} tabular color={typeof row[layout.value.key] === "number" && (row[layout.value.key] as number) < 0 ? "danger" : "text"}>
              {valueText}
            </Text>
          </View>
        ) : null}
        {href ? <Icon name="chevron-forward" size={18} color="textFaint" /> : null}
      </Row>
      {layout.details.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 }}>
          {layout.details.map((c) => (
            <View key={c.key} style={{ minWidth: Math.round(Math.min(130, columnWidth(c.format) * 0.7) * Math.min(1.3, theme.fontScale)), maxWidth: "100%", gap: 1 }}>
              <Text variant="caption" color="textFaint" numberOfLines={1}>
                {c.label}
              </Text>
              <Cell row={row} column={c} strong={strong} align="left" />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
  if (href)
    return (
      <PressableScale onPress={() => openPath(href)} scaleTo={0.99} accessibilityLabel={a11y} accessibilityHint="Opens details">
        {body}
      </PressableScale>
    );
  return (
    <View accessible accessibilityLabel={a11y}>
      {body}
    </View>
  );
}

function TotalsCard({ table, columns }: { table: ReportTableOut; columns: ReportColumn[] }) {
  const theme = useTheme();
  const totals = table.totals;
  if (!totals) return null;
  const cols = columns.filter((c) => isNumericFormat(c.format) && totals[c.key] !== undefined && totals[c.key] !== null);
  if (!cols.length) return null;
  return (
    <View style={{ paddingHorizontal: theme.space[4], paddingVertical: 12, backgroundColor: theme.colors.surfaceSunken, borderBottomLeftRadius: theme.radius.card, borderBottomRightRadius: theme.radius.card, gap: 6 }}>
      <Text variant="small" weight="800" uppercase color="textMuted">
        Total
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 6 }}>
        {cols.map((c) => (
          <View key={c.key} style={{ gap: 1 }}>
            <Text variant="caption" color="textMuted">
              {c.label}
            </Text>
            <Text variant="bodyStrong" weight="800" tabular>
              {formatCell(totals[c.key], cellFormat(totals, c))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GridTable({ table, rows }: { table: ReportTableOut; rows: ReportRow[] }) {
  const theme = useTheme();
  const cols = table.columns;
  const widths = cols.map((c) => Math.round(columnWidth(c.format) * Math.min(1.35, theme.fontScale)));
  const cellPad = 10;
  const line = (row: ReportRow, i: number, kind: "row" | "total") => {
    const href = kind === "row" ? rowHref(row, cols) : null;
    const strong = kind === "total" || !!row.emphasis;
    const content = (
      <View style={{ flexDirection: "row", minHeight: 44, alignItems: "center", backgroundColor: kind === "total" ? theme.colors.surfaceSunken : i % 2 ? theme.colors.bg : "transparent", borderBottomWidth: 1, borderColor: theme.colors.border }}>
        {cols.map((c, ci) => {
          const empty = kind === "total" && ci === 0 && (row[c.key] === undefined || row[c.key] === null);
          return (
            <View key={c.key} style={{ width: widths[ci], paddingHorizontal: cellPad, paddingVertical: 8 }}>
              {empty ? (
                <Text variant="small" weight="800">
                  Total
                </Text>
              ) : kind === "total" && !isNumericFormat(c.format) && ci !== 0 ? null : (
                <Cell row={row} column={c} strong={strong} link={!!href && ci === cols.findIndex((x) => x.hrefKey || x.href)} />
              )}
            </View>
          );
        })}
      </View>
    );
    if (href)
      return (
        <PressableScale key={`r${i}`} onPress={() => openPath(href)} scaleTo={0.995} accessibilityLabel={cols.map((c) => `${c.label}: ${formatCell(row[c.key], cellFormat(row, c))}`).join(", ")}>
          {content}
        </PressableScale>
      );
    return <View key={kind === "total" ? "total" : `r${i}`}>{content}</View>;
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
      <View>
        <View style={{ flexDirection: "row", backgroundColor: theme.colors.surfaceSunken, borderBottomWidth: 1, borderColor: theme.colors.borderStrong }}>
          {cols.map((c, ci) => (
            <View key={c.key} style={{ width: widths[ci], paddingHorizontal: cellPad, paddingVertical: 10 }}>
              <Text variant="caption" weight="800" color="textMuted" align={isNumericFormat(c.format) ? "right" : "left"} numberOfLines={2}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((r, i) => line(r, i, "row"))}
        {table.totals ? line(table.totals, rows.length, "total") : null}
      </View>
    </ScrollView>
  );
}

/** One report table: mobile cards (hideOnMobile columns hidden) or a scrollable grid. */
export function ReportTable({
  table,
  mode,
  onCsv,
  onPdf,
  exporting
}: {
  table: ReportTableOut;
  mode: "cards" | "table";
  onCsv?: () => void;
  onPdf?: () => void;
  exporting?: "csv" | "pdf" | null;
}) {
  const theme = useTheme();
  const [shown, setShown] = useState(PAGE);
  const columns = visibleColumns(table.columns, mode === "cards");
  const layout = cardLayout(columns);
  const rows = table.rows.slice(0, shown);
  const more = table.rows.length - rows.length;

  return (
    <Card padded={false} style={{ overflow: "hidden" }}>
      {table.title || table.description ? (
        <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[4], paddingBottom: theme.space[2], gap: 2 }}>
          {table.title ? (
            <Text variant="title" accessibilityRole="header">
              {table.title}
            </Text>
          ) : null}
          {table.description ? (
            <Text variant="small" color="textMuted">
              {table.description}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Row justify="space-between" style={{ paddingHorizontal: theme.space[4], paddingTop: table.title ? 0 : 12, paddingBottom: 6 }}>
        <Text variant="caption" color="textMuted">
          {table.rows.length ? `${formatNumber(table.rows.length)} row${table.rows.length === 1 ? "" : "s"}` : ""}
        </Text>
      </Row>
      {table.truncated ? (
        <Row gap={2} style={{ marginHorizontal: theme.space[4], marginBottom: 8, padding: 10, borderRadius: theme.radius.control, backgroundColor: theme.colors.warningSoft }}>
          <Icon name="alert-circle" size={18} color="warning" />
          <Text variant="small" color="text" style={{ flex: 1 }}>
            Only the first {formatNumber(table.rows.length)} rows are included. Pick shorter dates to see everything.
          </Text>
        </Row>
      ) : null}
      {!table.rows.length ? (
        <EmptyState icon="file-tray-outline" title="Nothing to show" body={table.emptyText ?? "No rows for these filters."} compact />
      ) : mode === "table" ? (
        <GridTable table={table} rows={rows} />
      ) : (
        <View>
          {rows.map((r, i) => (
            <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: theme.colors.border }}>
              <RowCard row={r} columns={columns} layout={layout} />
            </View>
          ))}
          <TotalsCard table={table} columns={columns} />
        </View>
      )}
      {more > 0 ? (
        <View style={{ padding: theme.space[3] }}>
          <Button label={`Show ${Math.min(PAGE, more)} more · ${formatNumber(more)} left`} variant="soft" icon="chevron-down" onPress={() => setShown(shown + PAGE)} fullWidth />
        </View>
      ) : null}
      {(onCsv || onPdf) && table.rows.length ? (
        <Row gap={2} wrap style={{ paddingHorizontal: theme.space[3], paddingBottom: theme.space[3], paddingTop: more > 0 ? 0 : theme.space[3], borderTopWidth: more > 0 ? 0 : 1, borderColor: theme.colors.border }}>
          {onCsv ? <Button label="Share CSV" icon="download-outline" variant="secondary" size="sm" onPress={onCsv} loading={exporting === "csv"} disabled={!!exporting} style={{ flex: 1 }} /> : null}
          {onPdf ? <Button label="Export PDF" icon="document-outline" variant="secondary" size="sm" onPress={onPdf} loading={exporting === "pdf"} disabled={!!exporting} style={{ flex: 1 }} /> : null}
        </Row>
      ) : null}
    </Card>
  );
}
