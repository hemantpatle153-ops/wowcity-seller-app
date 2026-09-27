import { useEffect } from "react";
import { create } from "zustand";

type ScanState = { pending: { target: string; code: string; at: number } | null; deliver: (target: string, code: string) => void; take: (target: string) => string | null };

/** Hands a scanned code from the scanner route back to the screen that asked for it. */
export const useScanResult = create<ScanState>((set, get) => ({
  pending: null,
  deliver: (target, code) => set({ pending: { target, code, at: Date.now() } }),
  take: (target) => {
    const pending = get().pending;
    if (!pending || pending.target !== target) return null;
    set({ pending: null });
    return pending.code;
  }
}));

/** Calls `onCode` when a scan for `target` arrives. */
export function useScanListener(target: string, onCode: (code: string) => void) {
  const pending = useScanResult((s) => s.pending);
  useEffect(() => {
    if (pending?.target === target) {
      const code = useScanResult.getState().take(target);
      if (code) onCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, target]);
}
