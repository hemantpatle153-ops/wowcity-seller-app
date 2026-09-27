import type { TokenStore } from "./tokenStore";

export type { TokenStore } from "./tokenStore";

/** Web preview only (demo/mock builds): the browser has no secure enclave, so use sessionStorage. */
const KEY = "wowcity.refreshToken";
const storage = () => (typeof window !== "undefined" ? window.sessionStorage : null);

export const secureTokenStore: TokenStore = {
  getRefreshToken: async () => storage()?.getItem(KEY) ?? null,
  setRefreshToken: async (token) => storage()?.setItem(KEY, token),
  clear: async () => storage()?.removeItem(KEY)
};
