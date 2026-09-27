import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Chip, Input, Select, Text, ToggleRow, DateField } from "@/ui";
import { splitList, type EditableCustomField } from "./editForm";
import { fieldTypeMeta } from "./listingLogic";

/** One custom column in the product form, rendered by its type. Values are strings ("" clears). */
export function CustomFieldInput({ field, value, onChange, error }: { field: EditableCustomField; value: string; onChange: (value: string) => void; error?: string }) {
  const theme = useTheme();
  const label = `${field.name}${field.required ? " *" : ""}`;
  switch (field.type) {
    case "boolean":
      return (
        <View style={{ borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, backgroundColor: theme.colors.surface }}>
          <ToggleRow label={field.name} hint={value === "" ? "Not set" : undefined} value={value === "true"} onChange={(v) => onChange(v ? "true" : "false")} />
        </View>
      );
    case "select":
    case "dropdown": {
      const options = [...(value && !field.options.includes(value) ? [value] : []), ...field.options];
      return (
        <View style={{ gap: 6 }}>
          <Select label={label} value={value} placeholder="Not set" options={options.map((o) => ({ value: o, label: o }))} onChange={onChange} error={error} sheetTitle={field.name} />
          {value ? <Button label={`Clear ${field.name.toLowerCase()}`} variant="ghost" size="sm" icon="close-circle-outline" onPress={() => onChange("")} style={{ alignSelf: "flex-start" }} /> : null}
        </View>
      );
    }
    case "multi_select": {
      const picked = splitList(value);
      const options = [...picked.filter((p) => !field.options.includes(p)), ...field.options];
      const toggle = (option: string) => onChange((picked.includes(option) ? picked.filter((p) => p !== option) : [...picked, option]).join(", "));
      return (
        <View style={{ gap: 6 }}>
          <Text variant="small" weight="600" color="textMuted">
            {label}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {options.map((option) => (
              <Chip key={option} label={option} icon={picked.includes(option) ? "checkmark" : undefined} selected={picked.includes(option)} onPress={() => toggle(option)} />
            ))}
          </View>
          {error ? (
            <Text variant="small" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      );
    }
    case "number":
    case "decimal":
      return (
        <Input
          label={label}
          value={value}
          onChangeText={(t) => onChange(t.replace(field.type === "number" ? /[^0-9-]/g : /[^0-9.-]/g, ""))}
          keyboardType={field.type === "number" ? "number-pad" : "decimal-pad"}
          placeholder="Not set"
          error={error}
        />
      );
    case "date":
      return <DateField label={label} value={value || null} onChange={onChange} error={error} placeholder="Not set" />;
    case "url":
      return <Input label={label} value={value} onChangeText={onChange} placeholder="https://" keyboardType="url" autoCapitalize="none" autoCorrect={false} error={error} icon="link-outline" />;
    case "color":
      return <Input label={label} value={value} onChangeText={onChange} placeholder="e.g. Navy" error={error} icon={fieldTypeMeta("color").icon} />;
    default:
      return <Input label={label} value={value} onChangeText={onChange} placeholder="Not set" error={error} />;
  }
}
