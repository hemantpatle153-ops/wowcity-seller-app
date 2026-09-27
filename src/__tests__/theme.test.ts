import { contrast } from "@/theme/color";
import { accentNames, resolveColors, type ResolvedMode } from "@/theme/tokens";

const modes: ResolvedMode[] = ["light", "dark", "amoled", "comfort"];

describe("theme tokens", () => {
  for (const mode of modes) {
    for (const { key } of accentNames) {
      const c = resolveColors(mode, key);
      it(`${mode}/${key}: accent readable on surfaces and accentText readable on accent`, () => {
        expect(contrast(c.accent, c.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.accent, c.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.accentSoftText, c.accentSoft)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${mode}: body, muted and status text meet 4.5:1`, () => {
      const c = resolveColors(mode, "blue");
      for (const bg of [c.bg, c.surface, c.surfaceRaised]) {
        expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.textFaint, bg)).toBeGreaterThanOrEqual(4.5);
        for (const status of [c.success, c.warning, c.danger, c.info]) expect(contrast(status, bg)).toBeGreaterThanOrEqual(4.5);
      }
      for (const [fg, bg] of [
        [c.success, c.successSoft],
        [c.warning, c.warningSoft],
        [c.danger, c.dangerSoft],
        [c.info, c.infoSoft]
      ]) {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("uses the documented surfaces", () => {
    expect(resolveColors("light", "blue").bg).toBe("#FAF9F7");
    expect(resolveColors("dark", "blue").bg).toBe("#15171A");
    expect(resolveColors("amoled", "blue").bg).toBe("#000000");
    expect(resolveColors("comfort", "blue").bg).toBe("#F4ECD8");
  });
});
