import { View } from "react-native";
import { usePreferences } from "@/state/preferences";
import { buildTheme, useTheme } from "@/theme/ThemeProvider";
import { accentNames, appearanceModes, resolveColors, textSizes, type AppearanceMode, type ResolvedMode } from "@/theme/tokens";
import { Card, Header, Icon, PressableScale, Row, Screen, SectionTitle, Segmented, Text, ToggleRow } from "@/ui";

/** A tiny phone mock drawn in a mode's own colours. */
function ModePreview({ mode, selected, label, hint, onPress }: { mode: AppearanceMode; selected: boolean; label: string; hint: string; onPress: () => void }) {
  const theme = useTheme();
  const accent = usePreferences((s) => s.accent);
  const resolved: ResolvedMode[] = mode === "system" ? ["light", "dark"] : [mode];
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${label}. ${hint}`} style={{ width: 112, gap: 8, alignItems: "center" }}>
      <View
        style={{
          width: 104,
          height: 150,
          borderRadius: 18,
          overflow: "hidden",
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          flexDirection: "row"
        }}
      >
        {resolved.map((m) => {
          const c = resolveColors(m, accent);
          return (
            <View key={m} style={{ flex: 1, backgroundColor: c.bg, padding: 8, gap: 6 }}>
              <View style={{ height: 8, width: "60%", borderRadius: 4, backgroundColor: c.text, opacity: 0.85 }} />
              <View style={{ height: 34, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 5, gap: 4 }}>
                <View style={{ height: 5, width: "70%", borderRadius: 3, backgroundColor: c.textMuted }} />
                <View style={{ height: 5, width: "40%", borderRadius: 3, backgroundColor: c.textFaint }} />
              </View>
              <View style={{ height: 34, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} />
              <View style={{ flex: 1 }} />
              <View style={{ height: 16, borderRadius: 6, backgroundColor: c.accent }} />
            </View>
          );
        })}
        {selected ? (
          <View style={{ position: "absolute", top: 6, right: 6, backgroundColor: theme.colors.accent, borderRadius: 12, width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
            <Icon name="checkmark" size={14} color="accentText" />
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "center" }}>
        <Text variant="small" weight={selected ? "800" : "600"} align="center" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" color="textMuted" align="center" numberOfLines={2}>
          {hint}
        </Text>
      </View>
    </PressableScale>
  );
}

export default function AppearanceSettings() {
  const theme = useTheme();
  const prefs = usePreferences();
  return (
    <Screen header={<Header back title="Appearance" />}>
      <SectionTitle title="Mode" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }} accessibilityRole="radiogroup">
        {appearanceModes.map((m) => (
          <ModePreview key={m.key} mode={m.key} label={m.label} hint={m.hint} selected={prefs.appearance === m.key} onPress={() => prefs.set({ appearance: m.key })} />
        ))}
      </View>

      <SectionTitle title="Accent colour" />
      <Card>
        <Row gap={3} justify="space-between" wrap>
          {accentNames.map((a) => {
            const color = buildTheme(theme.mode, a.key, 1, false, false).colors.accent;
            const selected = prefs.accent === a.key;
            return (
              <PressableScale
                key={a.key}
                onPress={() => prefs.set({ accent: a.key })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={a.label}
                scaleTo={0.88}
                style={{ alignItems: "center", gap: 6, width: 60 }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: color,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: selected ? 3 : 0,
                    borderColor: theme.colors.text
                  }}
                >
                  {selected ? <Icon name="checkmark" size={22} color="accentText" /> : null}
                </View>
                <Text variant="caption" weight={selected ? "700" : "500"} align="center" numberOfLines={2}>
                  {a.label}
                </Text>
              </PressableScale>
            );
          })}
        </Row>
      </Card>

      <SectionTitle title="Text size" />
      <Card style={{ gap: 14 }}>
        <Segmented
          options={textSizes.map((t) => ({ key: t.key, label: t.key === "xlarge" ? "XL" : t.label }))}
          value={prefs.textSize}
          onChange={(k) => prefs.set({ textSize: k })}
          accessibilityLabel="Text size"
        />
        <View style={{ gap: 4 }}>
          <Text variant="title">Cotton Kurta · M · Blue</Text>
          <Text variant="body" color="textMuted">
            Qty 2 × ₹1,199 · GST 5%
          </Text>
          <Text variant="heading" tabular>
            ₹2,398
          </Text>
        </View>
      </Card>

      <SectionTitle title="Comfort" />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <ToggleRow
          label="Reduce motion"
          hint="Fewer animations. Also follows your phone's setting."
          icon="walk-outline"
          value={prefs.reduceMotion === "on"}
          onChange={(v) => prefs.set({ reduceMotion: v ? "on" : "system" })}
        />
        <ToggleRow label="Haptics" hint="A gentle buzz on taps, scans and saved bills." icon="phone-portrait-outline" value={prefs.haptics} onChange={(v) => prefs.set({ haptics: v })} />
        <ToggleRow label="Scan beep" hint="Play a short beep when a barcode is read." icon="volume-medium-outline" value={prefs.scanSound} onChange={(v) => prefs.set({ scanSound: v })} />
      </Card>
    </Screen>
  );
}
