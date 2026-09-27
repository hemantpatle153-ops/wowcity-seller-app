import { useQueryClient } from "@tanstack/react-query";
import { can, isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { MenuSection } from "@/features/more/MenuGrid";
import { offlineStore } from "@/offline/store";
import { useQueueCount } from "@/offline/useQueue";
import { Avatar, Card, confirm, Header, Row, Screen, Stack, Text } from "@/ui";
import { StorePill } from "@/ui/StorePill";

export default function More() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const queued = useQueueCount();
  const qc = useQueryClient();
  const owner = isOwner(me);
  const doSignOut = async () => {
    const ok = await confirm({
      title: "Sign out of this phone?",
      message: queued ? `${queued} bill${queued === 1 ? " is" : "s are"} still waiting to sync. They stay on this phone and send after the next sign-in.` : "You can sign in again any time.",
      confirmLabel: "Sign out",
      destructive: true
    });
    if (!ok) return;
    await signOut();
    qc.clear();
    if (!queued) await offlineStore.clear();
  };
  return (
    <Screen header={<Header title="More" large right={<StorePill />} />}>
      <Card>
        <Row gap={3}>
          <Avatar name={me?.displayName ?? ""} size={52} />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="title" numberOfLines={1}>
              {me?.displayName}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {me?.shopName} · {owner ? "Owner" : "Staff"} · {me?.shopCode}
            </Text>
          </Stack>
        </Row>
      </Card>
      <MenuSection
        title="Sales & money"
        items={[
          { label: "Bills", hint: "Today's bills, returns, reprint", icon: "receipt-outline", href: "/bills", show: can(me, "sale.view", "sale.create") },
          { label: "Dues", hint: "Who owes you, who you owe", icon: "wallet-outline", href: "/dues", show: can(me, "reports.due"), tone: "warning" },
          { label: "Customers", hint: "Profiles, visits and spend", icon: "people-outline", href: "/customers", show: owner },
          { label: "Reports", hint: "Sales, GST, stock, profit", icon: "stats-chart-outline", href: "/reports", tone: "info" }
        ]}
      />
      <MenuSection
        title="Stock & buying"
        items={[
          { label: "Purchases", hint: "Bills from suppliers, returns", icon: "cube-outline", href: "/purchases", show: can(me, "purchase.view", "purchase.create") },
          { label: "Suppliers", icon: "business-outline", href: "/suppliers", show: can(me, "purchase.view", "purchase.create") },
          { label: "Barcode labels", hint: "Print labels, reprint jobs", icon: "barcode-outline", href: "/labels", show: can(me, "barcode.print", "barcode.view") },
          { label: "Online listing", hint: "What buyers see on WowCity", icon: "globe-outline", href: "/products", show: can(me, "product.view"), tone: "success" },
          { label: "Custom columns", icon: "list-outline", href: "/custom-fields", show: owner }
        ]}
      />
      <MenuSection
        title="Shop"
        items={[
          { label: "Staff", hint: "Access, shifts, PINs, lockdown", icon: "id-card-outline", href: "/staff", show: owner },
          { label: "Stores", icon: "storefront-outline", href: "/stores", show: owner },
          { label: "Signed-in phones", icon: "phone-portrait-outline", href: "/devices", show: owner },
          { label: "Settings", hint: "Shop profile, tax, invoice, printer, appearance", icon: "settings-outline", href: "/settings" }
        ]}
      />
      <MenuSection items={[{ label: "Sign out", icon: "log-out-outline", destructive: true, onPress: doSignOut }]} />
    </Screen>
  );
}
