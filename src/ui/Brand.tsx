import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/** WowCity logo (same as luzzan.com): a white "W" on the pink → orange → gold tile. Fixed brand colours. */
export function BrandMark({ size = 56 }: { size?: number; inverted?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel="WowCity">
      <Defs>
        <LinearGradient id="wowcity-brand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ff2e7e" />
          <Stop offset="0.55" stopColor="#ff7a2f" />
          <Stop offset="1" stopColor="#ffc23d" />
        </LinearGradient>
      </Defs>
      <Rect width={40} height={40} rx={12} fill="url(#wowcity-brand)" />
      <Path d="M9 13l4.2 14L20 15.5 26.8 27 31 13" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
