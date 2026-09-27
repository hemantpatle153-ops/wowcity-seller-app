/** Building blocks shared by the owner admin screens. */
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Share, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PermissionGroup, RolePreset, WorkerGrantablePermission } from "@/api/types";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { TOUCH } from "@/theme/tokens";
import { Button, Card, EmptyState, Header, Icon, IconButton, IconCircle, PressableScale, Row, Screen, SectionTitle, Sheet, Stack, Text, toast, ToggleRow, type IconName, type Tone } from "@/ui";
import { useIsOwner } from "./hooks";
import { formatClock } from "./shifts";
import { impliedBy, matchPreset, normalizePermissions, roleIcons, togglePermission, type RoleKey } from "./roles";

/** Shows the screen only to the shop owner; staff see a friendly explanation. */
export function OwnerOnly({ title, children }: { title: string; children: ReactNode }) {
  const owner = useIsOwner();
  if (owner) return <>{children}</>;
  return (
    <Screen header={<Header back title={title} />}>
      <EmptyState
        icon="lock-closed-outline"
        tone="warning"
        title="Only the shop owner can manage this"
        body="Ask the owner if something here needs changing."
        action="Go back"
        onAction={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
    </Screen>
  );
}

/** Primary actions pinned to the bottom (thumb zone). */
export function StickyFooter({ children, error, note }: { children: ReactNode; error?: string | null; note?: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ padding: theme.space[4], paddingBottom: Math.max(insets.bottom, 12), gap: theme.space[2], backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}
    >
      {error ? (
        <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(160)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Icon name="alert-circle" color="danger" size={18} />
          <Text variant="small" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        </Animated.View>
      ) : note ? (
        <Text variant="small" color="textMuted" align="center">
          {note}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** Titled card of form fields. */
export function FormSection({ title, children, hint, action, onAction }: { title: string; children: ReactNode; hint?: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <Animated.View layout={theme.reduceMotion ? undefined : LinearTransition.duration(200)} style={{ gap: theme.space[2] }}>
      <SectionTitle title={title} action={action} onAction={onAction} />
      <Card style={{ gap: theme.space[4] }}>{children}</Card>
      {hint ? (
        <Text variant="small" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** A soft callout with an icon (info, warning, danger). */
export function Callout({ icon, tone = "info", title, children }: { icon: IconName; tone?: Tone; title?: string; children?: ReactNode }) {
  const theme = useTheme();
  const bg = { neutral: "surfaceSunken", accent: "accentSoft", success: "successSoft", warning: "warningSoft", danger: "dangerSoft", info: "infoSoft" } as const;
  const fg = { neutral: "textMuted", accent: "accentSoftText", success: "success", warning: "warning", danger: "danger", info: "info" } as const;
  return (
    <View style={{ flexDirection: "row", gap: 12, padding: theme.space[4], borderRadius: theme.radius.card, backgroundColor: theme.colors[bg[tone]] }}>
      <Icon name={icon} size={22} color={fg[tone]} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="bodyStrong" color="text">
            {title}
          </Text>
        ) : null}
        {typeof children === "string" ? (
          <Text variant="small" color="text">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Big tappable tile for quick actions. */
export function ActionTile({ icon, label, tone = "accent", onPress, hint }: { icon: IconName; label: string; tone?: Tone; onPress: () => void; hint?: string }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      scaleTo={0.95}
      style={{
        flex: 1,
        minWidth: 96,
        minHeight: 92,
        padding: theme.space[3],
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border
      }}
    >
      <IconCircle icon={icon} tone={tone} size={40} />
      <Text variant="small" weight="700" align="center" numberOfLines={3} color={tone === "danger" ? "danger" : "text"}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Radio card used for role presets and rounding modes. */
export function ChoiceCard({
  selected,
  onPress,
  icon,
  title,
  body,
  meta,
  children
}: {
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  title: string;
  body?: string;
  meta?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        if (!selected) haptic.select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, body, meta].filter(Boolean).join(". ")}
      scaleTo={0.98}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        padding: theme.space[4],
        minHeight: 72,
        borderRadius: theme.radius.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface
      }}
    >
      {icon ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceSunken }}>
          <Icon name={icon} size={22} color={selected ? "accent" : "textMuted"} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={selected ? "accentSoftText" : "text"}>
          {title}
        </Text>
        {body ? (
          <Text variant="small" color={selected ? "accentSoftText" : "textMuted"}>
            {body}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" weight="700" color={selected ? "accentSoftText" : "textFaint"}>
            {meta}
          </Text>
        ) : null}
        {children}
      </View>
      <Icon name={selected ? "radio-button-on" : "radio-button-off"} size={24} color={selected ? "accent" : "textFaint"} />
    </PressableScale>
  );
}

/** Role presets as big cards, plus "Custom". */
export function RolePicker({
  presets,
  permissions,
  onChange,
  onCustom
}: {
  presets: RolePreset[];
  permissions: string[];
  onChange: (permissions: WorkerGrantablePermission[]) => void;
  onCustom: () => void;
}) {
  const current = matchPreset(permissions, presets);
  const [customPicked, setCustomPicked] = useState(false);
  const selected: RoleKey = customPicked ? "custom" : current;
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
      {presets.map((preset) => (
        <ChoiceCard
          key={preset.key}
          selected={selected === preset.key}
          icon={roleIcons[preset.key]}
          title={preset.label}
          body={preset.description}
          meta={`${normalizePermissions(preset.permissions).length} permissions`}
          onPress={() => {
            setCustomPicked(false);
            onChange(normalizePermissions(preset.permissions));
          }}
        />
      ))}
      <ChoiceCard
        selected={selected === "custom"}
        icon={roleIcons.custom}
        title="Custom"
        body="Pick exactly what they can do below."
        onPress={() => {
          setCustomPicked(true);
          onCustom();
        }}
      />
    </View>
  );
}

/** Fine-grained permission switches grouped like the web app, with implied permissions explained. */
export function PermissionEditor({ groups, permissions, onChange }: { groups: PermissionGroup[]; permissions: string[]; onChange: (permissions: WorkerGrantablePermission[]) => void }) {
  const theme = useTheme();
  const labels = new Map(groups.flatMap((g) => g.items.map((i) => [i.key as string, i.label])));
  return (
    <Stack gap={4}>
      {groups.map((group) => {
        const on = group.items.filter((i) => permissions.includes(i.key)).length;
        return (
          <View key={group.group} style={{ gap: theme.space[2] }}>
            <Row justify="space-between">
              <Text variant="small" weight="700" color="textMuted" uppercase accessibilityRole="header">
                {group.group}
              </Text>
              <Text variant="caption" color="textFaint" tabular>
                {on} of {group.items.length}
              </Text>
            </Row>
            <Card style={{ paddingVertical: 4 }}>
              {group.items.map((item, index) => {
                const by = impliedBy(item.key, permissions);
                const locked = by.length > 0;
                return (
                  <View key={item.key} style={index > 0 ? { borderTopWidth: 1, borderColor: theme.colors.border } : undefined}>
                    <ToggleRow
                      label={item.label}
                      hint={locked ? `${item.description} Included with ${by.map((k) => labels.get(k) ?? k).join(", ")}.` : item.description}
                      value={permissions.includes(item.key)}
                      disabled={locked}
                      onChange={() => onChange(togglePermission(permissions, item.key))}
                    />
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
    </Stack>
  );
}

/** Multi-select list of stores with an "All" shortcut. */
export function StorePicker({
  stores,
  value,
  onChange,
  error
}: {
  stores: { id: string; name: string; city?: string | null }[];
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string | null;
}) {
  const theme = useTheme();
  const all = stores.length > 0 && stores.every((s) => value.includes(s.id));
  return (
    <View style={{ gap: theme.space[2] }}>
      <Card padded={false} style={{ overflow: "hidden" }}>
        {stores.length > 1 ? <StoreRow label="All stores" hint={`${stores.length} open stores`} checked={all} onPress={() => onChange(all ? [] : stores.map((s) => s.id))} icon="storefront" /> : null}
        {stores.map((store, i) => (
          <View key={store.id} style={i > 0 || stores.length > 1 ? { borderTopWidth: 1, borderColor: theme.colors.border } : undefined}>
            <StoreRow
              label={store.name}
              hint={store.city ?? undefined}
              checked={value.includes(store.id)}
              onPress={() => onChange(value.includes(store.id) ? value.filter((id) => id !== store.id) : [...value, store.id])}
              icon="storefront-outline"
            />
          </View>
        ))}
      </Card>
      {error ? (
        <Row gap={2}>
          <Icon name="alert-circle" size={16} color="danger" />
          <Text variant="small" color="danger">
            {error}
          </Text>
        </Row>
      ) : null}
    </View>
  );
}

function StoreRow({ label, hint, checked, onPress, icon }: { label: string; hint?: string; checked: boolean; onPress: () => void; icon: IconName }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      scaleTo={0.99}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: theme.space[4], paddingVertical: 8 }}
    >
      <Icon name={icon} size={22} color="textMuted" />
      <View style={{ flex: 1 }}>
        <Text variant="body" weight="600">
          {label}
        </Text>
        {hint ? (
          <Text variant="small" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Icon name={checked ? "checkbox" : "square-outline"} size={26} color={checked ? "accent" : "textFaint"} />
    </PressableScale>
  );
}

/** Label + value with a copy button. */
export function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const theme = useTheme();
  const [shown, setShown] = useState(!secret);
  return (
    <Row gap={2} style={{ minHeight: TOUCH }}>
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="textMuted" uppercase weight="700">
          {label}
        </Text>
        <Text variant="title" tabular selectable style={{ letterSpacing: 1 }}>
          {shown ? value : "•".repeat(Math.min(value.length, 8))}
        </Text>
      </View>
      {secret ? <IconButton icon={shown ? "eye-off-outline" : "eye-outline"} label={shown ? `Hide ${label}` : `Show ${label}`} color="textMuted" onPress={() => setShown(!shown)} /> : null}
      <View style={{ borderRadius: theme.radius.pill }}>
        <IconButton icon="copy-outline" label={`Copy ${label}`} variant="soft" onPress={() => copyText(value, `${label} copied`)} size={20} />
      </View>
    </Row>
  );
}

export async function copyText(value: string, message = "Copied") {
  try {
    await Clipboard.setStringAsync(value);
    haptic.success();
    toast.success(message);
  } catch {
    toast.error("Couldn't copy. Long-press the text to copy it.");
  }
}

export async function shareText(message: string, title?: string) {
  try {
    await Share.share({ message, title });
  } catch {
    await copyText(message, "Sharing isn't available here, so we copied it instead");
  }
}

/** After adding staff or resetting a PIN: the sign-in details, ready to copy or send. */
export function CredentialsSheet({
  visible,
  onClose,
  title,
  name,
  shopCode,
  username,
  pin
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  name: string;
  shopCode: string;
  username: string;
  pin: string;
}) {
  const theme = useTheme();
  const message = `Hi ${name}, here are your WowCity Seller sign-in details.\n\nShop code: ${shopCode}\nUsername: ${username}\nPIN: ${pin}\n\nOpen the WowCity Seller app → Sign in as staff. Please keep your PIN private.`;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Send these to them so they can sign in"
      footer={
        <>
          <Button label="Share sign-in details" icon="share-social-outline" size="lg" fullWidth onPress={() => shareText(message, "WowCity sign-in")} />
          <Row gap={2}>
            <Button label="Copy all" icon="copy-outline" variant="secondary" style={{ flex: 1 }} onPress={() => copyText(message, "Sign-in details copied")} />
            <Button label="Done" variant="ghost" style={{ flex: 1 }} onPress={onClose} />
          </Row>
        </>
      }
    >
      <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(250).delay(120)} style={{ alignItems: "center", gap: 8, paddingVertical: 4 }}>
        <IconCircle icon="checkmark-done" tone="success" size={64} />
      </Animated.View>
      <Card raised style={{ gap: theme.space[2] }}>
        <CopyRow label="Shop code" value={shopCode} />
        <CopyRow label="Username" value={username} />
        <CopyRow label="PIN" value={pin} secret />
      </Card>
      <Callout icon="shield-checkmark-outline" tone="info">
        This PIN is shown only now. If they forget it, reset it from their page.
      </Callout>
    </Sheet>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** Simple 24-hour time picker: tap an hour, then minutes. */
export function TimePickerSheet({ visible, title, value, onClose, onPick }: { visible: boolean; title: string; value: string; onClose: () => void; onPick: (value: string) => void }) {
  const theme = useTheme();
  const [h0, m0] = value.split(":").map(Number);
  const [hour, setHour] = useState(Number.isFinite(h0) ? h0 : 10);
  const [minute, setMinute] = useState(Number.isFinite(m0) ? m0 : 0);
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const cell = (label: string, sub: string | null, selected: boolean, onPress: () => void, a11y: string) => (
    <PressableScale
      key={a11y}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
      scaleTo={0.92}
      style={{
        width: "22.5%",
        minHeight: TOUCH,
        borderRadius: theme.radius.control,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 4,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceSunken,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border
      }}
    >
      <Text variant="bodyStrong" tabular color={selected ? "accentText" : "text"}>
        {label}
      </Text>
      {sub ? (
        <Text variant="caption" color={selected ? "accentText" : "textMuted"}>
          {sub}
        </Text>
      ) : null}
    </PressableScale>
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <Button
          label={`Set ${formatClock(hhmm)}`}
          size="lg"
          fullWidth
          onPress={() => {
            onPick(hhmm);
            onClose();
          }}
        />
      }
    >
      <View style={{ alignItems: "center", paddingVertical: 4 }}>
        <Text variant="hero" tabular accessibilityLiveRegion="polite">
          {hhmm}
        </Text>
        <Text variant="small" color="textMuted">
          {formatClock(hhmm)} IST
        </Text>
      </View>
      <SectionTitle title="Hour" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }} accessibilityRole="radiogroup">
        {HOURS.map((h) =>
          cell(
            String(h).padStart(2, "0"),
            h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`,
            h === hour,
            () => setHour(h),
            `${formatClock(`${String(h).padStart(2, "0")}:00`)} hour`
          )
        )}
      </View>
      <SectionTitle title="Minutes" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }} accessibilityRole="radiogroup">
        {MINUTES.map((m) => cell(`:${String(m).padStart(2, "0")}`, null, m === minute, () => setMinute(m), `${m} minutes`))}
      </View>
    </Sheet>
  );
}

/** Fades content in on mount, respecting reduce motion. */
export function FadeInView({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(220).delay(delay)} exiting={theme.reduceMotion ? undefined : FadeOut.duration(120)}>
      {children}
    </Animated.View>
  );
}
