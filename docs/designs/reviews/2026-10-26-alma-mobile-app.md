# Goldfish review: ALMA mobile app

*   **Document:** `docs/designs/alma-mobile-app.md`
*   **Date:** 2026-10-26
*   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model) review passes. Each reviewer was a fresh session. Each session was told to read only the design document, its persona, and the matching standard. Reviewers did not receive the application source.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness. The Planned additions section was in the document for every pass.

## Resolutions applied to the document

*   **Review clock.** The document now states the implemented formula: clamp 30–1800 seconds, default 60, at least one block, `Math.ceil(length / 1500)` on a JavaScript string, times 1000. The first open sets `openedAt`. A later open and a save do not move it. Satisfaction is `elapsed >= required`.
*   **Release lane.** Unset refuses and names `ios beta` and `android internal`. `yes` still refuses to submit. Both sentences in the earlier draft were true and read as a contradiction.
*   **Push text and push data.** Visible title and body are the fixed Spanish pair. The Expo payload still carries thread, bot, space, and delivery identifiers. A tap opens the thread route from that data. It does not select a draft by title.
*   **Hashes and diff.** SHA-256 hex of the UTF-8 text. The diff splits on whitespace.
*   **Sentry hosts.** The check includes subdomains of `sentry.io` and `sentry-cdn.com`. Unset `EXPO_PUBLIC_SENTRY_ENABLED` does not turn reporting on by itself.
*   **Sample draft.** The approvable sample is titled `Instancia de entrega` and uses a 3 second clock. That is shorter than the production floor. Sample mode trusts `requiredReviewMs`.
*   **Firm-API row.** Renamed so it does not claim the phone geofences. The store sentence stays in Planned additions and is not built.
*   **Planned additions placement.** Moved to after the implementation plan so it is not inside the work breakdown. The heading is unchanged. The implementation plan says the section is out of scope.
*   **Undecided store points.** Account-deletion scope, the public page's write path, report storage, the Apple and Play rating answers, transcription failure, APNs and FCM credentials, and the anonymization exception are listed as questions approval has to answer. They are not designed here.

## Accepted without a code change

*   **Do not build the store additions.** Reviewers asked for endpoints, retention, and credentials. Those stay undecided until the spec is approved. Absence from the code is expected.
*   **The clock does not restart when the lawyer edits.** Reviewers called that a hole. The implemented rule is first-open, server elapsed time, including while the app is backgrounded. Changing it would be a new product rule. It is documented, not changed.
*   **Expo is still the sender.** Direct APNs and FCM are planned and not started. The sanitizer stays on the current sender.
*   **On-device dictation stays.** Server transcription that deletes the audio is planned. The current recognizer is not removed.
*   **No cost, timeline, or exam metrics.** Those are outside this design. The document does not invent them.
*   **No maximum draft size, and the approval log does not store the confirmation sentence.** Neither exists in the code. They were not added.
*   **Heilmeier payoffs and a second full re-audit.** The zoom-out pass on the document that already contained Planned additions returned no findings. The later edits clarify behavior that is already in the code. They do not add a feature.

## Drift check

Checked the review clock, the first-open rule, save leaving `openedAt` alone, SHA-256 hashing, the whitespace diff, the Expo data fields, the Sentry host suffix, the release lane, the sample draft title and 3 second clock, and the read-only computer WebView against the current source. Those match the document.

`Eliminar cuenta`, `Reportar contenido`, the 18+ listing, Dominican Republic transcription, direct APNs and FCM, and on-device anonymization are absent from the code. The document says not to build them. That absence is not drift.

## Store screenshots

The web bundle exports. Opening it shows a blank page. The console error is `__fbBatchedBridgeConfig is not set, cannot invoke native modules`. That is a runtime native-bridge failure, not the earlier missing `ReactNativePrivateInitializeCore` import. Stubbing every native module the app touches at startup is not a small change, and it would not be the store binary. `emulator` and `adb` are not installed, and this machine cannot run an iOS simulator. No screenshot was written under `apps/mobile/fastlane/screenshots/`.

## Structural note

One pass marked the Planned additions heading as an extra H2 between Future Improvements and the implementation plan. The heading is required. It now follows the implementation plan, so the template's implementation section is uninterrupted.
