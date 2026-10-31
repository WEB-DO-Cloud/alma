// Metro has no Node built-ins. lib/sentry-policy.ts uses createRequire only to load the
// build-time upload check, which never applies at runtime, so the bundle gets this stub.
function createRequire() {
  return function bundledRequire(id) {
    if (String(id).includes("sentry-upload")) {
      return { sentryUploadAllowed: () => false };
    }
    throw new Error(`Unsupported Node built-in in the app bundle: ${id}`);
  };
}
module.exports = { createRequire };
