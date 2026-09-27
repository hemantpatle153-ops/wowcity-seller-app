import type { Href } from "expo-router";
import { router } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, Divider, ListRow, SectionTitle, type IconName, type Tone } from "@/ui";

export type MenuItem = { label: string; hint?: string; icon: IconName; href?: Href; onPress?: () => void; tone?: Tone; show?: boolean; destructive?: boolean; value?: string };

/** Grouped menu list used by More, Profile and Settings. Hidden items (show: false) are skipped. */
export function MenuSection({ title, items }: { title?: string; items: MenuItem[] }) {
  const theme = useTheme();
  const visible = items.filter((item) => item.show !== false);
  if (!visible.length) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      {title ? <SectionTitle title={title} /> : null}
      <Card padded={false} style={{ overflow: "hidden" }}>
        {visible.map((item, i) => (
          <View key={item.label}>
            {i > 0 ? <Divider inset={66} /> : null}
            <ListRow
              title={item.label}
              subtitle={item.hint}
              icon={item.icon}
              iconTone={item.tone}
              destructive={item.destructive}
              value={item.value}
              valueColor="textMuted"
              chevron={!item.destructive}
              onPress={item.onPress ?? (() => item.href && router.push(item.href))}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
