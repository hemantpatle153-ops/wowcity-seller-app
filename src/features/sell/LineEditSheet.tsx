import { useState } from "react";
import { formatMoney, toNumber } from "@/lib/format";
import { Button, Input, Row, Sheet, Stack, Text } from "@/ui";
import { useCart, type CartLine } from "./cart";

/** Change a line's price and discount (needs sale.discount_override). */
export function LineEditSheet({ line, onClose, canDiscount }: { line: CartLine | null; onClose: () => void; canDiscount: boolean }) {
  return (
    <Sheet visible={!!line} onClose={onClose} title={line?.itemName} subtitle={line ? [line.detail, `MRP ${formatMoney(line.mrp)}`].filter(Boolean).join(" · ") : undefined}>
      {line ? <Editor key={line.key} line={line} onClose={onClose} canDiscount={canDiscount} /> : null}
    </Sheet>
  );
}

function Editor({ line, onClose, canDiscount }: { line: CartLine; onClose: () => void; canDiscount: boolean }) {
  const update = useCart((s) => s.updateLine);
  const remove = useCart((s) => s.remove);
  const [rate, setRate] = useState(String(line.rate));
  const [percent, setPercent] = useState(line.discountPercent ? String(line.discountPercent) : "");
  const [flat, setFlat] = useState(line.discountAmount ? String(line.discountAmount) : "");
  const [qty, setQty] = useState(String(line.qty));
  const rateError = toNumber(rate) < 0 ? "Price can't be negative." : line.mrp > 0 && toNumber(rate) > line.mrp ? "Price is above MRP." : null;
  const percentError = toNumber(percent) > 100 ? "Up to 100%." : null;
  const quick = [5, 10, 15, 20];
  return (
    <Stack gap={4}>
      <Input
        label="Quantity"
        value={qty}
        onChangeText={(t) => setQty(t.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        hint={line.maxQty !== undefined ? `Up to ${line.maxQty} can be returned` : undefined}
      />
      {canDiscount ? (
        <>
          <Input label="Selling price (each)" prefix="₹" value={rate} onChangeText={(t) => setRate(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" error={rateError} />
          <Stack gap={2}>
            <Text variant="small" weight="600" color="textMuted">
              Discount
            </Text>
            <Row gap={2} wrap>
              {quick.map((q) => (
                <Button key={q} label={`${q}%`} size="sm" variant={toNumber(percent) === q ? "primary" : "secondary"} onPress={() => setPercent(String(q))} />
              ))}
              <Button label="None" size="sm" variant="ghost" onPress={() => (setPercent(""), setFlat(""))} />
            </Row>
            <Row gap={3}>
              <Input
                label="Percent"
                value={percent}
                onChangeText={(t) => setPercent(t.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                containerStyle={{ flex: 1 }}
                error={percentError}
                right={<Text color="textMuted">%</Text>}
              />
              <Input label="Flat off (line)" prefix="₹" value={flat} onChangeText={(t) => setFlat(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
            </Row>
          </Stack>
        </>
      ) : (
        <Text variant="small" color="textMuted">
          Prices are fixed at catalogue rates. Ask the owner if you need to give a discount.
        </Text>
      )}
      <Button
        label="Save"
        size="lg"
        fullWidth
        disabled={!!rateError || !!percentError || toNumber(qty) <= 0}
        onPress={() => {
          const q = line.maxQty !== undefined ? Math.min(toNumber(qty), line.maxQty) : toNumber(qty);
          update(line.key, canDiscount ? { qty: q, rate: toNumber(rate), discountPercent: toNumber(percent), discountAmount: toNumber(flat) } : { qty: q });
          onClose();
        }}
      />
      <Button
        label="Remove from bill"
        variant="ghost"
        icon="trash-outline"
        onPress={() => {
          remove(line.key);
          onClose();
        }}
      />
    </Stack>
  );
}
