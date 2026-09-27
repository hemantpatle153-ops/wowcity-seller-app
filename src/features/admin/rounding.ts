/** Bill rounding modes with a worked example for each (Settings → Tax). */
import type { RoundingMode } from "@/api/types";
import { formatMoney } from "@/lib/format";

export function roundBill(amount: number, mode: RoundingMode) {
  const paise = Math.round(amount * 100);
  switch (mode) {
    case "nearest_rupee":
      return Math.round(paise / 100);
    case "up_rupee":
      return Math.ceil(paise / 100);
    case "down_rupee":
      return Math.floor(paise / 100);
    case "none":
      return paise / 100;
  }
}

export const roundingModes: { key: RoundingMode; label: string; hint: string; samples: number[] }[] = [
  { key: "nearest_rupee", label: "Nearest rupee", hint: "50 paise and above rounds up, below rounds down.", samples: [1249.5, 1249.4] },
  { key: "up_rupee", label: "Always up", hint: "Any paise round up to the next rupee.", samples: [1249.5, 1249.1] },
  { key: "down_rupee", label: "Always down", hint: "Paise are dropped; the customer pays less.", samples: [1249.5, 1249.9] },
  { key: "none", label: "No rounding", hint: "Bills keep their exact paise.", samples: [1249.5] }
];

/** "₹1,249.50 → ₹1,250". */
export function roundingExample(amount: number, mode: RoundingMode) {
  const rounded = roundBill(amount, mode);
  return `${formatMoney(amount, { decimals: 2 })} → ${formatMoney(rounded, { decimals: mode === "none" ? 2 : 0 })}`;
}
