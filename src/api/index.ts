import { secureTokenStore } from "@/auth/tokenStore";
import { useConnectivity } from "@/state/connectivity";
import { ApiClient } from "./client";
import { API_URL, MOCK_MODE } from "./config";
import { createEndpoints } from "./endpoints";

type SessionEndedListener = (reason: string) => void;
const listeners = new Set<SessionEndedListener>();

/** Subscribe to "the server ended this session" (refresh failed); the auth store signs out. */
export function onSessionEnded(listener: SessionEndedListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// In mock mode every request is answered by the in-app fixture server (src/mock), so the whole app,
// including token refresh, runs without a backend.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFetch: typeof fetch | undefined = MOCK_MODE ? require("@/mock/server").mockFetch : undefined;

/** Every request also tells the connectivity store whether the network actually works. */
const trackedFetch = (async (input: string, init?: RequestInit) => {
  try {
    const response = await (mockFetch ?? fetch)(input, init);
    useConnectivity.getState().setOnline(true);
    return response;
  } catch (error) {
    if (!init?.signal?.aborted) useConnectivity.getState().setOnline(false);
    throw error;
  }
}) as typeof fetch;

export const apiClient = new ApiClient({
  baseUrl: MOCK_MODE ? "https://mock.wowcity.local/api/v1" : API_URL,
  tokenStore: secureTokenStore,
  fetch: trackedFetch,
  onSessionEnded: (reason) => listeners.forEach((listener) => listener(reason))
});

export const api = createEndpoints(apiClient);
export { ApiError, errorMessage } from "./errors";
export { MOCK_MODE } from "./config";
