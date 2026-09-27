import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { DashboardBill, OwnerDashboard, StockAlert } from "@/api/types";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { AnimatedNumber, Avatar, Badge, Card, Divider, Icon, IconCircle, ListRow, PressableScale, Row, StatTile, Text, type IconName, type Tone } from "@/ui";
import { AreaChart, Donut, HorizontalBars } from "@/ui/charts";
import { shortDay } from "@/features/reports/format";
import { openPath } from "@/features/reports/navigate";
import { paymentModeLabel } from "./useDashboard";

/** Section wrapper: fades up once when it first mounts (skipped with reduce motion). */
export function Section({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const theme = useTheme();
  return <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.duration(320).delay(Math.min(index, 8) * 50)}>{children}</Animated.View>;
}

function CardHeader({ title, action, onAction, right }: { title: string; action?: string; onAction?: () => void; right?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ marginBottom: 4 }}>
      <Text variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {right}
      {action ? (
        <PressableScale
          onPress={onAction}
          accessibilityLabel={action}
          style={{ minHeight: 44, minWidth: 44, marginVertical: -8, marginRight: -6, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <Text variant="small" weight="700" color="accent">
            {action}
          </Text>
          <Icon name="chevron-forward" size={16} color="accent" />
        </PressableScale>
      ) : null}
    </Row>
  );
}

export function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return <Badge label="No sales yesterday to compare" tone="neutral" showIcon={false} />;
  const up = change >= 0;
  const pct = `${Math.abs(change)
    .toFixed(Math.abs(change) >= 100 ? 0 : 1)
    .replace(/\.0$/, "")}%`;
  return <Badge label={`${up ? "▲" : "▼"} ${pct} ${up ? "more" : "less"} than yesterday`} tone={up ? "success" : "danger"} showIcon={false} />;
}

function HeroStat({ label, value, format }: { label: string; value: number; format: (n: number) => string }) {
  return (
    <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      <AnimatedNumber value={value} variant="title" format={format} />
    </View>
  );
}

export function HeroCard({ data }: { data: OwnerDashboard }) {
  const theme = useTheme();
  const t = data.today;
  return (
    <View
      style={{
        borderRadius: theme.radius.card + 4,
        padding: theme.space[5],
        gap: 14,
        backgroundColor: theme.colors.accentSoft,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <Row justify="space-between" align="flex-start" wrap>
        <Text variant="small" weight="700" color="accentSoftText" uppercase>
          Today&apos;s sale
        </Text>
        <Text variant="caption" color="textMuted">
          {data.storeName}
        </Text>
      </Row>
      <View style={{ gap: 8 }}>
        <AnimatedNumber value={t.amount} variant="hero" />
        <ChangeBadge change={data.change} />
      </View>
      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
      <Row gap={3} wrap align="flex-start">
        <HeroStat label="Bills" value={t.bills} format={(n) => formatNumber(Math.round(n))} />
        <HeroStat label="Items" value={t.quantity} format={(n) => formatNumber(Math.round(n))} />
        <HeroStat label="Avg bill" value={t.averageBill} format={(n) => formatMoney(n, { decimals: 0 })} />
      </Row>
      {t.creditDue > 0 ? (
        <Row gap={1}>
          <Icon name="time-outline" size={16} color="warning" />
          <Text variant="small" color="warning" weight="600">
            {formatMoney(t.creditDue)} on credit today
          </Text>
        </Row>
      ) : null}
    </View>
  );
}

const quickActions: { label: string; icon: IconName; path: string; tone: Tone; perms: string[] }[] = [
  { label: "New bill", icon: "cart-outline", path: "/sell", tone: "accent", perms: ["sale.create"] },
  { label: "Purchase", icon: "cube-outline", path: "/purchase", tone: "info", perms: ["purchase.create"] },
  { label: "Scan stock", icon: "barcode-outline", path: "/stock", tone: "success", perms: ["stock.view"] },
  { label: "Record payment", icon: "wallet-outline", path: "/dues", tone: "warning", perms: ["reports.due"] }
];

/** Big shortcuts in the thumb zone; each one only when the person may use it. */
export function QuickActions() {
  const theme = useTheme();
  const me = useSession((s) => s.me);
  const actions = quickActions.filter((a) => can(me, ...a.perms));
  if (!actions.length) return null;
  return (
    <Row gap={2} align="stretch" wrap>
      {actions.map((a) => (
        <PressableScale
          key={a.label}
          onPress={() => openPath(a.path)}
          hapticOnPress
          accessibilityLabel={a.label}
          scaleTo={0.94}
          style={{
            flex: 1,
            minWidth: 76,
            minHeight: 88,
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 10,
            paddingHorizontal: 4,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <IconCircle icon={a.icon} tone={a.tone} size={40} />
          <Text variant="caption" weight="700" align="center" numberOfLines={2}>
            {a.label}
          </Text>
        </PressableScale>
      ))}
    </Row>
  );
}

export function TrendCard({ trend }: { trend: OwnerDashboard["trend"] }) {
  const total = trend.reduce((s, p) => s + p.amount, 0);
  const bills = trend.reduce((s, p) => s + p.bills, 0);
  return (
    <Card style={{ gap: 4 }}>
      <CardHeader title="Last 14 days" />
      <Text variant="small" color="textMuted" tabular>
        {formatMoney(total, { decimals: 0 })} from {formatNumber(bills)} bills
      </Text>
      <AreaChart
        title="Sales, last 14 days"
        data={trend.map((p) => ({ label: shortDay(p.date), fullLabel: `${shortDay(p.date)} · ${p.bills} bill${p.bills === 1 ? "" : "s"}`, value: p.amount }))}
        height={140}
      />
    </Card>
  );
}

export function PaymentMixCard({ mix }: { mix: OwnerDashboard["paymentMix"] }) {
  const items = mix.filter((m) => m.amount > 0);
  return (
    <Card style={{ gap: 8 }}>
      <CardHeader title="How customers paid" />
      {items.length ? (
        <Donut title="Payment mix today" data={items.map((m) => ({ label: paymentModeLabel(m.mode), value: m.amount }))} centerLabel="Today" />
      ) : (
        <Text variant="small" color="textMuted">
          No payments yet today.
        </Text>
      )}
    </Card>
  );
}

function DueColumn({
  title,
  amount,
  parties,
  top,
  party,
  tone
}: {
  title: string;
  amount: number;
  parties: number;
  top: { id: string; name: string; amount: number }[];
  party: "customer" | "supplier";
  tone: Tone;
}) {
  return (
    <View style={{ flex: 1, minWidth: 260, gap: 6 }}>
      <Text variant="small" color="textMuted">
        {title}
      </Text>
      <AnimatedNumber value={amount} variant="heading" color={amount > 0 ? (tone === "danger" ? "danger" : "warning") : "text"} />
      <Text variant="caption" color="textMuted">
        {parties} {parties === 1 ? (party === "customer" ? "customer" : "supplier") : party === "customer" ? "customers" : "suppliers"}
      </Text>
      <View style={{ gap: 0 }}>
        {top.slice(0, 3).map((p) => (
          <PressableScale
            key={p.id}
            onPress={() => openPath(`/dues/${party}/${p.id}`)}
            accessibilityLabel={`${p.name}, ${formatMoney(p.amount)}. Open statement`}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
          >
            <Avatar name={p.name} size={28} tone={tone} />
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {p.name}
            </Text>
            <Text variant="small" weight="700" tabular>
              {formatMoney(p.amount, { decimals: 0 })}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

export function DuesCard({ dues, showSuppliers }: { dues: OwnerDashboard["dues"]; showSuppliers: boolean }) {
  return (
    <Card style={{ gap: 8 }}>
      <CardHeader title="Dues" action="Open" onAction={() => openPath("/dues")} />
      <Row gap={4} align="flex-start" wrap>
        <DueColumn title="Customers owe you" amount={dues.customers.due} parties={dues.customers.parties} top={dues.customers.top} party="customer" tone="warning" />
        {showSuppliers ? <DueColumn title="You owe suppliers" amount={dues.suppliers.due} parties={dues.suppliers.parties} top={dues.suppliers.top} party="supplier" tone="danger" /> : null}
      </Row>
      {dues.customers.advance > 0 ? (
        <Text variant="caption" color="textMuted">
          Customers also hold {formatMoney(dues.customers.advance, { decimals: 0 })} in advances.
        </Text>
      ) : null}
    </Card>
  );
}

export function StockAlertsCard({ stock, limit = 5 }: { stock: { outOfStock: number; low: number; alerts: StockAlert[] }; limit?: number }) {
  const theme = useTheme();
  const fine = stock.outOfStock === 0 && stock.low === 0;
  return (
    <Card padded={false} style={{ paddingTop: theme.space[4] }}>
      <View style={{ paddingHorizontal: theme.space[4], gap: 8 }}>
        <CardHeader title="Stock alerts" action="Stock" onAction={() => openPath("/stock")} />
        <Row gap={2} wrap>
          <Badge label={`${stock.outOfStock} out of stock`} tone={stock.outOfStock ? "danger" : "neutral"} />
          <Badge label={`${stock.low} running low`} tone={stock.low ? "warning" : "neutral"} icon="trending-down" />
        </Row>
      </View>
      {fine ? (
        <Row gap={2} style={{ padding: theme.space[4] }}>
          <Icon name="checkmark-circle" color="success" size={20} />
          <Text variant="small" color="textMuted">
            Everything is well stocked.
          </Text>
        </Row>
      ) : (
        <View style={{ paddingVertical: 4 }}>
          {stock.alerts.slice(0, limit).map((a) => (
            <ListRow
              key={`${a.variantId}-${a.storeName}`}
              title={a.name}
              subtitle={`${a.detail}${a.storeName ? ` · ${a.storeName}` : ""}`}
              right={<Badge label={a.quantity <= 0 ? "Out" : `${formatNumber(a.quantity)} left`} tone={a.quantity <= 0 ? "danger" : "warning"} showIcon={false} />}
              chevron
              onPress={() => openPath(`/stock/${a.variantId}`)}
              accessibilityLabel={`${a.name}, ${a.detail}, ${a.quantity <= 0 ? "out of stock" : `${a.quantity} left`} at ${a.storeName}`}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

export function TopItemsCard({ items }: { items: OwnerDashboard["topItems"] }) {
  return (
    <Card style={{ gap: 12 }}>
      <CardHeader title="Top items · 7 days" />
      {items.length ? (
        <HorizontalBars
          title="Top items in the last 7 days"
          data={[...items]
            .sort((a, b) => b.amount - a.amount)
            .map((i) => ({ key: i.variantId, label: i.name, detail: `${i.detail} · ${formatNumber(i.quantity)} sold`, value: i.amount, onPress: () => openPath(`/stock/${i.variantId}`) }))}
        />
      ) : (
        <Text variant="small" color="textMuted">
          Nothing sold in the last 7 days.
        </Text>
      )}
    </Card>
  );
}

export function TeamCard({ team }: { team: OwnerDashboard["team"] }) {
  const sellers = team.today.filter((m) => m.amount > 0 || m.bills > 0);
  return (
    <Card style={{ gap: 12 }}>
      <CardHeader title="Team today" right={<Badge label={`${team.active} of ${team.total} active`} tone={team.active ? "success" : "neutral"} icon="people-outline" />} />
      {sellers.length ? (
        <HorizontalBars
          title="Sales by team member today"
          colorIndex={3}
          data={sellers.map((m) => ({ key: m.key, label: m.name, detail: `${m.bills} bill${m.bills === 1 ? "" : "s"} · ${formatNumber(m.quantity)} items`, value: m.amount }))}
        />
      ) : (
        <Text variant="small" color="textMuted">
          No one has billed yet today.
        </Text>
      )}
    </Card>
  );
}

function ProfitCell({ label, value, color, strong }: { label: string; value: string; color?: "success" | "danger" | "text"; strong?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant={strong ? "title" : "bodyStrong"} color={color ?? "text"} tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function ProfitCard({ profit }: { profit: OwnerDashboard["profit"] }) {
  return (
    <Card style={{ gap: 12 }}>
      <CardHeader title="Profit today" action="P&L" onAction={() => openPath("/reports/profit-loss-summary")} />
      <Row gap={3} wrap>
        <ProfitCell label="Revenue (no GST)" value={formatMoney(profit.revenue, { decimals: 0 })} />
        <ProfitCell label="Cost of goods" value={formatMoney(profit.cost, { decimals: 0 })} />
      </Row>
      <Divider />
      <Row gap={3} wrap>
        <ProfitCell label="Gross profit" value={formatMoney(profit.profit, { decimals: 0 })} color={profit.profit < 0 ? "danger" : "success"} strong />
        <ProfitCell label="Margin" value={profit.marginPercent === null ? "—" : `${profit.marginPercent}%`} strong />
      </Row>
      {profit.itemsWithoutCost > 0 ? (
        <Row gap={2} align="flex-start">
          <Icon name="information-circle" size={18} color="info" />
          <Text variant="small" color="textMuted" style={{ flex: 1 }}>
            {profit.itemsWithoutCost} item{profit.itemsWithoutCost === 1 ? " has" : "s have"} no purchase cost yet, so profit may look higher than it is.
          </Text>
        </Row>
      ) : null}
    </Card>
  );
}

export function ReturnsPurchasesRow({ returns, purchases }: { returns: OwnerDashboard["returns"]; purchases: OwnerDashboard["purchases"] }) {
  return (
    <Row gap={3} align="stretch" wrap>
      <StatTile
        label="Returns today"
        icon="return-down-back-outline"
        tone={returns.count ? "danger" : "neutral"}
        value={formatMoney(returns.amount, { decimals: 0 })}
        hint={returns.count ? `${returns.count} return${returns.count === 1 ? "" : "s"}` : "No returns"}
        onPress={() => openPath("/reports/sale-return")}
      />
      <StatTile
        label="Purchases today"
        icon="cube-outline"
        tone="info"
        value={formatMoney(purchases.amount, { decimals: 0 })}
        hint={
          purchases.count
            ? `${purchases.count} bill${purchases.count === 1 ? "" : "s"} · ${formatNumber(purchases.quantity)} pcs${purchases.due > 0 ? ` · ${formatMoney(purchases.due, { decimals: 0 })} unpaid` : ""}`
            : "No purchases"
        }
        onPress={() => openPath("/purchases")}
      />
    </Row>
  );
}

export function ListingsCard({ listings }: { listings: OwnerDashboard["listings"] }) {
  const cells: { label: string; value: number; tone?: "danger" }[] = [
    { label: "Live on WowCity", value: listings.public },
    { label: "In stock", value: listings.inStock },
    { label: "Out of stock", value: listings.outOfStock, tone: listings.outOfStock ? "danger" : undefined },
    { label: "Stores listed", value: listings.discoverableStores }
  ];
  return (
    <Card onPress={() => openPath("/products")} accessibilityLabel={`Online listing: ${cells.map((c) => `${c.label} ${c.value}`).join(", ")}`} style={{ gap: 10 }}>
      <Row gap={3}>
        <IconCircle icon="globe-outline" tone="success" size={36} />
        <View style={{ flex: 1 }}>
          <Text variant="title">Online listing</Text>
          <Text variant="caption" color="textMuted">
            What buyers see on WowCity
          </Text>
        </View>
        <Icon name="chevron-forward" color="textFaint" />
      </Row>
      <Row gap={3} wrap align="flex-start">
        {cells.map((c) => (
          <View key={c.label} style={{ flex: 1, minWidth: 70 }}>
            <Text variant="heading" tabular color={c.tone ?? "text"}>
              {formatNumber(c.value)}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={2}>
              {c.label}
            </Text>
          </View>
        ))}
      </Row>
    </Card>
  );
}

export function BillRow({ bill, soldBy }: { bill: DashboardBill; soldBy?: string }) {
  return (
    <ListRow
      left={<Avatar name={bill.customer} size={38} tone={bill.due > 0 ? "warning" : "accent"} />}
      title={bill.customer}
      subtitle={`${bill.billNumber} · ${formatNumber(bill.quantity)} item${bill.quantity === 1 ? "" : "s"}${soldBy ? ` · ${soldBy}` : ""}`}
      meta={formatRelative(bill.time)}
      right={
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text variant="bodyStrong" tabular>
            {formatMoney(bill.amount)}
          </Text>
          {bill.due > 0 ? <Badge label={`Due ${formatMoney(bill.due, { decimals: 0 })}`} tone="warning" showIcon={false} /> : null}
        </View>
      }
      onPress={() => openPath(`/bills/${bill.id}`)}
      accessibilityLabel={`Bill ${bill.billNumber}, ${bill.customer}, ${formatMoney(bill.amount)}${bill.due > 0 ? `, due ${formatMoney(bill.due)}` : ""}`}
    />
  );
}

export function RecentBillsCard({ bills, title = "Recent bills" }: { bills: (DashboardBill & { soldBy?: string })[]; title?: string }) {
  const theme = useTheme();
  return (
    <Card padded={false} style={{ paddingTop: theme.space[4] }}>
      <View style={{ paddingHorizontal: theme.space[4] }}>
        <CardHeader title={title} action="All bills" onAction={() => openPath("/bills")} />
      </View>
      {bills.length ? (
        <View style={{ paddingBottom: 4 }}>
          {bills.map((b) => (
            <BillRow key={b.id} bill={b} soldBy={b.soldBy} />
          ))}
        </View>
      ) : (
        <Text variant="small" color="textMuted" style={{ padding: theme.space[4], paddingTop: 0 }}>
          No bills yet today. Your first sale shows up here.
        </Text>
      )}
    </Card>
  );
}

export function ActivityCard({ activity }: { activity: OwnerDashboard["activity"] }) {
  const theme = useTheme();
  if (!activity.length) return null;
  return (
    <Card style={{ gap: 4 }}>
      <CardHeader title="Activity" />
      {activity.map((a, i) => (
        <Row key={a.id} gap={3} align="flex-start" style={{ minHeight: 48 }}>
          <View style={{ alignItems: "center", width: 12, alignSelf: "stretch" }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: i === 0 ? theme.colors.accent : theme.colors.borderStrong }} />
            {i < activity.length - 1 ? <View style={{ flex: 1, width: 2, marginTop: 2, backgroundColor: theme.colors.border }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 10 }}>
            <Text variant="small" weight="600">
              {a.action}
              {a.amount !== null ? <Text variant="small" color="textMuted" tabular>{` · ${formatMoney(a.amount)}`}</Text> : null}
            </Text>
            <Text variant="caption" color="textMuted">
              {a.by} · {formatTime(a.at)}
            </Text>
          </View>
        </Row>
      ))}
    </Card>
  );
}
