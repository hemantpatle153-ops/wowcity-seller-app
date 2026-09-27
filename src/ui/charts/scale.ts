/**
 * Pure chart maths: scales, "nice" axis ticks, SVG path building and donut segments.
 * No React or theme imports so it is unit-testable (src/__tests__/charts.test.ts).
 */

export type Point = { x: number; y: number };

/** Round a raw step to 1, 2, 2.5 or 5 × 10^n. */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exponent);
  const fraction = rawStep / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Evenly spaced round tick values covering [min, max]. Always includes 0 when the data does
 * (bars start at zero). Returns at least two ticks.
 */
export function niceTicks(min: number, max: number, count = 4): { min: number; max: number; step: number; ticks: number[] } {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (hi === 0) hi = 1;
    else if (hi > 0) lo = 0;
    else hi = 0;
  }
  const step = niceStep((hi - lo) / Math.max(1, count));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  if (ticks.length < 2) ticks.push(Number((start + step).toPrecision(12)));
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

/** Linear map from a domain to a range. Degenerate domains map to the range start. */
export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** Band layout for `n` bars across `width` with a gap ratio between bars (0..1). */
export function bandScale(n: number, width: number, paddingRatio = 0.3) {
  const count = Math.max(1, n);
  const step = width / count;
  const bandwidth = Math.max(1, step * (1 - Math.min(0.9, Math.max(0, paddingRatio))));
  return { step, bandwidth, x: (index: number) => index * step + (step - bandwidth) / 2, center: (index: number) => index * step + step / 2 };
}

/** Position `values` across a plot box. Single values sit in the middle. */
export function toPoints(values: number[], width: number, height: number, domain?: [number, number], inset = 0): Point[] {
  if (!values.length) return [];
  const lo = domain ? domain[0] : Math.min(0, ...values);
  const hi = domain ? domain[1] : Math.max(...values);
  const y = linearScale([lo, hi === lo ? lo + 1 : hi], [height - inset, inset]);
  const x = values.length === 1 ? () => width / 2 : linearScale([0, values.length - 1], [inset, width - inset]);
  return values.map((v, i) => ({ x: x(i), y: y(v) }));
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Straight polyline path. */
export function linePath(points: Point[]): string {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)},${f(p.y)}`).join(" ");
}

/**
 * Smooth path through every point using monotone cubic interpolation (Fritsch–Carlson), so the
 * curve never overshoots the data (no fake dips below zero between two days).
 */
export function smoothPath(points: Point[]): string {
  const n = points.length;
  if (n < 3) return linePath(points);
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push(dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]);
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) tangent.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  tangent.push(slope[n - 2]);
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${f(p0.x + h)},${f(p0.y + tangent[i] * h)} ${f(p1.x - h)},${f(p1.y - tangent[i + 1] * h)} ${f(p1.x)},${f(p1.y)}`;
  }
  return d;
}

/** Closed area under a line down to `baseline` (y in px). */
export function areaPath(points: Point[], baseline: number, smooth = true): string {
  if (!points.length) return "";
  const top = smooth ? smoothPath(points) : linePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${top} L${f(last.x)},${f(baseline)} L${f(first.x)},${f(baseline)} Z`;
}

/** Index of the point nearest to x (for scrubbing / tap to inspect). */
export function nearestIndex(points: Point[], x: number): number {
  if (!points.length) return -1;
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i;
  return best;
}

/**
 * Whole-number percentages that add up to exactly 100 (largest remainder method).
 * Negative values count as 0. All zero → all 0.
 */
export function percentages(values: number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total <= 0) return clean.map(() => 0);
  const raw = clean.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || clean[b.i] - clean[a.i]);
  for (const { i } of order) {
    if (remaining <= 0) break;
    if (clean[i] > 0) {
      floors[i] += 1;
      remaining -= 1;
    }
  }
  return floors;
}

export type DonutSegment = { index: number; start: number; sweep: number; fraction: number };

/**
 * Donut segments as fractions of the circle (start/sweep 0..1), in input order, skipping zero
 * values. `gap` (fraction of the circle) is taken out of each segment when there are several.
 */
export function donutSegments(values: number[], gap = 0.006): DonutSegment[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  const visible = clean.filter((v) => v > 0).length;
  const g = visible > 1 ? gap : 0;
  const segments: DonutSegment[] = [];
  let cursor = 0;
  clean.forEach((v, index) => {
    if (v <= 0) return;
    const fraction = v / total;
    segments.push({ index, start: cursor + g / 2, sweep: Math.max(0.001, fraction - g), fraction });
    cursor += fraction;
  });
  return segments;
}

/** SVG arc path for a ring segment (angles as fractions of a turn, 0 = 12 o'clock, clockwise). */
export function arcPath(cx: number, cy: number, r: number, start: number, sweep: number): string {
  const s = Math.min(0.9999, Math.max(0, sweep));
  const a0 = start * 2 * Math.PI - Math.PI / 2;
  const a1 = (start + s) * 2 * Math.PI - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M${f(x0)},${f(y0)} A${f(r)},${f(r)} 0 ${s > 0.5 ? 1 : 0} 1 ${f(x1)},${f(y1)}`;
}

/** Evenly pick up to `max` indexes from `n` items, always including the first and last. */
export function labelIndexes(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  if (max <= 1) return [n - 1];
  const out = new Set<number>();
  for (let k = 0; k < max; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Screen-reader sentence for a series: "14 values from 14 Sep to 27 Sep. Highest …". */
export function describeSeries(points: { label: string; value: number }[], format: (n: number) => string, noun = "values"): string {
  if (!points.length) return "No data";
  const values = points.map((p) => p.value);
  let hi = 0;
  let lo = 0;
  values.forEach((v, i) => {
    if (v > values[hi]) hi = i;
    if (v < values[lo]) lo = i;
  });
  const total = values.reduce((s, v) => s + v, 0);
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) return `${first.label}: ${format(first.value)}`;
  return `${points.length} ${noun} from ${first.label} to ${last.label}. Total ${format(total)}. Highest ${format(values[hi])} on ${points[hi].label}. Lowest ${format(values[lo])} on ${points[lo].label}. Latest ${format(last.value)}.`;
}
