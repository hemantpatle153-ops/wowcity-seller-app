import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeColors, TypeVariant } from "@/theme/tokens";

export type ColorToken = Exclude<keyof ThemeColors, "chart">;

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: ColorToken;
  weight?: TextStyle["fontWeight"];
  align?: TextStyle["textAlign"];
  /** Tabular digits for money and quantities so columns line up. */
  tabular?: boolean;
  uppercase?: boolean;
};

export function Text({ variant = "body", color = "text", weight, align, tabular, uppercase, style, ...rest }: TextProps) {
  const theme = useTheme();
  const t = theme.type(variant);
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[
        { color: theme.colors[color], fontSize: t.fontSize, lineHeight: t.lineHeight, fontWeight: weight ?? t.fontWeight },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        uppercase ? { textTransform: "uppercase", letterSpacing: 0.6 } : null,
        style
      ]}
    />
  );
}
