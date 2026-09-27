import { router } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { api, errorMessage } from "@/api";
import type { StaffMember } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, ErrorState, Header, Icon, PressableScale, Row, Screen, SectionTitle, SkeletonCards, Stack, Text, toast, ToggleRow } from "@/ui";
import { Callout, StickyFooter, TimePickerSheet } from "./components";
import { adminKeys, useAdminMutation, useStaffDetail, useUnsavedGuard } from "./hooks";
import { copyMondayToWeekdays, DAY_NAMES, formatClock, isRestricted, sameWeek, shiftsBody, weekErrors, weekFromShifts, type ShiftDay } from "./shifts";

type Target = { day: number; field: "start" | "end" };

function TimeButton({ label, value, onPress, disabled, invalid }: { label: string; value: string; onPress: () => void; disabled?: boolean; invalid?: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${label} ${formatClock(value)}. Change`}
      scaleTo={0.95}
      style={{
        flex: 1,
        minHeight: 48,
        borderRadius: theme.radius.control,
        borderWidth: invalid ? 2 : 1,
        borderColor: invalid ? theme.colors.danger : theme.colors.borderStrong,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 12,
        justifyContent: "center"
      }}
    >
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="bodyStrong" tabular>
        {formatClock(value)}
      </Text>
    </PressableScale>
  );
}

function DayRow({ day, error, onChange, onPick }: { day: ShiftDay; error: string | null; onChange: (day: ShiftDay) => void; onPick: (field: "start" | "end") => void }) {
  const theme = useTheme();
  return (
    <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition.duration(180)} style={{ gap: theme.space[2], paddingVertical: theme.space[3] }}>
      <PressableScale
        onPress={() => {
          haptic.select();
          onChange({ ...day, enabled: !day.enabled });
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: day.enabled }}
        accessibilityLabel={`${DAY_NAMES[day.day]} ${day.enabled ? "working" : "day off"}`}
        scaleTo={0.99}
        style={{ flexDirection: "row", alignItems: "center", minHeight: 48, gap: 12 }}
      >
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {DAY_NAMES[day.day]}
        </Text>
        <Text variant="small" color={day.enabled ? "success" : "textMuted"} weight="600">
          {day.enabled ? "Working" : "Day off"}
        </Text>
        <Switch
          value={day.enabled}
          onValueChange={(enabled) => {
            haptic.select();
            onChange({ ...day, enabled });
          }}
          trackColor={{ true: theme.colors.accent, false: theme.colors.borderStrong }}
          thumbColor={theme.colors.surfaceRaised}
          ios_backgroundColor={theme.colors.borderStrong}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      </PressableScale>
      {day.enabled ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(180)} exiting={theme.reduceMotion ? undefined : FadeOut.duration(120)} style={{ gap: 6 }}>
          <Row gap={2}>
            <TimeButton label="From" value={day.start} onPress={() => onPick("start")} invalid={!!error} />
            <Icon name="arrow-forward" size={18} color="textFaint" />
            <TimeButton label="To" value={day.end} onPress={() => onPick("end")} invalid={!!error} />
          </Row>
          {error ? (
            <Row gap={2}>
              <Icon name="alert-circle" size={16} color="danger" />
              <Text variant="small" color="danger" style={{ flex: 1 }}>
                {error}
              </Text>
            </Row>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function ShiftsForm({ member }: { member: StaffMember }) {
  const theme = useTheme();
  const initialRestricted = isRestricted(member.shifts);
  const initialWeek = weekFromShifts(member.shifts);
  const [restricted, setRestricted] = useState(initialRestricted);
  const [week, setWeek] = useState<ShiftDay[]>(initialWeek);
  const [target, setTarget] = useState<Target>({ day: 1, field: "start" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const dirty = restricted !== initialRestricted || (restricted && !sameWeek(week, initialWeek));
  const guard = useUnsavedGuard(dirty);
  const errors = weekErrors(restricted, week);
  const save = useAdminMutation(() => api.staff.updateShifts(member.id, shiftsBody(restricted, week)), {
    invalidate: [adminKeys.staff],
    onSuccess: () => {
      guard.allowLeave();
      router.back();
    }
  });
  const update = (next: ShiftDay) => setWeek(week.map((d) => (d.day === next.day ? next : d)));
  const openPicker = (day: number, field: "start" | "end") => {
    setTarget({ day, field });
    setPickerKey((k) => k + 1);
    setPickerOpen(true);
  };
  const targetDay = week[target.day];
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <Screen
      header={<Header back title="Working hours" subtitle={member.displayName} />}
      footerSpace={110}
      footer={
        <StickyFooter error={dirty ? errors.form : null} note={!dirty ? "No changes yet" : null}>
          <Button label="Save working hours" size="lg" fullWidth disabled={!dirty || !!errors.form} loading={save.isPending} onPress={() => save.mutate(undefined)} />
        </StickyFooter>
      }
    >
      <Card>
        <ToggleRow
          icon="time-outline"
          label="Only during working hours"
          hint={restricted ? "They can sign in and bill only in the hours below." : "They can sign in any time."}
          value={restricted}
          onChange={setRestricted}
        />
      </Card>
      {restricted ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(220)} style={{ gap: theme.space[3] }}>
          <Stack gap={2}>
            <SectionTitle title="Week" />
            <Button
              label="Copy Monday to all weekdays"
              icon="copy-outline"
              variant="soft"
              size="sm"
              style={{ alignSelf: "flex-start" }}
              onPress={() => {
                setWeek(copyMondayToWeekdays(week));
                toast.info("Monday's hours copied to Tuesday–Saturday");
              }}
            />
            <Card style={{ paddingVertical: 0 }}>
              {order.map((d, i) => (
                <View key={d} style={i > 0 ? { borderTopWidth: 1, borderColor: theme.colors.border } : undefined}>
                  <DayRow day={week[d]} error={errors.days[d]} onChange={update} onPick={(field) => openPicker(d, field)} />
                </View>
              ))}
            </Card>
          </Stack>
          <Callout icon="information-circle-outline" tone="info">
            Times are Indian Standard Time. When a shift ends they’re signed out and can’t sign in until the next one starts.
          </Callout>
        </Animated.View>
      ) : (
        <Callout icon="sunny-outline" tone="neutral">
          Turn this on to stop sign-ins after closing time or on their day off.
        </Callout>
      )}
      <TimePickerSheet
        key={pickerKey}
        visible={pickerOpen}
        title={`${DAY_NAMES[target.day]} · ${target.field === "start" ? "Start" : "End"} time`}
        value={target.field === "start" ? targetDay.start : targetDay.end}
        onClose={() => setPickerOpen(false)}
        onPick={(value) => update({ ...targetDay, [target.field]: value })}
      />
    </Screen>
  );
}

export function StaffShiftsScreen({ id }: { id: string }) {
  const detail = useStaffDetail(id);
  if (detail.data) return <ShiftsForm member={detail.data.member} />;
  return (
    <Screen header={<Header back title="Working hours" />}>
      {detail.isError ? <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} /> : <SkeletonCards count={4} height={96} />}
    </Screen>
  );
}
