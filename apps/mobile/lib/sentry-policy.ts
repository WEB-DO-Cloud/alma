import { createRequire } from "node:module";
import { isVendorSentryHost } from "@rakazo/logging/monitoring";

const require = createRequire(import.meta.url);

/** Loaded from CJS so Expo's config evaluator can use the same check. */
export const sentryUploadAllowed = (
  require("./sentry-upload.cjs") as {
    sentryUploadAllowed: (env: Record<string, string | undefined>) => boolean;
  }
).sentryUploadAllowed;

const OFF = new Set(["0", "false", "off", "no"]);

/** True when a DSN is a Sentry-protocol collector that is not sentry.io. */
export function isSelfHostedSentryDsn(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (!url.username) return false;
    if (!/\/[\w-]+$/.test(url.pathname)) return false;
    return !isVendorSentryHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Mobile reporting stays off unless the server offers a self-hosted DSN.
 * `EXPO_PUBLIC_SENTRY_ENABLED=0` turns that off too. A hosted sentry.io DSN is never used.
 */
export function mobileReportingEnabled(
  dsn: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env.EXPO_PUBLIC_SENTRY_ENABLED?.trim().toLowerCase();
  if (flag && OFF.has(flag)) return false;
  if (!dsn) return false;
  return isSelfHostedSentryDsn(dsn);
}
