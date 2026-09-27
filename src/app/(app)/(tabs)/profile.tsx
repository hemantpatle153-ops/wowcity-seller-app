import { useQueryClient } from "@tanstack/react-query";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { MenuSection } from "@/features/more/MenuGrid";
import { useQueueCount } from "@/offline/useQueue";
import { Avatar, Badge, Card, confirm, Header, Row, Screen, Stack, Text } from "@/ui";
import { StorePill } from "@/ui/StorePill";

const labels: Record<string, string> = {
  "sale.create": "Make bills",
  "sale.view": "See bills",
  "sale.return": "Returns",
  "sale.discount_override": "Give discounts",
  "purchase.create": "Enter purchases",
  "purchase.view": "See purchases",
  "purchase.view_cost": "See cost prices",
  "product.view": "See products",
  "product.edit": "Edit products",
  "product.images.manage": "Product photos",
  "stock.view": "See stock",
  "barcode.view": "See labels",
  "barcode.print": "Print labels",
  "reports.sale": "Sales reports",
  "reports.stock": "Stock reports",
  "reports.due": "Dues"
};

export default function Profile() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const offline = useSession((s) => s.offlineSession);
  const queued = useQueueCount();
  const qc = useQueryClient();
  return (
    <Screen header={<Header title="Profile" large right={<StorePill />} />}>
      <Card style={{ gap: 12 }}>
        <Row gap={3}>
          <Avatar name={me?.displayName ?? ""} size={56} />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="title">{me?.displayName}</Text>
            <Text variant="small" color="textMuted">
              {me?.shopName} · {me?.shopCode}
            </Text>
          </Stack>
          <Badge label={offline ? "Offline" : "Signed in"} tone={offline ? "warning" : "success"} />
        </Row>
        <Text variant="small" color="textMuted" weight="700" uppercase>
          You can
        </Text>
        <Row gap={2} wrap>
          {(me?.permissions ?? []).map((p) => (labels[p] ? <Badge key={p} label={labels[p]} tone="accent" showIcon={false} /> : null))}
        </Row>
      </Card>
      <MenuSection
        items={[
          { label: "Dues", icon: "wallet-outline", href: "/dues", show: can(me, "reports.due") },
          { label: "Reports", icon: "stats-chart-outline", href: "/reports", show: can(me, "reports.sale", "reports.stock", "reports.due") },
          { label: "Barcode labels", icon: "barcode-outline", href: "/labels", show: can(me, "barcode.print") },
          { label: "Settings", hint: "Printer, appearance, offline", icon: "settings-outline", href: "/settings" }
        ]}
      />
      <MenuSection
        items={[
          {
            label: "Sign out",
            icon: "log-out-outline",
            destructive: true,
            onPress: async () => {
              if (
                await confirm({ title: "Sign out?", message: queued ? `${queued} bill(s) will sync after the next sign-in on this phone.` : undefined, confirmLabel: "Sign out", destructive: true })
              ) {
                await signOut();
                qc.clear();
              }
            }
          }
        ]}
      />
    </Screen>
  );
}
