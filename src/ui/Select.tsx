import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { ListRow } from "./Display";
import { Icon, type IconName } from "./Icon";
import { SearchBar } from "./Input";
import { PressableScale } from "./Pressable";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

export type SelectOption<V extends string> = { value: V; label: string; hint?: string; icon?: IconName };

/** A form field that opens a searchable bottom-sheet list. */
export function Select<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
  searchable,
  error,
  disabled,
  sheetTitle,
  allowCustom
}: {
  label?: string;
  value: V | "" | null;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  searchable?: boolean;
  error?: string | null;
  disabled?: boolean;
  sheetTitle?: string;
  allowCustom?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="small" weight="600" color="textMuted">
          {label}
        </Text>
      ) : null}
      <PressableScale
        onPress={() => setOpen(true)}
        disabled={disabled}
        scaleTo={0.99}
        accessibilityLabel={`${label ?? sheetTitle ?? "Choose"}: ${selected?.label ?? (value || placeholder)}`}
        accessibilityHint="Opens a list"
        style={{
          minHeight: TOUCH,
          borderRadius: theme.radius.control,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.borderStrong,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8
        }}
      >
        {selected?.icon ? <Icon name={selected.icon} size={20} color="textMuted" /> : null}
        <Text variant="body" color={selected || value ? "text" : "textFaint"} style={{ flex: 1 }} numberOfLines={1}>
          {selected?.label ?? (value || placeholder)}
        </Text>
        <Icon name="chevron-down" size={18} color="textMuted" />
      </PressableScale>
      {error ? (
        <Text variant="small" color="danger">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={sheetTitle ?? label ?? "Choose"}>
        {searchable || options.length > 12 || allowCustom ? <SearchBar value={q} onChangeText={setQ} placeholder="Search" /> : null}
        {allowCustom && q.trim() && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) ? (
          <ListRow
            title={`Use “${q.trim()}”`}
            icon="add"
            onPress={() => {
              onChange(q.trim() as V);
              setOpen(false);
              setQ("");
            }}
          />
        ) : null}
        <View style={{ marginHorizontal: -theme.space[4] }}>
          {filtered.map((option) => (
            <ListRow
              key={option.value}
              title={option.label}
              subtitle={option.hint}
              icon={option.icon}
              right={option.value === value ? <Icon name="checkmark-circle" color="accent" /> : undefined}
              accessibilityLabel={`${option.label}${option.value === value ? ", selected" : ""}`}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
                setQ("");
              }}
            />
          ))}
          {!filtered.length && !allowCustom ? (
            <Text variant="body" color="textMuted" align="center" style={{ padding: 24 }}>
              Nothing matches “{q}”.
            </Text>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
