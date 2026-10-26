const OFF = new Set(["0", "false", "off", "no"]);
const VENDOR_HOST = /(^|\.)(sentry\.io|sentry-cdn\.com)$/i;

/** Expo config loads this with Node. The upload plugin defaults to sentry.io. */
function sentryUploadAllowed(env) {
  if (!env.SENTRY_AUTH_TOKEN?.trim()) return false;
  const flag = env.EXPO_PUBLIC_SENTRY_ENABLED?.trim().toLowerCase();
  if (flag && OFF.has(flag)) return false;
  const url = env.SENTRY_URL?.trim();
  if (!url) return false;
  try {
    return !VENDOR_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

module.exports = { sentryUploadAllowed };
