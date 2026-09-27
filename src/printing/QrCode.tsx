import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { qrMatrix } from "./qr";

/** QR drawn natively, always dark-on-light so every UPI app can read it in any appearance mode. */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label?: string }) {
  const theme = useTheme();
  const { path, n } = useMemo(() => {
    const matrix = qrMatrix(value);
    let d = "";
    matrix.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
    return { path: d, n: matrix.length + 8 };
  }, [value]);
  // Scanners need contrast: light quiet zone in every mode (Eye Comfort keeps its warm paper tone).
  const light = theme.mode === "comfort" ? theme.colors.surfaceRaised : theme.scheme === "dark" ? theme.colors.text : theme.colors.surface;
  const dark = theme.mode === "comfort" ? theme.colors.text : theme.scheme === "dark" ? theme.colors.bg : theme.colors.text;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel={label ?? "QR code"}>
      <Rect x={0} y={0} width={n} height={n} rx={2} fill={light} />
      <Path d={path} fill={dark} />
    </Svg>
  );
}
