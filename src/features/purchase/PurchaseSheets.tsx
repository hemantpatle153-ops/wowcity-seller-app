import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import type { PurchaseResponse } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconCircle, Input, ListRow, Sheet, Text } from "@/ui";
import type { ItemDraft } from "./draft";

export function ItemMenuSheet({
  item,
  onClose,
  onDuplicate,
  onAnotherSize,
  onRemove
}: {
  item: ItemDraft | null;
  onClose: () => void;
  onDuplicate: (item: ItemDraft) => void;
  onAnotherSize: (item: ItemDraft) => void;
  onRemove: (item: ItemDraft) => void;
}) {
  const theme = useTheme();
  const run = (fn: (item: ItemDraft) => void) => () => {
    if (item) fn(item);
    onClose();
  };
  return (
    <Sheet visible={!!item} onClose={onClose} title={item?.itemName || "New item"} subtitle={[item?.brand, item?.size, item?.colour].filter(Boolean).join(" · ") || undefined}>
      <View style={{ marginHorizontal: -theme.space[4] }}>
        <ListRow title="Same item, another size" subtitle="Copies the details; pick the new size and quantity" icon="resize-outline" onPress={run(onAnotherSize)} />
        <ListRow title="Duplicate" subtitle="Copies everything except barcode and photos" icon="copy-outline" onPress={run(onDuplicate)} />
        <ListRow title="Remove item" icon="trash-outline" destructive onPress={run(onRemove)} />
      </View>
    </Sheet>
  );
}

/** Type or paste a barcode (fallback for the camera, or a scanner gun). */
export function CodeSheet({ visible, onClose, onSubmit, busy }: { visible: boolean; onClose: () => void; onSubmit: (code: string) => void; busy: boolean }) {
  const [code, setCode] = useState("");
  const submit = () => {
    const value = code.trim();
    if (!value) return;
    onSubmit(value);
    setCode("");
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Type a barcode"
      subtitle="Existing barcodes restock; new ones create a product"
      footer={<Button label="Look up" icon="search" size="lg" fullWidth onPress={submit} loading={busy} disabled={!code.trim()} />}
    >
      <Input
        label="Barcode"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\s/g, "").slice(0, 64))}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        icon="barcode-outline"
        returnKeyType="search"
        onSubmitEditing={submit}
        large
      />
    </Sheet>
  );
}

export function NotFoundSheet({ code, onClose, onCreate, onScanAgain }: { code: string | null; onClose: () => void; onCreate: (code: string) => void; onScanAgain: () => void }) {
  return (
    <Sheet
      visible={!!code}
      onClose={onClose}
      footer={
        <>
          <Button label="Create new product with this barcode" icon="add-circle-outline" size="lg" fullWidth onPress={() => code && onCreate(code)} />
          <Button label="Scan again" icon="scan-outline" variant="ghost" fullWidth onPress={onScanAgain} />
        </>
      }
    >
      <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
        <IconCircle icon="barcode-outline" tone="warning" size={64} />
        <Text variant="title" align="center">
          New barcode
        </Text>
        <Text variant="body" color="textMuted" align="center">
          <Text variant="body" weight="700">
            {code}
          </Text>{" "}
          {"isn't in your catalogue yet. Create the product and its labels will keep this barcode."}
        </Text>
      </View>
    </Sheet>
  );
}

export function SuccessSheet({ result, onClose }: { result: (PurchaseResponse & { supplier: string | null; billTotal: number }) | null; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Sheet
      visible={!!result}
      onClose={onClose}
      footer={
        result ? (
          <>
            {result.printJobId ? (
              <Button
                label="Print labels"
                icon="print-outline"
                size="lg"
                fullWidth
                onPress={() => {
                  onClose();
                  router.push(`/labels?job=${result.printJobId}`);
                }}
              />
            ) : null}
            <Button label="New purchase" icon="add" size="lg" variant={result.printJobId ? "secondary" : "primary"} fullWidth onPress={onClose} />
            <Button
              label="View purchase"
              variant="ghost"
              fullWidth
              onPress={() => {
                onClose();
                router.push(`/purchases/${result.purchaseId}`);
              }}
            />
          </>
        ) : undefined
      }
    >
      {result ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
          <Animated.View entering={theme.reduceMotion ? undefined : ZoomIn.springify().damping(12)}>
            <IconCircle icon="checkmark" tone="success" size={80} />
          </Animated.View>
          <Text variant="heading" align="center" accessibilityLiveRegion="polite">
            {result.message}
          </Text>
          <Text variant="hero" tabular accessibilityLabel={`Bill total ${formatMoney(result.billTotal)}`}>
            {formatMoney(result.billTotal, { decimals: "auto" })}
          </Text>
          <Text variant="small" color="textMuted" tabular>
            Purchase value {formatMoney(result.total, { decimals: 2 })} before GST
          </Text>
          <Text variant="body" color="textMuted" align="center">
            {result.itemCount} item{result.itemCount === 1 ? "" : "s"}
            {result.supplier ? ` from ${result.supplier}` : ""}
            {result.printJobId ? " · labels are ready to print" : ""}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
