# Store release builds: signing and native fixes

Status: implemented for the first App Store and Play builds (owner approved publishing on 2026-10-31).

## Problem
The release lanes added in PR #3 had never produced a store build. Three things stop them:
1. **iOS signing.** `expo prebuild` leaves the Xcode target on automatic signing with no team, and CI ran match read-only against an empty `alma-certificates` repo, so no distribution certificate or profile could exist.
2. **Android package name.** `do` is a reserved word in Java and Kotlin, so the generated `package do.alma.app` sources do not compile.
3. **Bundle.** `lib/sentry-policy.ts` imports `node:module`, which Metro cannot resolve in the app bundle.

## Design
- `sync_certificates` calls `setup_ci` on CI (temporary keychain). match stays read-only on CI unless the build parameter `ALMA_MATCH_CREATE=true` is passed for the one-time run that creates the App Store certificate and profile. It is not a standing secret.
- After match, `use_match_signing!` switches the `ALMA` target to manual signing with `APPLE_TEAM_ID`, the "Apple Distribution" identity and match's App Store profile, and gym exports with the same profile mapping.
- After an Android prebuild, `scripts/fix-android-namespace.mjs` moves the Gradle namespace and Kotlin package to `app.alma`. The Play package (`applicationId`) stays `do.alma.app`. The Gradle heap goes to 4 GB.
- `metro.config.js` resolves `node:module` to `node-module-shim.js`, whose `createRequire` only answers the build-time Sentry upload check (always false at runtime).

## Not changed
No UI, no app behavior, no store submission. The `release` lane still refuses to submit for review or promote.

## Verification
- Android: the same namespace and shim steps produced the working preview APKs (1.0.9) and the signed release AAB.
- iOS: `manual-testflight` on Bitrise with `ALMA_MATCH_CREATE=true` once, read-only afterwards.
