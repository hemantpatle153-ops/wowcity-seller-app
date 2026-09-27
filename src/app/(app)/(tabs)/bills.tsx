import { Header, Screen, EmptyState } from "@/ui";

export default function Tab() {
  return (
    <Screen header={<Header title="bills" large />}>
      <EmptyState icon="construct-outline" title="Coming soon" />
    </Screen>
  );
}
