/** Shared by connection settings and reporting before the full API module can load. */
export const API_BASE_STORAGE_KEY = "rakazo.api_base";
/** Loopback used only when a compile-time URL is not a usable http(s) origin. */
export const LOCAL_API = "http://127.0.0.1:3100";
/** Hosted ALMA API. Store builds and a binary with no compile-time URL use this. */
export const PRODUCTION_API = "https://app.alma.com.do";
const configuredApi = process.env.EXPO_PUBLIC_API_URL?.trim();
export const DEFAULT_API = configuredApi ? configuredApi : PRODUCTION_API;
