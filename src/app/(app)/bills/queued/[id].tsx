import { router, useLocalSearchParams } from "expo-router";
import { errorMessage } from "@/api";
import { queueStatus } from "@/features/bills/QueuedBills";
import { formatDateTime } from "@/lib/format";
import { discardQueued, isMine, retryQueued, useOffline } from "@/offline/useQueue";
import { printReceipt, shareReceiptPdf, whatsappReceipt } from "@/printing/print";
import { ReceiptPreview } from "@/printing/ReceiptPreview";
import { useConnectivity } from "@/state/connectivity";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, confirm, EmptyState, Header, Icon, Row, Screen, Stack, Text, toast } from "@/ui";

/** A bill saved on this phone: reprint its provisional receipt, retry or discard it. */
export default function QueuedBillDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const found = useOffline((s) => s.queue.find((q) => q.id === id));
  const entry = found && isMine(found) ? found : undefined;
  const online = useConnectivity((s) => s.online);
  if (!entry)
    return (
      <Screen header={<Header back title="Saved bill" />}>
        <EmptyState icon="checkmark-done" title="Already synced" body="This bill reached the server and is in your bills list." action="Open bills" onAction={() => router.replace("/bills")} />
      </Screen>
    );
  const status = queueStatus(entry);
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error(errorMessage(e)));
  return (
    <Screen header={<Header back title={entry.billNumber ?? entry.reference} subtitle={`Saved ${formatDateTime(entry.createdAt)}`} />}>
      <Badge label={status.label} tone={status.tone} icon={status.icon} />
      {entry.status === "failed" ? (
        <Card style={{ gap: 8, backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerSoft }}>
          <Row gap={2} align="flex-start">
            <Icon name="alert-circle" color="danger" />
            <Stack gap={1} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="danger">
                The server didn&apos;t accept this bill
              </Text>
              <Text variant="small" color="danger">
                {entry.lastError}
              </Text>
            </Stack>
          </Row>
          <Text variant="small" color="textMuted">
            Fix the reason (for example add the customer in Dues) and try again, or discard it and bill again.
          </Text>
        </Card>
      ) : entry.status !== "synced" ? (
        <Text variant="body" color="textMuted">
          {online ? "Sending shortly. It keeps the same key, so it can never be posted twice." : "You're offline. It will be sent with a note that it was billed offline."}
        </Text>
      ) : null}
      {entry.status !== "synced" ? (
        <Row gap={2}>
          <Button
            label="Try again"
            icon="refresh"
            disabled={!online}
            onPress={async () => {
              const outcome = await retryQueued(entry.id);
              if (outcome.synced.length) toast.success(`Synced as ${outcome.synced[0].billNumber}`);
              else if (outcome.failed.length) toast.error(outcome.failed[0].lastError ?? "Still not accepted");
              else toast.info("Still offline. It will retry automatically.");
            }}
            style={{ flex: 1 }}
          />
          {entry.status === "failed" ? (
            <Button
              label="Discard"
              icon="trash-outline"
              variant="secondary"
              onPress={async () => {
                if (
                  await confirm({
                    title: "Discard this bill?",
                    message: "The server rejected this bill, so it was never recorded. Stock and dues won't change. This can't be undone.",
                    confirmLabel: "Discard bill",
                    destructive: true
                  })
                ) {
                  await discardQueued(entry.id);
                  router.back();
                }
              }}
              style={{ flex: 1 }}
            />
          ) : null}
        </Row>
      ) : null}
      {entry.receipt ? (
        <>
          <Row gap={2}>
            <Button label="Print" icon="print-outline" variant="soft" onPress={() => run(() => printReceipt(entry.receipt!))} style={{ flex: 1 }} />
            <Button label="Share" icon="share-outline" variant="soft" onPress={() => run(() => shareReceiptPdf(entry.receipt!, "thermal"))} style={{ flex: 1 }} />
            <Button label="WhatsApp" icon="logo-whatsapp" variant="soft" onPress={() => run(() => whatsappReceipt(entry.receipt!))} style={{ flex: 1 }} />
          </Row>
          <ReceiptPreview receipt={entry.receipt} />
        </>
      ) : null}
    </Screen>
  );
}
