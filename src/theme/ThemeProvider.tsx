import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";
import { usePreferences } from "@/state/preferences";
import { motion, radius, resolveColors, space, textSizes, typeScale, type ResolvedMode, type ThemeColors, type TypeVariant } from "./tokens";

export type Theme = {
  mode: ResolvedMode;
  scheme: "light" | "dark";
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
  fontScale: number;
  reduceMotion: boolean;
  haptics: boolean;
  type: (variant: TypeVariant) => { fontSize: number; lineHeight: number; fontWeight: (typeof typeScale)[TypeVariant]["weight"] };
};

const ThemeContext = createContext<Theme | null>(null);

export function buildTheme(mode: ResolvedMode, accent: Parameters<typeof resolveColors>[1], fontScale: number, reduceMotion: boolean, haptics: boolean): Theme {
  const { scheme, ...colors } = resolveColors(mode, accent);
  return {
    mode,
    scheme,
    colors,
    space,
    radius,
    motion,
    fontScale,
    reduceMotion,
    haptics,
    type: (variant) => {
      const t = typeScale[variant];
      return { fontSize: Math.round(t.size * fontScale), lineHeight: Math.round(t.line * fontScale), fontWeight: t.weight };
    }
  };
}

function useSystemReduceMotion() {
  const [value, setValue] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setValue(enabled))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setValue);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return value;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const systemReduce = useSystemReduceMotion();
  const appearance = usePreferences((s) => s.appearance);
  const accent = usePreferences((s) => s.accent);
  const textSize = usePreferences((s) => s.textSize);
  const reduce = usePreferences((s) => s.reduceMotion);
  const haptics = usePreferences((s) => s.haptics);
  const mode: ResolvedMode = appearance === "system" ? (system === "dark" ? "dark" : "light") : appearance;
  const scale = textSizes.find((t) => t.key === textSize)?.scale ?? 1;
  const theme = useMemo(() => buildTheme(mode, accent, scale, reduce === "on" || systemReduce, haptics), [mode, accent, scale, reduce, systemReduce, haptics]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside ThemeProvider");
  return theme;
}
