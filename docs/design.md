# WowCity app design system (seller and buyer apps)

Goal: an app that feels fast, friendly and premium, and is easy on the eyes through a full shop day.

## Appearance modes (Settings → Appearance)

| Mode | For | Surface | Text | Notes |
|---|---|---|---|---|
| System | Default. Follows the phone's light/dark setting | – | – | Switches live when the phone switches |
| Light | Bright shops, daytime | warm off-white `#FAF9F7`, cards `#FFFFFF` | `#1C1A17` | Never pure white page background |
| Dark | Evening, low light | `#15171A`, cards `#1D2024` | `#ECEDEE` | Soft dark, not black; lower-contrast borders |
| AMOLED Black | OLED phones, battery saving | `#000000`, cards `#0D0D0F` | `#E6E6E6` | Pure black saves battery on OLED |
| Eye Comfort | Long counter shifts | warm paper `#F4ECD8`, cards `#FBF5E6` | `#3B3024` | Low blue light: warm sepia palette, brand colour warmed, reduced contrast glare |

Also in Appearance:
- **Accent colour:** 5 choices (WowCity Blue default, Emerald, Violet, Saffron, Rose). Every accent is checked for 4.5:1 text contrast in every mode.
- **Text size:** Small / Default / Large / Extra large (scales all type; layouts must not break at Extra large).
- **Reduce motion:** follows the phone setting; can be forced on.
- **Haptics:** on/off.

The choice persists on the device and applies instantly (no restart) with a short cross-fade.

## Tokens

All colours come from semantic tokens (`bg`, `surface`, `surfaceRaised`, `border`, `text`, `textMuted`, `accent`, `accentText`, `success`, `warning`, `danger`, `info`), defined once per mode. Components never use raw hex values. Status colours (success/warning/danger) are separate from the accent and always come with an icon or label, never colour alone.

Spacing 4-pt scale; radius 10 (controls), 16 (cards), 24 (sheets); type scale 12/14/16/18/22/28/34; tabular numbers for money and quantities.

## Interaction and motion

- Every tap gives feedback: pressed state, light haptic on primary actions, success haptic on a saved bill/scan.
- Spring animations (Reanimated) for sheets, cart line add/remove, quantity steppers, tab changes; 150–250 ms, never blocking input. Respect reduce-motion.
- Skeleton loaders instead of spinners for lists; optimistic updates where safe.
- Pull to refresh on lists; swipe actions on list rows (e.g. remove cart line, mark favourite).
- Bottom sheets for pickers and quick actions; large touch targets (min 48 dp).
- Empty states with a friendly illustration/icon and one clear action.
- Offline banner that is calm, not alarming; queued items show a small clock badge.
- Numbers animate (count up) on dashboards; charts are simple, legible and themed.
- Works one-handed: primary actions in the bottom third of the screen.

## Accessibility

Screen-reader labels on every control, focus order, dynamic type, 4.5:1 contrast in all five modes, no information by colour alone.
