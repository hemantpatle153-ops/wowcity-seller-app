import { useState } from "react";
import { formatDate, isoDay } from "@/lib/format";
import { Button, Chip, Input, Row, Sheet, Text } from "@/ui";
import { addDays, customRangeError } from "./ranges";

/** Custom from/to dates (YYYY-MM-DD) with a few quick picks. Mount with a fresh key when opened. */
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
  const today = isoDay();
  const [from, setFrom] = useState(initialFrom ?? addDays(today, -29));
  const [to, setTo] = useState(initialTo ?? today);
  const [error, setError] = useState<string | null>(null);
  const quick: { label: string; days: number }[] = [
    { label: "Last 14 days", days: 14 },
    { label: "Last 60 days", days: 60 },
    { label: "Last 90 days", days: 90 }
  ];
  const apply = () => {
    const problem = customRangeError(from, to, today);
    setError(problem);
    if (!problem) onApply(from, to);
  };
  const pretty = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? formatDate(`${d}T12:00:00`) : "");
  return (
    <Sheet visible={visible} onClose={onClose} title="Custom dates" subtitle="Type dates as YYYY-MM-DD" footer={<Button label="Show report" size="lg" onPress={apply} fullWidth icon="checkmark" />}>
      <Row gap={2} wrap>
        {quick.map((q) => (
          <Chip
            key={q.label}
            label={q.label}
            selected={to === today && from === addDays(today, -(q.days - 1))}
            onPress={() => {
              setFrom(addDays(today, -(q.days - 1)));
              setTo(today);
              setError(null);
            }}
          />
        ))}
      </Row>
      <Input
        label="From"
        value={from}
        onChangeText={(t) => {
          setFrom(t.replace(/[^0-9-]/g, "").slice(0, 10));
          setError(null);
        }}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        hint={pretty(from)}
        icon="calendar-outline"
      />
      <Input
        label="To"
        value={to}
        onChangeText={(t) => {
          setTo(t.replace(/[^0-9-]/g, "").slice(0, 10));
          setError(null);
        }}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        hint={pretty(to)}
        icon="calendar-outline"
      />
      {error ? (
        <Text variant="small" color="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
