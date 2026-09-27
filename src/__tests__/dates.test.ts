import { daysBetween, isIsoDay, monthGrid, nextRange, prettyDay, shiftDay, shiftMonth, spokenDay } from "@/lib/dates";

describe("calendar dates", () => {
  it("validates real days only", () => {
    expect(isIsoDay("2026-09-27")).toBe(true);
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2028-02-29")).toBe(true);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("27-09-2026")).toBe(false);
  });

  it("builds a Sunday-first month grid", () => {
    const grid = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(grid.length % 7).toBe(0);
    expect(grid.slice(0, 3)).toEqual([null, null, "2026-09-01"]);
    expect(grid.filter(Boolean)).toHaveLength(30);
  });

  it("shifts across months and years", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(daysBetween("2026-09-01", "2026-09-30")).toBe(29);
  });

  it("builds a range from two taps in any order", () => {
    const first = nextRange({ from: null, to: null }, "2026-09-20");
    expect(first).toEqual({ from: "2026-09-20", to: null });
    expect(nextRange(first, "2026-09-05")).toEqual({ from: "2026-09-05", to: "2026-09-20" });
    expect(nextRange({ from: "2026-09-05", to: "2026-09-20" }, "2026-09-10")).toEqual({ from: "2026-09-10", to: null });
  });

  it("formats for display and screen readers", () => {
    expect(prettyDay("2026-09-27")).toBe("27 Sep 2026");
    expect(spokenDay("2026-09-27")).toBe("Sunday 27 September 2026");
    expect(prettyDay("bad")).toBe("");
  });
});
