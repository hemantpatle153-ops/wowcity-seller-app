import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AccentName, AppearanceMode, TextSize } from "@/theme/tokens";

export type PaperWidth = 58 | 80;
export type ReceiptFormat = "thermal" | "a4";

export type Preferences = {
  appearance: AppearanceMode;
  accent: AccentName;
  textSize: TextSize;
  /** "system" follows the phone's reduce-motion setting; "on" always reduces motion. */
  reduceMotion: "system" | "on";
  haptics: boolean;
  scanSound: boolean;
  paperWidth: PaperWidth;
  receiptFormat: ReceiptFormat;
  printerName: string | null;
  printerAddress: string | null;
  autoPrintAfterSave: boolean;
  /** Store the person last billed in, per shop code. */
  lastStoreByShop: Record<string, string>;
  /** Pre-fills the staff sign-in form on shared counter phones. */
  lastShopCode: string;
  lastUsername: string;
};

type Actions = {
  set: (patch: Partial<Preferences>) => void;
  rememberStore: (shopCode: string, storeId: string) => void;
  reset: () => void;
};

export const defaultPreferences: Preferences = {
  appearance: "system",
  accent: "blue",
  textSize: "default",
  reduceMotion: "system",
  haptics: true,
  scanSound: true,
  paperWidth: 80,
  receiptFormat: "thermal",
  printerName: null,
  printerAddress: null,
  autoPrintAfterSave: false,
  lastStoreByShop: {},
  lastShopCode: "",
  lastUsername: ""
};

export const usePreferences = create<Preferences & Actions>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      set: (patch) => set(patch),
      rememberStore: (shopCode, storeId) => set((state) => ({ lastStoreByShop: { ...state.lastStoreByShop, [shopCode]: storeId } })),
      reset: () => set(defaultPreferences)
    }),
    { name: "wowcity.preferences.v1", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);
