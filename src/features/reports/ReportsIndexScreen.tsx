import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { ReportGroup } from "@/api/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, EmptyState, ErrorState, Header, IconCircle, ListRow, Row, Screen, SearchBar, SkeletonList, Stack, Text, type IconName, type Tone } from "@/ui";

export const groupStyle: Record<ReportGroup, { icon: IconName; tone: Tone }> = {
  Sales: { icon: "trending-up-outline", tone: "accent" },
  Purchase: { icon: "cube-outline", tone: "info" },
  Stock: { icon: "layers-outline", tone: "success" },
  GST: { icon: "document-text-outline", tone: "warning" },
  Profit: { icon: "cash-outline", tone: "success" },
  "Dues & customers": { icon: "wallet-outline", tone: "warning" },
  Staff: { icon: "people-outline", tone: "info" }
};

export function useReportsIndex() {
  return useQuery({ queryKey: ["reports", "index"], queryFn: () => api.reports.index(), staleTime: 10 * 60_000 });
}

/** All reports the person can open, grouped (Sales, Purchase, Stock, GST, Profit, Dues, Staff). */
export function ReportsIndexScreen() {
  const theme = useTheme();
  const query = useReportsIndex();
  const [q, setQ] = useState("");
  const [pulling, setPulling] = useState(false);
  const term = q.trim().toLowerCase();
  const groups = (query.data?.groups ?? [])
    .map((g) => ({ ...g, reports: term ? g.reports.filter((r) => `${r.title} ${r.description} ${g.group}`.toLowerCase().includes(term)) : g.reports }))
    .filter((g) => g.reports.length);

  return (
    <Screen
      header={<Header back title="Reports" subtitle="Sales, stock, GST, profit and dues" />}
      onRefresh={() => {
        setPulling(true);
        query.refetch().finally(() => setPulling(false));
      }}
      refreshing={pulling}
    >
      {query.data && !query.data.groups.length ? (
        <EmptyState icon="lock-closed-outline" tone="warning" title="No reports for you yet" body="Ask the shop owner to give you access to reports." />
      ) : query.data ? (
        <>
          <SearchBar value={q} onChangeText={setQ} placeholder="Find a report" />
          {groups.length ? (
            groups.map((g, gi) => {
              const style = groupStyle[g.group] ?? { icon: "stats-chart-outline", tone: "accent" };
              return (
                <Animated.View key={g.group} entering={theme.reduceMotion ? undefined : FadeInDown.duration(300).delay(Math.min(gi, 6) * 50)}>
                  <Stack gap={2}>
                    <Row gap={2}>
                      <IconCircle icon={style.icon} tone={style.tone} size={30} />
                      <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                        {g.group}
                      </Text>
                      <Text variant="caption" color="textFaint">
                        {g.reports.length}
                      </Text>
                    </Row>
                    <Card padded={false} style={{ paddingVertical: 4 }}>
                      {g.reports.map((r, i) => (
                        <View key={r.slug}>
                          {i > 0 ? <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: theme.space[4] }} /> : null}
                          <ListRow
                            title={r.title}
                            subtitle={r.description}
                            meta={r.dated ? undefined : "Right now"}
                            chevron
                            onPress={() => router.push({ pathname: "/reports/[slug]", params: { slug: r.slug } })}
                            accessibilityLabel={`${r.title}. ${r.description}`}
                          />
                        </View>
                      ))}
                    </Card>
                  </Stack>
                </Animated.View>
              );
            })
          ) : (
            <EmptyState icon="search-outline" title="No report found" body={`Nothing matches “${q.trim()}”.`} action="Clear search" onAction={() => setQ("")} compact />
          )}
        </>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <SkeletonList rows={9} />
      )}
    </Screen>
  );
}
