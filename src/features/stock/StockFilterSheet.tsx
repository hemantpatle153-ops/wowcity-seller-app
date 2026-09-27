import { useState } from "react";
import { View } from "react-native";
import type { StockListResponse } from "@/api/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Chip, Icon, PressableScale, SectionTitle, Sheet, Stack, Text } from "@/ui";
import { clearFacets, facetCount, facetDefs, sortOptions, type FacetKey, type StockFilters } from "./stockLogic";

const COLLAPSED = 12;

function FacetSection({ label, values, selected, onPick }: { label: string; values: string[]; selected: string | null; onPick: (value: string | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!values.length) return null;
  const base = expanded ? values : values.slice(0, COLLAPSED);
  // Keep the selected value visible even when collapsed.
  const shown = selected && !base.includes(selected) ? [...base, selected] : base;
  return (
    <Stack gap={1}>
      <SectionTitle title={label} action={values.length > COLLAPSED ? (expanded ? "Show less" : `All ${values.length}`) : undefined} onAction={() => setExpanded(!expanded)} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {shown.map((value) => (
          <Chip key={value} label={value} selected={selected === value} onPress={() => onPick(selected === value ? null : value)} />
        ))}
      </View>
    </Stack>
  );
}

/** Sort + facet filters. Changes apply live; the footer shows how many items match. */
export function StockFilterSheet({
  visible,
  onClose,
  filters,
  onChange,
  facets,
  total,
  loading
}: {
  visible: boolean;
  onClose: () => void;
  filters: StockFilters;
  onChange: (next: StockFilters) => void;
  facets: StockListResponse["facets"] | undefined;
  total: number | undefined;
  loading: boolean;
}) {
  const theme = useTheme();
  const active = facetCount(filters);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Sort & filter"
      subtitle={active ? `${active} active` : "Narrow down your stock"}
      footer={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Clear" variant="secondary" size="lg" icon="close-circle-outline" onPress={() => onChange(clearFacets(filters))} disabled={!active} style={{ flex: 1 }} />
          <Button label={loading || total === undefined ? "Show items" : `Show ${total} item${total === 1 ? "" : "s"}`} size="lg" onPress={onClose} style={{ flex: 1.6 }} />
        </View>
      }
    >
      <Stack gap={1}>
        <SectionTitle title="Sort by" />
        <View style={{ borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
          {sortOptions.map((option, i) => {
            const selected = filters.sort === option.key;
            return (
              <PressableScale
                key={option.key}
                onPress={() => onChange({ ...filters, sort: option.key })}
                scaleTo={0.99}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Sort by ${option.label}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 48,
                  paddingHorizontal: 14,
                  backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                  borderTopWidth: i ? 1 : 0,
                  borderColor: theme.colors.border
                }}
              >
                <Icon name={option.icon} size={18} color={selected ? "accentSoftText" : "textMuted"} />
                <Text variant="body" weight={selected ? "700" : "400"} color={selected ? "accentSoftText" : "text"} style={{ flex: 1 }}>
                  {option.label}
                </Text>
                {selected ? <Icon name="checkmark-circle" size={20} color="accentSoftText" /> : null}
              </PressableScale>
            );
          })}
        </View>
      </Stack>
      {facets ? (
        facetDefs.map((def) => (
          <FacetSection key={def.key} label={def.label} values={facets[def.facet]} selected={filters[def.key]} onPick={(value) => onChange({ ...filters, [def.key as FacetKey]: value })} />
        ))
      ) : (
        <Text variant="small" color="textMuted">
          Filters appear once stock has loaded.
        </Text>
      )}
    </Sheet>
  );
}
