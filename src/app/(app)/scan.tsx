import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSession } from "@/auth/session";
import { addHitToCart } from "@/features/sell/addToCart";
import { useCart } from "@/features/sell/cart";
import { resolveBarcode } from "@/features/sell/catalog";
import { Scanner } from "@/features/scan/Scanner";
import { useScanResult } from "@/features/scan/scanResult";
import { formatMoney } from "@/lib/format";
import { Button } from "@/ui";

/**
 * Camera scanner route. target=sell adds straight to the cart (continuous);
 * other targets hand the code back to the screen that opened it.
 */
export default function ScanRoute() {
  const { target = "sell" } = useLocalSearchParams<{ target?: string }>();
  const storeId = useSession((s) => s.storeId);
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const total = useCart((s) => s.lines.reduce((n, l) => n + l.qty * l.rate, 0));

  if (target !== "sell") {
    return (
      <Scanner
        title={target === "purchase" ? "Scan to restock" : "Scan an item"}
        continuous={false}
        onClose={() => router.back()}
        onScan={async (code) => {
          useScanResult.getState().deliver(target, code);
          return { ok: true, title: code };
        }}
      />
    );
  }

  return (
    <Scanner
      title="Scan items"
      onClose={() => router.back()}
      onScan={async (code) => {
        if (!storeId) return { ok: false, title: "Choose a store first" };
        const hit = await resolveBarcode(storeId, code).catch(() => null);
        if (!hit) return { ok: false, title: "Not in your catalogue", subtitle: code };
        return addHitToCart(hit);
      }}
      footer={
        <View style={{ flex: 1.3 }}>
          <Button label={count ? `Done · ${count} · ${formatMoney(total)}` : "Done"} icon="checkmark" onPress={() => router.back()} fullWidth />
        </View>
      }
    />
  );
}
