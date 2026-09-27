import { Header, Screen, EmptyState } from "@/ui";

export default function Tab() {
  return (
    <Screen header={<Header title="purchase" large />}>
      <EmptyState icon="construct-outline" title="Coming soon" />
    </Screen>
  );
}
