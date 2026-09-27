import { createMemoryStore } from "./memoryStore";
import type { OfflineStore } from "./types";

const KEY = "wowcity.offline.v1";

/** Web (demo/mock builds): memory with localStorage so queued bills survive a reload. */
export const offlineStore: OfflineStore = createMemoryStore({
  load: () => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save: (data) => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable: memory still works for this session.
    }
  }
});
