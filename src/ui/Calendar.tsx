import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { MONTHS, WEEKDAYS, inRange, isIsoDay, monthGrid, monthKey, parseIso, prettyDay, shiftMonth, spokenDay } from "@/lib/dates";
import { isoDay } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import { PressableScale } from "./Pressable";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

export type CalendarProps = {
  /** Selected day, or the start of a range. */
  value: string | null;
  /** End of a range (range mode). */
  rangeEnd?: string | null;
  onSelect: (day: string) => void;
  min?: string;
  max?: string;
};

/** Month calendar: 44 dp day cells, today ring, selection and range fill, month paging. */
export function Calendar({ value, rangeEnd, onSelect, min, max }: CalendarProps) {
  const theme = useTheme();
  const today = isoDay();
  const start = parseIso(isIsoDay(value) ? value : isIsoDay(max) && max < today ? max : today);
  const [cursor, setCursor] = useState({ year: start.year, month: start.month });
  const cells = monthGrid(cursor.year, cursor.month);
  const current = monthKey(cursor.year, cursor.month);
  const canPrev = !min || current > min.slice(0, 7);
  const canNext = !max || current < max.slice(0, 7);
  const end = rangeEnd ?? null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton icon="chevron-back" label="Previous month" disabled={!canPrev} onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))} />
        <Text variant="title" align="center" style={{ flex: 1 }} accessibilityRole="header" accessibilityLiveRegion="polite">
          {MONTHS[cursor.month]} {cursor.year}
        </Text>
        <IconButton icon="chevron-forward" label="Next month" disabled={!canNext} onPress={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))} />
      </View>
      <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} variant="caption" color="textMuted" align="center" style={{ flex: 1 }}>
            {d}
          </Text>
        ))}
      </View>
      <Animated.View key={current} entering={theme.reduceMotion ? undefined : FadeIn.duration(150)} style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((day, i) => {
          if (!day) return <View key={`pad-${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const disabled = (!!min && day < min) || (!!max && day > max);
          const isStart = day === value;
          const isEnd = !!end && day === end;
          const selected = isStart || isEnd;
          const within = inRange(day, value, end);
          const isToday = day === today;
          return (
            <View key={day} style={{ width: `${100 / 7}%`, height: 46, justifyContent: "center" }}>
              {within && value !== end ? (
                <View style={{ position: "absolute", top: 3, bottom: 3, left: isStart ? "50%" : 0, right: isEnd ? "50%" : 0, backgroundColor: theme.colors.accentSoft }} />
              ) : null}
              <PressableScale
                onPress={() => {
                  haptic.select();
                  onSelect(day);
                }}
                disabled={disabled}
                scaleTo={0.9}
                accessibilityRole="button"
                accessibilityLabel={`${spokenDay(day)}${isToday ? ", today" : ""}${selected ? ", selected" : ""}`}
                accessibilityState={{ selected, disabled }}
                style={{
                  alignSelf: "center",
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? theme.colors.accent : "transparent",
                  borderWidth: isToday && !selected ? 1.5 : 0,
                  borderColor: theme.colors.accent
                }}
              >
                <Text
                  variant="body"
                  weight={selected || isToday ? "700" : "400"}
                  color={selected ? "accentText" : disabled ? "textFaint" : within ? "accentSoftText" : "text"}
                  tabular
                  maxFontSizeMultiplier={1.2}
                >
                  {Number(day.slice(8))}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

/** Form field showing a date that opens a calendar sheet. Values are YYYY-MM-DD. */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  error,
  hint,
  placeholder = "Choose a date"
}: {
  label?: string;
  value: string | null;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  error?: string | null;
  hint?: string;
  placeholder?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(value);
  const shown = isIsoDay(value) ? prettyDay(value) : placeholder;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="small" weight="600" color="textMuted">
          {label}
        </Text>
      ) : null}
      <PressableScale
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        scaleTo={0.99}
        accessibilityLabel={`${label ?? "Date"}: ${isIsoDay(value) ? spokenDay(value) : placeholder}`}
        accessibilityHint="Opens a calendar"
        style={{
          minHeight: 48,
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
        <Icon name="calendar-outline" size={20} color="textMuted" />
        <Text variant="body" color={isIsoDay(value) ? "text" : "textFaint"} style={{ flex: 1 }} numberOfLines={1}>
          {shown}
        </Text>
        <Icon name="chevron-down" size={18} color="textMuted" />
      </PressableScale>
      {error ? (
        <Text variant="small" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="textMuted">
          {hint}
        </Text>
      ) : null}
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label ?? "Choose a date"}
        footer={
          <Button
            label={draft ? `Use ${prettyDay(draft)}` : "Pick a day"}
            size="lg"
            disabled={!draft}
            fullWidth
            onPress={() => {
              if (draft) onChange(draft);
              setOpen(false);
            }}
          />
        }
      >
        <Calendar value={draft} onSelect={setDraft} min={min} max={max} />
      </Sheet>
    </View>
  );
}
