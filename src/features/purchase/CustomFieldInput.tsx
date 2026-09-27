import { View } from "react-native";
import type { CustomFieldGridColumn } from "@/api/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Chip, Input, Row, Select, Text, ToggleRow, DateField } from "@/ui";
import { typingDecimal } from "./math";

const splitMulti = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

/** One seller-defined column, rendered by its type. Values are kept as strings in the draft. */
export function CustomFieldInput({ field, value, onChange, error }: { field: CustomFieldGridColumn; value: string; onChange: (value: string) => void; error?: string }) {
  const theme = useTheme();
  const label = `${field.name}${field.is_required_on_purchase ? " *" : ""}`;
  switch (field.field_type) {
    case "select":
    case "dropdown":
      return (
        <Select label={label} value={value} options={field.options_json.map((o) => ({ value: o, label: o }))} onChange={onChange} error={error} placeholder={`Choose ${field.name.toLowerCase()}`} />
      );
    case "multi_select": {
      const selected = splitMulti(value);
      return (
        <View style={{ gap: 6 }}>
          <Text variant="small" weight="600" color="textMuted">
            {label}
          </Text>
          <Row gap={2} wrap>
            {field.options_json.map((option) => {
              const on = selected.includes(option);
              return (
                <Chip
                  key={option}
                  label={option}
                  icon={on ? "checkmark" : undefined}
                  selected={on}
                  onPress={() => onChange((on ? selected.filter((s) => s !== option) : [...selected, option]).join(", "))}
                />
              );
            })}
          </Row>
          {error ? (
            <Text variant="small" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      );
    }
    case "boolean":
      return <ToggleRow label={field.name} value={value === "true"} onChange={(on) => onChange(on ? "true" : "false")} />;
    case "number":
      return <Input label={label} value={value} onChangeText={(t) => onChange(t.replace(/[^0-9-]/g, ""))} keyboardType="number-pad" error={error} />;
    case "decimal":
      return <Input label={label} value={value} onChangeText={(t) => onChange(typingDecimal(t, 4))} keyboardType="decimal-pad" error={error} />;
    case "date":
      return <DateField label={label} value={value || null} onChange={onChange} error={error} placeholder="Not set" />;
    case "color":
      return (
        <Input
          label={label}
          value={value}
          onChangeText={onChange}
          placeholder="e.g. Maroon"
          error={error}
          right={
            value.trim() ? (
              <View
                accessibilityElementsHidden
                // The swatch shows the seller's own colour value; it is data, not a theme colour.
                style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: value.trim().toLowerCase() }}
              />
            ) : undefined
          }
        />
      );
    case "url":
      return <Input label={label} value={value} onChangeText={onChange} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" icon="link-outline" error={error} />;
    default:
      return <Input label={label} value={value} onChangeText={onChange} error={error} maxLength={200} />;
  }
}
