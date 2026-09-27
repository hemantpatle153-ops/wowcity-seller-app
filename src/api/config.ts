/** Build-time configuration from EXPO_PUBLIC_* variables. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://wowcity.in/api/v1").replace(/\/+$/, "");
export const MOCK_MODE = process.env.EXPO_PUBLIC_MOCK === "1" || process.env.EXPO_PUBLIC_MOCK === "true";
