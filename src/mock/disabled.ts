/**
 * Stand-in for src/mock/server.ts in normal builds (metro.config.js swaps it in unless
 * EXPO_PUBLIC_MOCK is on), so the fake backend and demo sign-ins never ship to shops.
 */
export const mockFetch: typeof fetch | undefined = undefined;
export const demoCredentials: string | null = null;
export function setMockOffline(_value: boolean) {}
export function isMockOffline() {
  return false;
}
