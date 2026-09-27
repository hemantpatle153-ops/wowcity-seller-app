import { useState } from "react";
import { errorMessage } from "@/api";
import { MOCK_MODE } from "@/api/config";
import { useSession } from "@/auth/session";
import { QueuedBills } from "@/features/bills/QueuedBills";
import { formatNumber, formatRelative } from "@/lib/format";
import { offlineStore } from "@/offline/store";
import { syncNow, useOffline } from "@/offline/useQueue";
import { useConnectivity } from "@/state/connectivity";
import { Badge, Button, Card, confirm, Header, ListRow, Row, Screen, SectionTitle, Stack, StatTile, Text, toast, ToggleRow } from "@/ui";

export default function OfflineSettings() {
  const storeId = useSession((s) => s.storeId);
  const online = useConnectivity((s) => s.online);
  const lastOnlineAt = useConnectivity((s) => s.lastOnlineAt);
  const state = useOffline();
  const [resetting, setResetting] = useState(false);
  const waiting = state.queue.filter((q) => q.status !== "synced").length;
  return (
    <Screen header={<Header back title="Offline & sync" />} onRefresh={() => syncNow(storeId)} refreshing={state.syncing}>
      <Card style={{ gap: 8 }}>
        <Row justify="space-between">
          <Text variant="title">{online ? "Online" : "Offline"}</Text>
          <Badge label={online ? "Connected" : "No internet"} tone={online ? "success" : "warning"} />
        </Row>
        <Text variant="small" color="textMuted">
          Billing keeps working without internet. The item list and customers below live on this phone; bills made offline get their final numbers when they sync.{" "}
          {lastOnlineAt ? `Last reached the server ${formatRelative(lastOnlineAt)}.` : ""}
        </Text>
      </Card>
      {MOCK_MODE ? <DemoOfflineSwitch /> : null}
      <Row gap={3}>
        <StatTile
          label="Items on phone"
          value={formatNumber(state.catalogCount)}
          icon="pricetags-outline"
          hint={state.lastCatalogSync ? `Updated ${formatRelative(state.lastCatalogSync)}` : "Not downloaded yet"}
        />
        <StatTile label="Customers" value={formatNumber(state.customerCount)} icon="people-outline" tone="info" />
      </Row>
      <StatTile
        label="Bills waiting"
        value={String(waiting)}
        icon="time-outline"
        tone={waiting ? "warning" : "success"}
        hint={waiting ? "They send automatically when online" : "Everything is synced"}
      />
      {state.syncError ? (
        <Text variant="small" color="danger">
          Last sync failed: {state.syncError}
        </Text>
      ) : null}
      <Button label="Sync now" icon="sync" size="lg" onPress={() => syncNow(storeId).then(() => toast.success("Up to date"))} loading={state.syncing} disabled={!online} fullWidth />
      <QueuedBills showSynced />
      <SectionTitle title="Troubleshooting" />
      <Card padded={false}>
        <ListRow
          title="Download the catalogue again"
          subtitle="Use if prices or stock look wrong offline"
          icon="refresh-circle-outline"
          onPress={async () => {
            if (!storeId) return;
            setResetting(true);
            try {
              await offlineStore.setMeta(`catalogCursor:${storeId}`, null);
              await offlineStore.setMeta("customersCursor", null);
              await syncNow(storeId);
              toast.success("Catalogue downloaded again");
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setResetting(false);
            }
          }}
          right={resetting ? <Badge label="Working…" tone="info" showIcon={false} /> : undefined}
        />
        <ListRow
          title="Clear offline data"
          subtitle="Removes the item list and customers from this phone. Waiting bills are kept."
          icon="trash-outline"
          destructive
          onPress={async () => {
            if (
              !(await confirm({ title: "Clear offline data?", message: "Waiting bills stay safe. The catalogue downloads again next time you're online.", confirmLabel: "Clear", destructive: true }))
            )
              return;
            const queue = await offlineStore.listQueue();
            await offlineStore.clear();
            for (const bill of queue) await offlineStore.enqueue(bill);
            await useOffline.getState().reload();
            useOffline.setState({ catalogCount: 0, customerCount: 0, lastCatalogSync: null });
            toast.success("Offline data cleared");
          }}
        />
      </Card>
      <Stack gap={1}>
        <Text variant="caption" color="textFaint" align="center">
          Bills are never posted twice: each one carries its own key.
        </Text>
      </Stack>
    </Screen>
  );
}

/** Demo builds only: pretend the network is down to show offline billing and the queue. */
function DemoOfflineSwitch() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mock = require("@/mock/server") as { setMockOffline: (v: boolean) => void; isMockOffline: () => boolean };
  const [on, setOn] = useState(mock.isMockOffline());
  return (
    <Card padded={false} style={{ paddingHorizontal: 16 }}>
      <ToggleRow
        label="Simulate no internet (demo)"
        hint="Bills made now wait on the phone, then sync when you switch this off."
        icon="airplane-outline"
        value={on}
        onChange={(v) => {
          mock.setMockOffline(v);
          setOn(v);
          useConnectivity.getState().setOnline(!v);
        }}
      />
    </Card>
  );
}
