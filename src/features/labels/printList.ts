import { create } from "zustand";
import type { LabelFieldKey, LabelItem } from "@/api/types";
import { defaultLabelFields } from "./labelHtml";

export type PrintLine = { item: LabelItem; copies: number };

type PrintListState = {
  lines: PrintLine[];
  template: string | null;
  fields: LabelFieldKey[];
  /** Job id the list was loaded from (so a reprint link loads it once). */
  source: string | null;
  add: (item: LabelItem, copies?: number) => "added" | "more";
  setCopies: (barcodeId: string, copies: number) => void;
  remove: (barcodeId: string) => void;
  clear: () => void;
  load: (lines: PrintLine[], source: string | null) => void;
  set: (patch: Partial<Pick<PrintListState, "template" | "fields">>) => void;
};

export const MAX_COPIES = 2000;
const clampCopies = (n: number) => Math.min(MAX_COPIES, Math.max(1, Math.round(n) || 1));

/** Labels waiting to be printed (in memory; a print job is saved on the server when printed). */
export const usePrintList = create<PrintListState>((set, get) => ({
  lines: [],
  template: null,
  fields: defaultLabelFields,
  source: null,
  add: (item, copies) => {
    const existing = get().lines.find((l) => l.item.barcodeId === item.barcodeId);
    if (existing) {
      set({ lines: get().lines.map((l) => (l.item.barcodeId === item.barcodeId ? { ...l, copies: clampCopies(l.copies + 1) } : l)) });
      return "more";
    }
    set({ lines: [...get().lines, { item, copies: clampCopies(copies ?? Math.max(1, item.stock)) }] });
    return "added";
  },
  setCopies: (barcodeId, copies) => set({ lines: get().lines.map((l) => (l.item.barcodeId === barcodeId ? { ...l, copies: clampCopies(copies) } : l)) }),
  remove: (barcodeId) => set({ lines: get().lines.filter((l) => l.item.barcodeId !== barcodeId) }),
  clear: () => set({ lines: [], source: null }),
  load: (lines, source) => set({ lines: lines.map((l) => ({ ...l, copies: clampCopies(l.copies) })), source }),
  set: (patch) => set(patch)
}));

export function totalLabels(lines: PrintLine[]) {
  return lines.reduce((n, l) => n + l.copies, 0);
}
