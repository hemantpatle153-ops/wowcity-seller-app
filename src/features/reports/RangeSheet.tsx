import { useState } from "react";
import { View } from "react-native";
import { daysBetween, nextRange, prettyDay } from "@/lib/dates";
import { isoDay } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Calendar, Chip, PressableScale, Row, Sheet, Text } from "@/ui";
import { addDays, customRangeError } from "./ranges";

/** Custom report period: tap the first day, then the last day, on a calendar. Mount with a fresh key when opened. */
export function RangeSheet({
  visible,
  onClose,
  initialFrom,
  initialTo,
  onApply
}: {
  visible: boolean;
  onClose: () => void;
  initialFrom?: string;
  initialTo?: string;
  onApply: (from: string, to: string) => void;
}) {
  const theme = useTheme();
  const today = isoDay();
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: initialFrom ?? addDays(today, -29), to: initialTo ?? today });
  const [error, setError] = useState<string | null>(null);
  const quick: { label: string; days: number }[] = [
    { label: "Last 14 days", days: 14 },
    { label: "Last 60 days", days: 60 },
    { label: "Last 90 days", days: 90 }
  ];
  const apply = () => {
    const from = range.from ?? "";
    const to = range.to ?? range.from ?? "";
    const problem = customRangeError(from, to, today);
    setError(problem);
    if (!problem) onApply(from, to);
  };
  const days = range.from && range.to ? daysBetween(range.from, range.to) + 1 : range.from ? 1 : 0;
  const pill = (label: string, value: string | null, active: boolean, onPress: () => void) => (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${label}: ${value ? prettyDay(value) : "not chosen"}`}
      style={{
        flex: 1,
        minHeight: 56,
        borderRadius: theme.radius.control,
        borderWidth: active ? 2 : 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 12,
        justifyContent: "center"
      }}
    >
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="bodyStrong" color={value ? "text" : "textFaint"}>
        {value ? prettyDay(value) : "Tap a day"}
      </Text>
    </PressableScale>
  );
  const choosingEnd = !!range.from && !range.to;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Custom dates"
      subtitle={choosingEnd ? "Now tap the last day" : "Tap the first day, then the last day"}
      footer={<Button label={days ? `Show ${days} day${days === 1 ? "" : "s"}` : "Show report"} size="lg" onPress={apply} fullWidth icon="checkmark" disabled={!range.from} />}
    >
      <Row gap={2} wrap>
        {quick.map((q) => (
          <Chip
            key={q.label}
            label={q.label}
            selected={range.to === today && range.from === addDays(today, -(q.days - 1))}
            onPress={() => {
              setRange({ from: addDays(today, -(q.days - 1)), to: today });
              setError(null);
            }}
          />
        ))}
      </Row>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {pill("From", range.from, !choosingEnd, () => setRange({ from: null, to: null }))}
        {pill("To", range.to, choosingEnd, () => range.from && setRange({ from: range.from, to: null }))}
      </View>
      <Calendar
        value={range.from}
        rangeEnd={range.to}
        max={today}
        onSelect={(day) => {
          setRange(nextRange(range, day));
          setError(null);
        }}
      />
      {error ? (
        <Text variant="small" color="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
