import * as SecureStore from "expo-secure-store";

/** Refresh token lives in the device keychain/keystore. The access token is only ever kept in memory. */
const KEY = "wowcity.refreshToken";

export type TokenStore = {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
};

export const secureTokenStore: TokenStore = {
  getRefreshToken: () => SecureStore.getItemAsync(KEY),
  setRefreshToken: (token) => SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync(KEY)
};
