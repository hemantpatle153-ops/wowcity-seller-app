import { router, useLocalSearchParams } from "expo-router";
import { isParty } from "@/features/dues/logic";
import { StatementScreen } from "@/features/dues/StatementScreen";
import { EmptyState, Header, Screen } from "@/ui";

export default function StatementRoute() {
  const { party, id } = useLocalSearchParams<{ party: string; id: string }>();
  if (!isParty(party) || !id) {
    return (
      <Screen header={<Header back title="Statement" />}>
        <EmptyState icon="help-circle-outline" title="Not found" body="This statement link isn't valid." action="Open dues" onAction={() => router.replace("/dues")} />
      </Screen>
    );
  }
  return <StatementScreen key={`${party}-${id}`} party={party} id={id} />;
}
