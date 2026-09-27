import { alpha, mix } from "./color";

/**
 * Design tokens (docs/design.md). Every colour a component uses comes from `ThemeColors`;
 * components never use raw hex values.
 */

export type AppearanceMode = "system" | "light" | "dark" | "amoled" | "comfort";
export type ResolvedMode = Exclude<AppearanceMode, "system">;
export type AccentName = "blue" | "emerald" | "violet" | "saffron" | "rose";
export type TextSize = "small" | "default" | "large" | "xlarge";

export const appearanceModes: { key: AppearanceMode; label: string; hint: string }[] = [
  { key: "system", label: "System", hint: "Follows your phone" },
  { key: "light", label: "Light", hint: "Bright shops, daytime" },
  { key: "dark", label: "Dark", hint: "Evening, low light" },
  { key: "amoled", label: "AMOLED Black", hint: "Pure black, saves battery" },
  { key: "comfort", label: "Eye Comfort", hint: "Warm, low blue light" }
];

export const accentNames: { key: AccentName; label: string }[] = [
  { key: "blue", label: "WowCity Blue" },
  { key: "emerald", label: "Emerald" },
  { key: "violet", label: "Violet" },
  { key: "saffron", label: "Saffron" },
  { key: "rose", label: "Rose" }
];

export const textSizes: { key: TextSize; label: string; scale: number }[] = [
  { key: "small", label: "Small", scale: 0.9 },
  { key: "default", label: "Default", scale: 1 },
  { key: "large", label: "Large", scale: 1.15 },
  { key: "xlarge", label: "Extra large", scale: 1.3 }
];

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentSoftText: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
  shadow: string;
  skeleton: string;
  skeletonHighlight: string;
  /** Chart series, derived from the accent and status colours. */
  chart: string[];
};

type Base = {
  scheme: "light" | "dark";
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  shadow: string;
};

const bases: Record<ResolvedMode, Base> = {
  light: {
    scheme: "light",
    bg: "#FAF9F7",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    surfaceSunken: "#F2F0EC",
    border: "#E6E2DC",
    borderStrong: "#CFC9C0",
    text: "#1C1A17",
    textMuted: "#5E5850",
    textFaint: "#6E675E",
    success: "#137035",
    warning: "#8F5106",
    danger: "#C62828",
    info: "#1D66B8",
    shadow: "#1C1A17"
  },
  dark: {
    scheme: "dark",
    bg: "#15171A",
    surface: "#1D2024",
    surfaceRaised: "#25292E",
    surfaceSunken: "#111316",
    border: "#2E3238",
    borderStrong: "#41464E",
    text: "#ECEDEE",
    textMuted: "#A9AEB5",
    textFaint: "#8E949C",
    success: "#4ADE80",
    warning: "#FBBF24",
    danger: "#FF8A8A",
    info: "#74B1FB",
    shadow: "#000000"
  },
  amoled: {
    scheme: "dark",
    bg: "#000000",
    surface: "#0D0D0F",
    surfaceRaised: "#16161A",
    surfaceSunken: "#000000",
    border: "#1F1F24",
    borderStrong: "#34343B",
    text: "#E6E6E6",
    textMuted: "#A3A3A8",
    textFaint: "#8A8A90",
    success: "#4ADE80",
    warning: "#FBBF24",
    danger: "#F87171",
    info: "#60A5FA",
    shadow: "#000000"
  },
  comfort: {
    scheme: "light",
    bg: "#F4ECD8",
    surface: "#FBF5E6",
    surfaceRaised: "#FDF9EE",
    surfaceSunken: "#EDE3CB",
    border: "#E2D5B7",
    borderStrong: "#CDBD98",
    text: "#3B3024",
    textMuted: "#63543F",
    textFaint: "#6F5F48",
    success: "#3F6B2A",
    warning: "#8A5410",
    danger: "#A63A2B",
    info: "#3A5F8A",
    shadow: "#3B3024"
  }
};

/** Accent per mode. Each is tuned for 4.5:1 against the mode's surfaces and its own `accentText`. */
const accents: Record<AccentName, Record<ResolvedMode, string>> = {
  blue: { light: "#1E5BD8", dark: "#7AA7FF", amoled: "#7AA7FF", comfort: "#2E5596" },
  emerald: { light: "#047857", dark: "#34D399", amoled: "#34D399", comfort: "#2F6B4F" },
  violet: { light: "#6D28D9", dark: "#B39DFA", amoled: "#B39DFA", comfort: "#5B3E8C" },
  saffron: { light: "#A34E00", dark: "#FBBF24", amoled: "#FBBF24", comfort: "#8A4B0F" },
  rose: { light: "#BE123C", dark: "#FB8DA0", amoled: "#FB8DA0", comfort: "#9C2F45" }
};

export function resolveColors(mode: ResolvedMode, accentName: AccentName): ThemeColors & { scheme: "light" | "dark" } {
  const base = bases[mode];
  const accent = accents[accentName][mode];
  const dark = base.scheme === "dark";
  const accentText = dark ? "#0B0D10" : mode === "comfort" ? "#FFF9EC" : "#FFFFFF";
  const soft = (color: string) => mix(base.surface, color, dark ? 0.2 : 0.12);
  return {
    scheme: base.scheme,
    bg: base.bg,
    surface: base.surface,
    surfaceRaised: base.surfaceRaised,
    surfaceSunken: base.surfaceSunken,
    border: base.border,
    borderStrong: base.borderStrong,
    text: base.text,
    textMuted: base.textMuted,
    textFaint: base.textFaint,
    accent,
    accentText,
    accentSoft: soft(accent),
    accentSoftText: dark ? accent : mix(accent, base.text, 0.25),
    success: base.success,
    successSoft: soft(base.success),
    warning: base.warning,
    warningSoft: soft(base.warning),
    danger: base.danger,
    dangerSoft: soft(base.danger),
    info: base.info,
    infoSoft: soft(base.info),
    overlay: alpha(dark ? "#000000" : base.text, dark ? 0.6 : 0.38),
    shadow: base.shadow,
    skeleton: mix(base.surface, base.text, dark ? 0.1 : 0.07),
    skeletonHighlight: mix(base.surface, base.text, dark ? 0.16 : 0.03),
    chart: [accent, base.success, base.warning, base.info, base.danger, mix(accent, base.text, 0.45)]
  };
}

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export type SpaceKey = keyof typeof space;

export const radius = { control: 10, card: 16, sheet: 24, pill: 999 } as const;

/** Type scale 12/14/16/18/22/28/34 (docs/design.md). */
export const typeScale = {
  caption: { size: 12, line: 16, weight: "500" },
  small: { size: 14, line: 20, weight: "400" },
  body: { size: 16, line: 22, weight: "400" },
  bodyStrong: { size: 16, line: 22, weight: "600" },
  title: { size: 18, line: 24, weight: "600" },
  heading: { size: 22, line: 28, weight: "700" },
  display: { size: 28, line: 34, weight: "700" },
  hero: { size: 34, line: 40, weight: "800" }
} as const;
export type TypeVariant = keyof typeof typeScale;

/** Minimum touch target (dp). */
export const TOUCH = 48;

export const motion = {
  fast: 150,
  normal: 200,
  slow: 250,
  spring: { damping: 18, stiffness: 220, mass: 0.9 }
} as const;
