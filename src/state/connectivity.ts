import * as Network from "expo-network";
import { create } from "zustand";

/**
 * Online/offline as the app experiences it: the OS network state, corrected by what actually
 * happens to API calls (a network error means offline even if Wi-Fi claims to be connected).
 */
type Connectivity = {
  online: boolean;
  /** When the last successful API call happened. */
  lastOnlineAt: number | null;
  setOnline: (online: boolean) => void;
};

export const useConnectivity = create<Connectivity>((set, get) => ({
  online: true,
  lastOnlineAt: null,
  setOnline: (online) => {
    if (get().online !== online || online) set({ online, lastOnlineAt: online ? Date.now() : get().lastOnlineAt });
  }
}));

let started = false;

/** Start listening to the OS network state (called once at app start). */
export function startConnectivityMonitor() {
  if (started) return () => undefined;
  started = true;
  Network.getNetworkStateAsync()
    .then((state) => {
      if (state.isConnected === false || state.isInternetReachable === false) useConnectivity.getState().setOnline(false);
    })
    .catch(() => undefined);
  const sub = Network.addNetworkStateListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    useConnectivity.getState().setOnline(online);
  });
  return () => {
    started = false;
    sub.remove();
  };
}
