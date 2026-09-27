import * as Application from "expo-application";
import { isOwner } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { MenuSection } from "@/features/more/MenuGrid";
import { useQueueCount } from "@/offline/useQueue";
import { usePreferences } from "@/state/preferences";
import { appearanceModes } from "@/theme/tokens";
import { Header, Screen, Text } from "@/ui";

export default function Settings() {
  const me = useSession((s) => s.me);
  const owner = isOwner(me);
  const prefs = usePreferences();
  const queued = useQueueCount();
  return (
    <Screen header={<Header back title="Settings" />}>
      <MenuSection
        title="Shop"
        items={[
          { label: "Business profile", hint: "Shop name, owner, phone", icon: "storefront-outline", href: "/settings/profile", show: owner },
          { label: "Tax & rounding", hint: "GSTIN, PAN, bill rounding", icon: "document-text-outline", href: "/settings/tax", show: owner },
          { label: "Invoice & payments", hint: "Terms, UPI QR, bank details, print format", icon: "qr-code-outline", href: "/settings/invoice", show: owner },
          { label: "Change password", icon: "key-outline", href: "/settings/password", show: owner }
        ]}
      />
      <MenuSection
        title="This phone"
        items={[
          { label: "Receipt printer", hint: `${prefs.paperWidth} mm · ${prefs.printerName ?? "System print / PDF"}`, icon: "print-outline", href: "/settings/printer" },
          { label: "Appearance", hint: `${appearanceModes.find((m) => m.key === prefs.appearance)?.label} · text ${prefs.textSize}`, icon: "color-palette-outline", href: "/settings/appearance" },
          {
            label: "Offline & sync",
            hint: queued ? `${queued} bill${queued === 1 ? "" : "s"} waiting` : "Catalogue and customers on this phone",
            icon: "cloud-done-outline",
            href: "/settings/offline",
            tone: queued ? "warning" : "accent"
          }
        ]}
      />
      <MenuSection
        title="Account"
        items={[{ label: "Delete account", hint: "Close your shop and delete your login", icon: "trash-outline", href: "/settings/delete-account", show: owner, tone: "danger" }]}
      />
      <Text variant="caption" color="textFaint" align="center">
        WowCity Seller {Application.nativeApplicationVersion ?? "1.0.0"} ({Application.nativeBuildVersion ?? "dev"})
      </Text>
    </Screen>
  );
}
