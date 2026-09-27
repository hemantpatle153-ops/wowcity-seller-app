import { View } from "react-native";
import { errorMessage } from "@/api";
import type { DashboardResponse } from "@/api/types";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedNumber, Button, Card, Icon, Row, Skeleton, Stack, Text } from "@/ui";
import { percentages, Sparkline } from "@/ui/charts";
import { shortDay } from "@/features/reports/format";
import { paymentModeLabel, useDashboard } from "./useDashboard";

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 84, gap: 2 }}>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="bodyStrong" tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Thin stacked bar of the payment mix with a text legend (never colour alone). */
export function MixBar({ mix }: { mix: DashboardResponse["paymentMix"] }) {
  const theme = useTheme();
  const items = mix.filter((m) => m.amount > 0);
  const pcts = percentages(items.map((m) => m.amount));
  if (!items.length) return null;
  return (
    <Stack gap={2}>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: theme.colors.surfaceSunken, gap: 2 }}>
        {items.map((m, i) => (
          <View key={m.mode} style={{ flex: Math.max(0.02, m.amount), backgroundColor: theme.colors.chart[i % theme.colors.chart.length] }} />
        ))}
      </View>
      <Row gap={3} wrap>
        {items.map((m, i) => (
          <Row key={m.mode} gap={1}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.colors.chart[i % theme.colors.chart.length] }} />
            <Text variant="caption" color="textMuted" tabular>
              {paymentModeLabel(m.mode)} {pcts[i]}%
            </Text>
          </Row>
        ))}
      </Row>
    </Stack>
  );
}

/**
 * "My day": today's own sales, a 7-day sparkline and the payment mix. Self-contained (fetches
 * /dashboard), so it can sit on the Bills tab for staff or anywhere else.
 */
export function MyDayCard({ title = "My day" }: { title?: string }) {
  const query = useDashboard();
  const data = query.data;

  if (!data) {
    if (query.isError)
      return (
        <Card style={{ gap: 8 }}>
          <Row gap={2}>
            <Icon name="cloud-offline-outline" color="danger" size={20} />
            <Text variant="small" color="textMuted" style={{ flex: 1 }}>
              {errorMessage(query.error)}
            </Text>
          </Row>
          <Button label="Try again" variant="soft" size="sm" onPress={() => query.refetch()} />
        </Card>
      );
    return (
      <Card style={{ gap: 12 }}>
        <Skeleton width={90} height={14} />
        <Skeleton width={160} height={32} />
        <Row gap={3}>
          <Skeleton width={70} height={28} />
          <Skeleton width={70} height={28} />
          <Skeleton width={70} height={28} />
        </Row>
      </Card>
    );
  }

  const trend = data.trend.slice(-7);
  const today = data.today;
  return (
    <Card style={{ gap: 12 }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <Text variant="small" weight="700" color="textMuted" uppercase accessibilityRole="header">
            {title}
          </Text>
          <Text variant="caption" color="textFaint">
            {formatDate(`${data.todayDate}T12:00:00`)}
          </Text>
        </View>
        <View style={{ width: 110 }}>
          <Sparkline
            values={trend.map((p) => p.amount)}
            height={34}
            accessibilityLabel={`Last 7 days: ${trend.map((p) => `${shortDay(p.date)} ${formatMoney(p.amount, { decimals: 0 })}`).join(", ")}`}
          />
        </View>
      </Row>
      <View>
        <Text variant="small" color="textMuted">
          {data.kind === "staff" ? "Your sales today" : "Sales today"}
        </Text>
        <AnimatedNumber value={today.amount} variant="display" />
      </View>
      <Row gap={3} wrap>
        <MiniStat label="Bills" value={formatNumber(today.bills)} />
        <MiniStat label="Items" value={formatNumber(today.quantity)} />
        <MiniStat label="Avg bill" value={formatMoney(today.averageBill, { decimals: 0 })} />
      </Row>
      {today.creditDue > 0 ? (
        <Row gap={1}>
          <Icon name="time-outline" size={16} color="warning" />
          <Text variant="small" color="warning" weight="600">
            {formatMoney(today.creditDue)} given on credit today
          </Text>
        </Row>
      ) : null}
      <MixBar mix={data.paymentMix} />
    </Card>
  );
}
