/** Small colour helpers used to derive tints and to verify contrast (WCAG 2.1). */

function parse(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]) {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(Math.min(255, Math.max(0, c)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
      .toUpperCase()
  );
}

/** Mix `a` towards `b` by `amount` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number) {
  const ca = parse(a);
  const cb = parse(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * amount, ca[1] + (cb[1] - ca[1]) * amount, ca[2] + (cb[2] - ca[2]) * amount]);
}

/** `#RRGGBB` plus alpha as `#RRGGBBAA`. */
export function alpha(hex: string, opacity: number) {
  return (
    toHex(parse(hex)) +
    Math.round(Math.min(1, Math.max(0, opacity)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase()
  );
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string) {
  const [r, g, b] = parse(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
