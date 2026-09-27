import { create } from "zustand";
import type { SaveResult } from "./save";

/** The bill just saved, for the receipt screen. */
export const useLastReceipt = create<{ result: SaveResult | null; change: number; set: (result: SaveResult, change: number) => void }>((set) => ({
  result: null,
  change: 0,
  set: (result, change) => set({ result, change })
}));
