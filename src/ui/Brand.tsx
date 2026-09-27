import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

/** WowCity mark: a shop-front "W" in a rounded tile, drawn in the accent colour. */
export function BrandMark({ size = 56, inverted }: { size?: number; inverted?: boolean }) {
  const theme = useTheme();
  const bg = inverted ? theme.colors.accentText : theme.colors.accent;
  const fg = inverted ? theme.colors.accent : theme.colors.accentText;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="WowCity">
      <Rect x={0} y={0} width={64} height={64} rx={18} fill={bg} />
      <Path d="M12 16 h40 l-3 7 H15 z" fill={fg} opacity={0.9} />
      <Path d="M14 28 L21 50 L28 34 L32 44 L36 34 L43 50 L50 28" stroke={fg} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
