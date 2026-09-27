/**
 * Code 128 (code set B) encoder for barcode labels. Returns bar/space widths in modules; render as
 * SVG rects (app preview) or an SVG string (printed PDF). Code set B covers printable ASCII 32–126,
 * which includes every seller barcode (EAN-13 digits and generated alphanumeric codes).
 */

/** Widths (bar, space, bar, space, bar, space[, bar]) for symbol values 0–106. */
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
] as const;

export const START_B = 104;
export const STOP = 106;

/** Symbol values for `text` in code set B (without start/check/stop). Unsupported characters become "?". */
export function code128BValues(text: string): number[] {
  return Array.from(text).map((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 32 && code <= 126 ? code - 32 : 31; // "?"
  });
}

export function code128Checksum(values: number[], start = START_B) {
  return values.reduce((sum, value, index) => sum + value * (index + 1), start) % 103;
}

export type Code128 = {
  /** Every symbol value: start, data…, check, stop. */
  symbols: number[];
  /** Alternating bar/space widths in modules, starting with a bar. */
  widths: number[];
  /** Total width in modules (without quiet zones). */
  modules: number;
};

export function encodeCode128B(text: string): Code128 {
  const data = code128BValues(text);
  const symbols = [START_B, ...data, code128Checksum(data), STOP];
  const widths = symbols.flatMap((symbol) => Array.from(CODE128_PATTERNS[symbol], Number));
  return { symbols, widths, modules: widths.reduce((a, b) => a + b, 0) };
}

/** Bars as [x, width] in modules, offset by `quiet` modules of white on the left. */
export function code128Bars(text: string, quiet = 10): { bars: [number, number][]; total: number } {
  const { widths, modules } = encodeCode128B(text);
  const bars: [number, number][] = [];
  let x = quiet;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push([x, w]);
    x += w;
  });
  return { bars, total: modules + quiet * 2 };
}

/** Standalone SVG (black on white) that stretches to its box; used in the printed labels. */
export function code128Svg(text: string, quiet = 10): string {
  const { bars, total } = code128Bars(text, quiet);
  const rects = bars.map(([x, w]) => `<rect x="${x}" y="0" width="${w}" height="1"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${rects}</svg>`;
}
