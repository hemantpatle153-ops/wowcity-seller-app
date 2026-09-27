import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api";
import { can } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { formatMoney, formatQty } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Badge, Button, Card, Divider, EmptyState, ErrorState, Header, Row, Screen, SectionTitle, Select, SkeletonList, Stack, Text, toast } from "@/ui";
import { variantText } from "./labelHtml";
import { LabelPreview } from "./LabelPreview";
import { labelKeys } from "./LabelsScreen";
import { printLabelSheet } from "./print";
import { usePrintList } from "./printList";

export function JobDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const canPrint = can(me, "barcode.print");
  const job = useQuery({ queryKey: labelKeys.job(id), queryFn: () => api.labels.job(id) });
  const base = useQuery({ queryKey: labelKeys.search(""), queryFn: () => api.labels.search(""), staleTime: 10 * 60_000, enabled: canPrint });
  const fields = usePrintList((s) => s.fields);
  const chosen = usePrintList((s) => s.template);
  const [busy, setBusy] = useState(false);
  const templates = base.data?.templates ?? [];
  const template = templates.find((t) => t.key === chosen) ?? templates.find((t) => t.key === "a4-3x8") ?? templates[0];
  const items = job.data?.items ?? [];
  const labels = items.reduce((n, i) => n + i.copies, 0);

  const record = useMutation({
    mutationFn: () => api.labels.recordPrint({ template: template!.key, items: items.slice(0, 500).map((i) => ({ barcodeId: i.barcodeId, copies: Math.min(2000, Math.max(1, i.copies)) })) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["labels", "jobs"] }),
    onError: (e) => toast.error(`Printed, but not saved to history: ${errorMessage(e)}`)
  });

  const reprint = async () => {
    if (!template || !items.length) return;
    setBusy(true);
    try {
      await printLabelSheet(template, items.map((i) => ({ item: i, copies: i.copies })), fields, me?.shopName ?? "");
      haptic.success();
      record.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const edit = () => {
    usePrintList.getState().load(items.map(({ copies, ...item }) => ({ item, copies })), id);
    router.push(`/labels?job=${id}`);
  };

  return (
    <Screen
      header={<Header back title="Print job" subtitle={job.data ? `${labels} labels · ${items.length} item${items.length === 1 ? "" : "s"}` : undefined} />}
      onRefresh={() => job.refetch()}
      refreshing={job.isRefetching}
      footerSpace={canPrint && items.length ? 90 : 0}
      footer={
        canPrint && items.length ? (
          <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12), flexDirection: "row", gap: 10, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
            <Button label="Edit list" icon="create-outline" variant="secondary" size="lg" onPress={edit} style={{ flex: 1 }} />
            <Button label="Reprint" icon="print-outline" size="lg" onPress={reprint} loading={busy} disabled={!template} style={{ flex: 1.4 }} />
          </View>
        ) : undefined
      }
    >
      {job.isLoading ? (
        <SkeletonList rows={5} withAvatar={false} />
      ) : job.isError ? (
        <ErrorState message={errorMessage(job.error)} onRetry={() => job.refetch()} />
      ) : !items.length ? (
        <EmptyState icon="barcode-outline" title="No items in this job" body="The items may have been removed from the catalogue." />
      ) : (
        <>
          {canPrint && templates.length ? (
            <Card style={{ gap: 12 }}>
              <Select
                label="Label sheet"
                value={template?.key ?? ""}
                options={templates.map((t) => ({ value: t.key, label: t.name, hint: t.description }))}
                onChange={(key) => usePrintList.getState().set({ template: key })}
              />
              {template ? <LabelPreview template={template} item={items[0]} fields={fields} shop={me?.shopName ?? ""} /> : null}
            </Card>
          ) : null}
          <Stack gap={2}>
            <SectionTitle title="Items" />
            <Card padded={false}>
              {items.map((item, index) => (
                <View key={`${item.barcodeId}-${index}`}>
                  {index ? <Divider inset={16} /> : null}
                  <Row gap={3} style={{ padding: 14 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" weight="600" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="small" color="textMuted" numberOfLines={1}>
                        {[variantText(item, true), item.barcode].filter(Boolean).join(" · ")}
                      </Text>
                      <Text variant="caption" color="textFaint">
                        {formatMoney(item.price)} · {formatQty(item.stock)} in stock
                      </Text>
                    </View>
                    <Badge label={`× ${item.copies}`} tone="accent" showIcon={false} />
                  </Row>
                </View>
              ))}
            </Card>
          </Stack>
        </>
      )}
    </Screen>
  );
}
