import { arcPath, areaPath, bandScale, describeSeries, donutSegments, labelIndexes, linearScale, linePath, nearestIndex, niceStep, niceTicks, percentages, smoothPath, toPoints } from "@/ui/charts/scale";

describe("niceStep / niceTicks", () => {
  it("rounds steps to 1, 2, 2.5, 5 × 10^n", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.6)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3.1)).toBe(5);
    expect(niceStep(7200)).toBe(10000);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });

  it("covers the data with round ticks starting at zero", () => {
    const t = niceTicks(0, 29038, 3);
    expect(t.min).toBe(0);
    expect(t.max).toBeGreaterThanOrEqual(29038);
    expect(t.ticks[0]).toBe(0);
    expect(t.ticks).toEqual([0, 10000, 20000, 30000]);
  });

  it("handles negatives, reversed and flat input", () => {
    expect(niceTicks(-400, 100, 4).ticks).toEqual([-400, -200, 0, 200]);
    expect(niceTicks(-400, 100, 5).ticks).toEqual([-400, -300, -200, -100, 0, 100]);
    expect(niceTicks(10, 0).min).toBe(0);
    const flat = niceTicks(0, 0);
    expect(flat.ticks.length).toBeGreaterThanOrEqual(2);
    expect(flat.max).toBeGreaterThan(0);
    const same = niceTicks(50, 50);
    expect(same.min).toBe(0);
    expect(same.max).toBeGreaterThanOrEqual(50);
  });

  it("avoids floating point noise", () => {
    const t = niceTicks(0, 0.3, 3);
    for (const v of t.ticks) expect(String(v).length).toBeLessThan(6);
  });
});

describe("scales", () => {
  it("maps linearly and inverts ranges", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
    expect(linearScale([5, 5], [10, 20])(5)).toBe(10);
  });

  it("lays out bands", () => {
    const b = bandScale(4, 400, 0.5);
    expect(b.step).toBe(100);
    expect(b.bandwidth).toBe(50);
    expect(b.x(0)).toBe(25);
    expect(b.center(3)).toBe(350);
  });

  it("places points across the plot", () => {
    const pts = toPoints([0, 50, 100], 200, 100, [0, 100]);
    expect(pts).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 200, y: 0 }
    ]);
    expect(toPoints([], 100, 100)).toEqual([]);
    expect(toPoints([5], 100, 100)[0].x).toBe(50);
  });
});

describe("paths", () => {
  const pts = [
    { x: 0, y: 10 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
    { x: 30, y: 5 }
  ];
  it("builds straight and smooth paths", () => {
    expect(linePath(pts.slice(0, 2))).toBe("M0,10 L10,0");
    expect(linePath([])).toBe("");
    const d = smoothPath(pts);
    expect(d.startsWith("M0,10")).toBe(true);
    expect((d.match(/C/g) ?? []).length).toBe(3);
    expect(d.endsWith("30,5")).toBe(true);
    // Two points fall back to a line.
    expect(smoothPath(pts.slice(0, 2))).toBe("M0,10 L10,0");
  });

  it("never overshoots at a local peak (monotone)", () => {
    const d = smoothPath([
      { x: 0, y: 50 },
      { x: 10, y: 0 },
      { x: 20, y: 50 }
    ]);
    const ys = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  it("closes the area down to the baseline", () => {
    const d = areaPath(pts, 20, false);
    expect(d).toBe("M0,10 L10,0 L20,10 L30,5 L30,20 L0,20 Z");
    expect(areaPath([], 10)).toBe("");
  });

  it("finds the nearest point", () => {
    expect(nearestIndex(pts, 12)).toBe(1);
    expect(nearestIndex(pts, 100)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

describe("percentages and donut", () => {
  it("adds up to exactly 100", () => {
    const p = percentages([2348, 1447, 25243]);
    expect(p.reduce((s, v) => s + v, 0)).toBe(100);
    expect(p).toEqual([8, 5, 87]);
    expect(percentages([1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(100);
    expect(percentages([0, 0])).toEqual([0, 0]);
    expect(percentages([-5, 10])).toEqual([0, 100]);
  });

  it("splits the circle and skips zeros", () => {
    const s = donutSegments([1, 0, 3], 0);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ index: 0, start: 0, sweep: 0.25 });
    expect(s[1]).toMatchObject({ index: 2, start: 0.25, sweep: 0.75 });
    expect(donutSegments([0, 0])).toEqual([]);
    // A single slice gets no gap.
    expect(donutSegments([5], 0.01)[0].sweep).toBe(1);
  });

  it("draws arcs from 12 o'clock clockwise", () => {
    expect(arcPath(50, 50, 40, 0, 0.25)).toBe("M50,10 A40,40 0 0 1 90,50");
    expect(arcPath(50, 50, 40, 0, 0.75)).toContain(" 0 1 1 ");
  });
});

describe("labels and descriptions", () => {
  it("picks evenly spaced label indexes including both ends", () => {
    expect(labelIndexes(14, 4)).toEqual([0, 4, 9, 13]);
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(labelIndexes(0, 3)).toEqual([]);
    expect(labelIndexes(10, 1)).toEqual([9]);
  });

  it("summarises a series for screen readers", () => {
    const text = describeSeries(
      [
        { label: "Mon", value: 10 },
        { label: "Tue", value: 30 },
        { label: "Wed", value: 5 }
      ],
      (n) => `₹${n}`,
      "days"
    );
    expect(text).toBe("3 days from Mon to Wed. Total ₹45. Highest ₹30 on Tue. Lowest ₹5 on Wed. Latest ₹5.");
    expect(describeSeries([], String)).toBe("No data");
    expect(describeSeries([{ label: "Today", value: 1 }], (n) => `${n}`)).toBe("Today: 1");
  });
});
