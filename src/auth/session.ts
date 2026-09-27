import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { create } from "zustand";
import { api, apiClient, onSessionEnded } from "@/api";
import type { Tokens } from "@/api/client";
import type { MeResponse } from "@/api/types";
import { ApiError } from "@/api/errors";
import { usePreferences } from "@/state/preferences";
import { useConnectivity } from "@/state/connectivity";

const ME_CACHE = "wowcity.me.v1";

export type SessionStatus = "loading" | "signedOut" | "signedIn";

type SessionState = {
  status: SessionStatus;
  me: MeResponse | null;
  /** Store the person is billing in. */
  storeId: string | null;
  /** Signed in from cache while the server was unreachable. */
  offlineSession: boolean;
  /** Why the last session ended (shown on the sign-in screen). */
  endedReason: string | null;
  bootstrap: () => Promise<void>;
  signIn: (tokens: Tokens) => Promise<MeResponse>;
  refreshMe: () => Promise<MeResponse | null>;
  selectStore: (storeId: string) => void;
  signOut: (options?: { remote?: boolean; reason?: string }) => Promise<void>;
};

export function deviceInfo() {
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || Device.deviceName || (Platform.OS === "web" ? "Web browser" : "Phone");
  return { deviceName: name.slice(0, 80), platform: Platform.OS.slice(0, 20), appVersion: Application.nativeApplicationVersion ?? "1.0.0" };
}

function pickStore(me: MeResponse, current: string | null) {
  const ids = me.stores.map((store) => store.id);
  if (current && ids.includes(current)) return current;
  const remembered = usePreferences.getState().lastStoreByShop[me.shopCode];
  if (remembered && ids.includes(remembered)) return remembered;
  return ids.length === 1 ? ids[0] : null;
}

async function cacheMe(me: MeResponse | null) {
  try {
    if (me) await AsyncStorage.setItem(ME_CACHE, JSON.stringify(me));
    else await AsyncStorage.removeItem(ME_CACHE);
  } catch {
    // Cache is best effort.
  }
}

async function cachedMe(): Promise<MeResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_CACHE);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  me: null,
  storeId: null,
  offlineSession: false,
  endedReason: null,

  bootstrap: async () => {
    const restored = await apiClient.restore();
    if (restored === "signedOut") {
      await cacheMe(null);
      set({ status: "signedOut", me: null, storeId: null });
      return;
    }
    if (restored === "offline") {
      // No network: keep billing with the last known profile; the queue posts when we are back online.
      const me = await cachedMe();
      if (!me) {
        set({ status: "signedOut" });
        return;
      }
      useConnectivity.getState().setOnline(false);
      set({ status: "signedIn", me, storeId: pickStore(me, get().storeId), offlineSession: true });
      return;
    }
    try {
      const me = await api.me();
      await cacheMe(me);
      set({ status: "signedIn", me, storeId: pickStore(me, get().storeId), offlineSession: false, endedReason: null });
    } catch (error) {
      const me = await cachedMe();
      if (me && error instanceof ApiError && error.isNetwork) set({ status: "signedIn", me, storeId: pickStore(me, get().storeId), offlineSession: true });
      else set({ status: "signedOut" });
    }
  },

  signIn: async (tokens) => {
    await apiClient.setTokens(tokens);
    const me = await api.me();
    await cacheMe(me);
    set({ status: "signedIn", me, storeId: pickStore(me, null), offlineSession: false, endedReason: null });
    return me;
  },

  refreshMe: async () => {
    try {
      const me = await api.me();
      await cacheMe(me);
      set({ me, storeId: pickStore(me, get().storeId), offlineSession: false });
      return me;
    } catch {
      return get().me;
    }
  },

  selectStore: (storeId) => {
    const me = get().me;
    if (me) usePreferences.getState().rememberStore(me.shopCode, storeId);
    set({ storeId });
  },

  signOut: async ({ remote = true, reason } = {}) => {
    if (remote) {
      try {
        await api.auth.logout();
      } catch {
        // Signing out locally always works, even offline.
      }
    }
    await apiClient.clear();
    await cacheMe(null);
    set({ status: "signedOut", me: null, storeId: null, offlineSession: false, endedReason: reason ?? null });
  }
}));

onSessionEnded((reason) => {
  if (useSession.getState().status === "signedIn") void useSession.getState().signOut({ remote: false, reason });
});

/** The selected store object. */
export function useCurrentStore() {
  const me = useSession((s) => s.me);
  const storeId = useSession((s) => s.storeId);
  return me?.stores.find((store) => store.id === storeId) ?? null;
}
