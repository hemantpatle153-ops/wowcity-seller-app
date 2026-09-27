import { createSqliteStore } from "./sqliteStore";
import type { OfflineStore } from "./types";

/** Native: SQLite on the device. */
export const offlineStore: OfflineStore = createSqliteStore();
