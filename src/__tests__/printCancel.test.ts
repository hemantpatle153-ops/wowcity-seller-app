import { isPrintCancel } from "@/lib/printCancel";

describe("print cancel detection", () => {
  it("treats a closed dialog as a cancel, other failures as errors", () => {
    expect(isPrintCancel(new Error("Printing did not complete"))).toBe(true);
    expect(isPrintCancel(new Error("User cancelled"))).toBe(true);
    expect(isPrintCancel(new Error("No printer found"))).toBe(false);
  });
});
