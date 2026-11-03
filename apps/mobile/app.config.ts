import type { ConfigContext, ExpoConfig } from "expo/config";

declare function require(id: string): {
  sentryUploadAllowed: (env: NodeJS.ProcessEnv) => boolean;
};

const { sentryUploadAllowed } = require("./lib/sentry-upload.cjs");

const RELEASE_PROFILES = new Set(["production", "android-apk", "diagnostic"]);
const ALMA_PRODUCTION_API = "https://app.alma.com.do";

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || ALMA_PRODUCTION_API;
  if (RELEASE_PROFILES.has(process.env.EAS_BUILD_PROFILE ?? "")) {
    let parsed: URL;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error("EXPO_PUBLIC_API_URL must be a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for production builds.");
    }
  }

  let result = config as ExpoConfig;
  const rpId = passkeyRpId(apiUrl);
  if (rpId) {
    // Native passkeys only work for domains the binary is associated with, so the app reads the
    // same list at runtime to hide passkeys on other servers. Developer mode makes a
    // development-signed build fetch the association file itself, for a server on a private
    // network or VPN that Apple's CDN cannot reach.
    const mode = process.env.RAKAZO_PASSKEY_DEVELOPER_MODE === "1" ? "?mode=developer" : "";
    result = {
      ...result,
      ios: {
        ...result.ios,
        associatedDomains: [
          ...(result.ios?.associatedDomains ?? []),
          `webcredentials:${rpId}${mode}`,
        ],
      },
      extra: { ...result.extra, passkeyRpIds: [rpId] },
    };
  }

  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (googleServicesFile) {
    result = { ...result, android: { ...result.android, googleServicesFile } };
  }

  const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (easProjectId) {
    const extra = result.extra ?? {};
    const eas =
      extra.eas && typeof extra.eas === "object" ? (extra.eas as Record<string, unknown>) : {};
    result = { ...result, extra: { ...extra, eas: { ...eas, projectId: easProjectId } } };
  }

  // Upload hooks talk to hosted Sentry unless SENTRY_URL is a self-hosted collector.
  if (sentryUploadAllowed(process.env)) {
    result = {
      ...result,
      plugins: [
        ...(result.plugins ?? []),
        [
          "@sentry/react-native/expo",
          {
            organization: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            url: process.env.SENTRY_URL,
          },
        ],
      ],
    };
  }
  return result;
};

/** The default server's host when native passkeys can use it: HTTPS and a domain name. */
function passkeyRpId(apiUrl: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(apiUrl ?? "");
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !host.includes(".")) return null;
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host)) return null;
  return host;
}
