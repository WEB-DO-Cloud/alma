# ALMA mobile app

*   **Author:** WEB-DO-Cloud/alma
*   **Status:** Historical. The phone menu in this document was removed. See `docs/designs/alma-restore-original-ui.md`.
*   **Date:** 2026-10-26

--------------------------------------------------------------------------------

## Overview

ALMA is a phone app for licensed Dominican law firms. It prepares drafts for a named lawyer to review. A draft cannot leave until that lawyer has had it open for a forced minimum time, has seen the difference from the original text, and has confirmed professional responsibility for the result.

The app is the existing Expo client in `apps/mobile`, with ALMA screens on top. The same repository also has the firm API. This document describes the phone product and the release path that builds it. It does not replace the API's own draft rules. The phone repeats those rules so a lawyer cannot tap Approve early. The API rejects the same request if the phone is wrong.

## The Problem

A firm needs a phone client that can take a dictated or typed request, keep the result as a draft, and show that draft to the lawyer who is allowed to approve it. The previous phone client was a general chat product. It could send notifications that contained case text, it could report errors to a hosted collector, and its store path could publish a binary without a separate manual step.

The phone has to be usable before a firm API is online, so a labeled sample mode exists. That mode must be impossible to mistake for a client file, and it must not ship in a store binary.

## Goals

*   A signed-in lawyer can open a draft, see insertions and deletions against the original text, wait out `requiredReviewDurationMs` (the firm's `minimumReviewSeconds` times the block count in CUJ 1), check the fixed Spanish confirmation, and approve or reject. The approval log stores the lawyer's name, the card number from that lawyer's row, `openedAt`, `approvedAt`, the model already stored on the draft, both SHA-256 hashes, and the diff.
*   Someone who is not an approver can read a draft and cannot approve it.
*   A push the server sends is always the visible title `ALMA` and the body `Hay un borrador pendiente de revisión`. A tap opens the thread named in the payload data. It does not open a draft by title.
*   Error reporting to hosted `sentry.io` stays off. A self-hosted collector can be used. `EXPO_PUBLIC_SENTRY_ENABLED=0` turns reporting off even then.
*   Visible product wording is "borradores para revisión" and the store name `ALMA - Asistente Privado`. The app does not call itself a lawyer or give legal advice.
*   iOS and Android release builds run on Bitrise through fastlane. TestFlight and the Play internal track are manual workflows. Nothing in this repository submits an App Store review or promotes a Play release.
*   `EXPO_PUBLIC_ALMA_MOCK=1` shows labeled sample data with no firm API.

## Non-Goals

*   The phone does not edit firm letterhead, lawyer roster, or the minimum review time. Those stay on the firm web app.
*   The phone does not choose where the firm API is hosted. A production API is operated in the Dominican Republic. The client has no geofence.
*   The phone does not create Apple certificates. Match on CI is read-only. The first `fastlane match appstore` and `fastlane match development` run happens on a machine that can sign in to Apple, against `https://github.com/WEB-DO-Cloud/alma-certificates`.
*   The phone does not submit to the App Store or to a Play track other than internal.
*   The phone does not replace the existing chat, bots, or computer stack. ALMA screens call the same API.
*   Store icon art is not final. The checked-in icon is a placeholder.
*   Native module class names that the operating system never shows stay as they are.

## Open Questions

*   **Push transport.** The Expo project id was removed so this app does not receive the previous product's updates. Delivery through Expo's push service is not the store plan. See Planned additions. Until a direct APNs and FCM sender exists, `sanitizePushPayload` still defines the only text a push may carry.
*   **Match init.** The certificates repository exists and is empty. Match has not been run. CI cannot create the first certificates.
*   **Store screenshots.** Spanish captures from sample data are a release input. The web bundle exports, then the page stays blank: startup calls a native module and `__fbBatchedBridgeConfig` is not set. This environment has no Android emulator and no iOS simulator, so no capture was saved. The metadata lanes still skip screenshot upload.
*   **Sample review clock.** One sample draft uses a 3 second clock so a demo can reach Approve. The firm setting shown in sample data is still 60 seconds. A store binary must not be built with sample mode on.

## Critical User Journeys (CUJs)

### CUJ 1: A named lawyer approves a draft

*   **Given**: The firm API is up. The signed-in user is linked to a lawyer with `mayApproveDrafts`. `requiredReviewDurationMs` clamps `minimumReviewSeconds` to an integer from 30 to 1800, default 60, then multiplies by the number of blocks. A block is `Math.ceil(originalText.length / 1500)` and is at least 1, so an empty original still waits one block. `length` is a JavaScript string length (UTF-16 code units). The first `drafts/open` sets `openedAt` and status `in_review`. A later open keeps that `openedAt`. `drafts/save` changes `editedText` and does not move `openedAt`. The clock is server time minus `openedAt`, and it counts while the app is backgrounded. `reviewTimeSatisfied` is true when that elapsed time is greater than or equal to the required duration.
*   **When**: The lawyer opens the draft. The phone calls `drafts/open`, which starts the server clock. The screen shows the diff, a countdown, and the sentence `He revisado este borrador y asumo la responsabilidad profesional de su contenido`. The lawyer checks that sentence and taps Approve only after the countdown reaches zero.
*   **Then**: The phone calls `drafts/approve` with `confirmation: true`, the lawyer id, and the edited text. The API refuses the call if the draft was not opened, the user is not that lawyer, the clock has not elapsed, or `confirmation` is not `true`. On success it stores an approval log row with the lawyer, the card number, the open and approve times, the model, both hashes, and the diff. The original text is unchanged.

### CUJ 2: A reader who cannot approve

*   **Given**: The signed-in user is not linked to an approver.
*   **When**: They open a draft.
*   **Then**: Approve and Reject stay disabled. `drafts/approve` and `drafts/reject` both call `requireLawyer`. The API rejects either call from this user.

### CUJ 3: A push arrives

*   **Given**: The server wants to tell a phone that a draft is waiting.
*   **When**: A push is built.
*   **Then**: `sanitizePushPayload` in `packages/core/src/push-notice.ts` replaces the visible title and body. They are `ALMA` and `Hay un borrador pendiente de revisión`. The current sender is Expo (`packages/adapters/src/expo-push.ts`). Its `data` object still carries `kind`, `botId`, `threadId`, `deliveryId`, and, when present, `spaceId` and `groupId`. `collapseId` and `tag` are the thread id. Those fields are identifiers, not the client name or the draft title. A tap uses `apps/mobile/lib/open-notification.ts`, which opens the thread route from that data when a session exists. It does not open a draft by name. Several waiting drafts stay in the draft list.

### CUJ 4: Sample data before an API exists

*   **Given**: The binary was started with `EXPO_PUBLIC_ALMA_MOCK=1`.
*   **When**: The app launches.
*   **Then**: It opens the ALMA home without a session. Every sample screen shows `Datos de ejemplo`. Drafts, chat, firm details, and the computer task list come from `apps/mobile/lib/alma-mock.ts`. Approve still waits for that sample draft's clock and the same confirmation checkbox. No network call is required.

### CUJ 5: The computer screen

*   **Given**: A bot has a screen URL from `computer/screenUrl`.
*   **When**: The lawyer opens the computer row.
*   **Then**: The WebView is drawn with `pointerEvents="none"`, so touches do not reach the remote desktop. A Stop control calls `threads/stop` and `computer/stop`. In sample mode there is no screen URL. The screen shows the sample task name and Stop does not call the network.

## Technical Plan (Architecture)

```text
Phone (Expo, apps/mobile)
  ALMA screens  -->  alma-client.ts
                         |  EXPO_PUBLIC_ALMA_MOCK=1
                         v
                    alma-mock.ts (on device, labeled)
                         |  otherwise
                         v
                    firm API (oRPC)
                         drafts/list, drafts/get, drafts/open,
                         drafts/save, drafts/approve, drafts/reject,
                         draftApprovals/list, organization/get,
                         computer/screenUrl, computer/stop, threads/stop
                         |
                         v
                    packages/db draft rules
                    (clock, lawyer link, confirmation, hashes, diff log)

Push text: packages/core sanitizePushPayload
           (always the same title and body)

Errors: phone reporting stays off unless the API offers a
        self-hosted DSN. sentry.io, sentry-cdn.com, and their
        subdomains are refused.
```

The ALMA home is `apps/mobile/app/alma.tsx`. From there the lawyer opens drafts, chat, the read-only computer, the approval history, read-only firm details, and About. With sample mode on, the root layout replaces `/` and `/sign-in` with `/alma`.

The review screen is `apps/mobile/app/draft-review.tsx`. It renders `diffDraftText` from `packages/core/src/draft-review.ts`. Insertions and deletions are separate text styles. `reviewGate` in `apps/mobile/lib/alma-review.ts` enables Approve only when the user may approve, a lawyer id is present, the draft is not already finished, no request is in flight, the remaining seconds are zero, and the confirmation checkbox is checked. Reject is available to an approver before the timer ends, and after, until the draft is finished. The checkbox label is the constant `DRAFT_CONFIRMATION`. That Spanish sentence is not translated. The API stores `confirmation: true`. It does not store the sentence. The sentence exists so the lawyer sees the same words the product requires.

Firm details on the phone are read-only. The screen says `Estos datos se editan en la web del bufete.` Switching space calls `selectSpace` when sample mode is off.

Chat uses the existing thread stack. The empty chat says `Escriba o dicte. ALMA deja el resultado como borrador para revisión.` About says `ALMA prepara borradores para revisión. Un abogado del bufete los revisa y aprueba antes de que salgan.` and `ALMA no sustituye el criterio profesional de quien revisa.`

### Compliance constraints

| Constraint | Where it is enforced |
| --- | --- |
| Named lawyer | API `requireLawyer` matches the user email to a lawyer with `mayApproveDrafts`. The phone hides Approve when `canApprove` is false or no lawyer id is linked. |
| Minimum open time | API `reviewTimeSatisfied` uses the server clock and `requiredReviewDurationMs`. The phone countdown uses the `openedAt` and `requiredReviewMs` the API returned. A phone clock cannot approve early. |
| Diff | The phone draws `diffDraftText`. The API writes that same diff into the approval log. The original text and original hash cannot be updated. |
| Confirmation | The phone shows `DRAFT_CONFIRMATION` and sends `confirmation: true` only if the box is checked. The API rejects any other confirmation value. |
| Push text | `sanitizePushPayload` replaces any title and body before send. |
| No hosted Sentry | `isVendorSentryHost` matches `sentry.io`, `sentry-cdn.com`, and any subdomain of either. `mobileReportingEnabled` ignores those DSNs. `sentryUploadAllowed` in `apps/mobile/lib/sentry-upload.cjs` refuses source-map upload to those hosts. Upload also needs `SENTRY_AUTH_TOKEN` and a `SENTRY_URL` that fails that same host test. `EXPO_PUBLIC_SENTRY_ENABLED` set to `0`, `false`, `off`, or `no` turns reporting off. Any other value, including unset, does not by itself turn reporting on. |
| Firm API, not a phone geofence | Production firm data is stored by the firm API, which is operated in the Dominican Republic. The phone sends draft text to the configured API URL, or keeps sample data on the device. It does not check the API's region, and it does not anonymize identifiers on the device. Hosted Sentry is refused. Visible push text does not name a client or a matter. The store sentence in Planned additions is not built. |
| Wording | Store listing name `ALMA - Asistente Privado`. Subtitle and description use "borradores para revisión". About uses the two sentences quoted in the architecture section, plus the Apache-2.0 Rakazo notice. |

### Release pipeline

fastlane `2.241.1` lives in `apps/mobile`. Lanes:

| Lane | Result |
| --- | --- |
| `ios simulator` | Simulator build. No signing. |
| `ios archive` | Signed archive. No upload. |
| `ios beta` | TestFlight upload. `skip_submission: true`. Does not submit for review. |
| `ios metadata` | Metadata only. `submit_for_review: false`. `skip_screenshots: true`. |
| `android debug` | Debug APK. No store upload. |
| `android apk` | Signed APK for sharing. No Play upload. |
| `android aab` | Signed app bundle. No Play upload. |
| `android internal` | Play internal track only. Does not promote. |
| `ios screenshots`, `android screenshots` | Maestro flow `apps/mobile/.maestro/alma-screenshots.yaml` with sample mode and Spanish. Needs a booted simulator or emulator. Not a Bitrise workflow. |
| `release` | Refuses in both cases. If `ALMA_STORE_RELEASE_APPROVED` is not exactly `yes`, it stops and names `ios beta` and `android internal`. If it is `yes`, it still stops and does not submit. |

`bitrise.yml` runs `mobile-tests` on pull requests and on `main`. That workflow installs with `pnpm install --frozen-lockfile`, then `pnpm db:generate`, then the mobile unit tests and the push, Sentry, monitoring, and app-association tests. Generate does not open a database connection. The dummy `DATABASE_URL` is set only on the generate command. The Android and iOS workflows do not import the database package, so they do not generate the client.

Manual workflows, not in `trigger_map`: `android-debug`, `android-apk`, `android-aab`, `ios-simulator`, `ios-archive`, `manual-testflight`, `manual-play-internal`. iOS uses stack `osx-xcode-27.1.x`. Android and unit tests use `ubuntu-resolute-26.04-bitrise-2026-android`.

Match reads certificates from `MATCH_GIT_URL`, defaulting to `https://github.com/WEB-DO-Cloud/alma-certificates`. CI passes `readonly: true`. `MATCH_PASSWORD` is never written in the repo.

Bundle id and Android package are `do.alma.app`. The display name is ALMA.

### Secrets handling

Secrets are Bitrise secrets or local environment variables. The repo stores names and instructions in `docs/mobile-release.md`. It does not store values.

| Name | Use |
| --- | --- |
| `MATCH_PASSWORD` | Decrypts the certificates repo. Required for signed iOS builds. |
| `MATCH_GIT_URL` | Optional override of the certificates repo. |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64 `username:token` for HTTPS, or an SSH deploy key PEM. |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect key id. |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | App Store Connect issuer id. |
| `APP_STORE_CONNECT_API_KEY` | Contents of the `.p8` key. |
| `APPLE_TEAM_ID` | Apple Developer team id. |
| `ITC_TEAM_ID` | Optional App Store Connect team id when it differs. |
| `SUPPLY_JSON_KEY_DATA` | Play service-account JSON, as text. |
| `ANDROID_KEYSTORE_BASE64` or `ANDROID_KEYSTORE_PATH` | Android upload key. |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Upload key unlock. |
| `EXPO_PUBLIC_API_URL` | Firm API. Use HTTPS unless the build is sample mode (`EXPO_PUBLIC_ALMA_MOCK=1`). The client does not reject another scheme. |
| `EXPO_PUBLIC_ALMA_MOCK` | `1` only for sample-data builds. Not for a store binary. |
| `EXPO_PUBLIC_DEFAULT_UI_LOCALE` | Screenshot builds set `es`. A normal build follows the saved choice, then the device language, then English. |
| `EXPO_PUBLIC_SENTRY_ENABLED` | `0` forces reporting off. |
| `SENTRY_URL`, `SENTRY_AUTH_TOKEN` | Self-hosted collector only. A vendor host is ignored. |
| `ALMA_STORE_RELEASE_APPROVED` | Leave unset. The release lane refuses when it is unset. Setting it to `yes` still does not submit. |
| `BITRISE_USE_UPLOADED_SIGNING` | `true` only to install profiles uploaded in the Bitrise UI instead of match. |
| `DATABASE_URL` | Present only for `pnpm db:generate` inside `mobile-tests`. Not a production database. |

## Alternatives Considered

### Alternative A: A separate native app

*   **Pros**: No shared chat code. A smaller binary.
*   **Cons**: A second client to keep in line with the API, and a second release pipeline.
*   **Reason for Rejection**: The firm already has an Expo client that can sign in, call the API, and show a computer stream. ALMA adds screens and gates on that client.

### Alternative B: Phone-only approval, with the API trusting the phone

*   **Pros**: Fewer API checks. The countdown would be enough.
*   **Cons**: A modified client could approve immediately.
*   **Reason for Rejection**: `approveReviewDraft` in `packages/db/src/draft-review.ts` repeats the lawyer, clock, and confirmation checks. The phone gate is there so the lawyer is not offered an action the API will reject.

### Alternative C: Put the client or matter name in the push

*   **Pros**: The lawyer can tell which file is waiting without opening the app.
*   **Cons**: The push vendor is outside the firm, and the title can be read on a lock screen.
*   **Reason for Rejection**: The notification is generic. The draft is loaded from the API after the lawyer opens the app.

### Alternative D: Publish from the Bitrise pull-request workflow

*   **Pros**: One less manual click.
*   **Cons**: A pull request could upload a binary, and a metadata lane could submit for review if the flags were wrong.
*   **Reason for Rejection**: Store uploads are manual workflows. `skip_submission` and `submit_for_review: false` are set in the lanes. The `release` lane refuses.

--------------------------------------------------------------------------------

## Non-Functional Requirements

### Security and privacy

Draft text, lawyer names, and firm details move between the phone and the firm API over the configured API URL. Sample mode keeps them on the device. Session tokens use the existing secure store. The computer view does not accept touches. Stop is the only computer action.

Hosted Sentry is not a reporting path. Push text is constant. Approval records include the lawyer's card number and name because the firm needs to know who accepted the draft. Those records stay in the firm API.

The client does not prove that the API is in the Dominican Republic. An operator can point `EXPO_PUBLIC_API_URL` at another host. Production operation is responsible for keeping that host in the Dominican Republic.

### Performance

The diff is a word-level longest-common-subsequence on the draft the lawyer is reading. Drafts are firm documents, not unbounded streams. No extra cache or queue was added.

### Rollout and rollback

Sample mode is an environment flag, default off. Store binaries leave it unset. OTA updates are disabled (`updates.enabled` is false in `apps/mobile/app.json`). A bad binary is rolled back by shipping another build through the same manual TestFlight or Play internal lane. Database migrations for drafts are the API's, and they follow the repository rule that a migration must keep working with the previous API during a deploy.

--------------------------------------------------------------------------------

### Additional Resources

*   `docs/mobile-release.md` — Bitrise secrets, match init, and workflow table.
*   `packages/db/src/draft-review.ts` — server approval checks.
*   `packages/core/src/push-notice.ts` — push sanitizer.
*   `apps/mobile/lib/sentry-policy.ts` and `apps/mobile/lib/sentry-upload.cjs` — hosted Sentry refusal.
*   [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model) — review method for this document.

### Future Improvements

*   **Final store icon.** Replace the placeholder and remove the About line that says the icon is a placeholder.
*   **Match init.** Run `fastlane match appstore` and `fastlane match development` once, outside CI.
*   **Screenshots.** Capture Spanish sample-data screens into `apps/mobile/fastlane/screenshots/` when a simulator or emulator is available. The metadata lanes currently skip screenshot upload.
*   **Store additions.** See [Planned additions](#planned-additions-awaiting-damiens-spec-approval-do-not-implement-yet). Do not build them from this document.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

This work is already on the branch. The steps below are the decisions a later change has to preserve. They are not a second implementation. The Planned additions section is out of scope for every file below.

### Target Files to Create/Modify

#### 1. `apps/mobile/app/alma.tsx`, `drafts.tsx`, `draft-review.tsx`, `draft-approvals.tsx`, `alma-chat.tsx`, `alma-computer.tsx`, `firm.tsx`, `about.tsx` (Create)

*   **Type / Scope**: Expo Router screens.
*   **Proposed Changes**: Home leads with the drafts-for-review sentence. Draft list, review gate, approval history, chat, read-only computer with Stop, read-only firm details, and About. About includes the Apache-2.0 Rakazo notice and the placeholder-icon note.

#### 2. `apps/mobile/lib/alma-review.ts`, `alma-client.ts`, `alma-mock.ts`, `alma-copy.ts` (Create)

*   **Type / Scope**: TypeScript modules.
*   **Proposed Changes**: `reviewGate` and `DRAFT_CONFIRMATION` as specified in CUJ 1. `alma-client.ts` calls the oRPC procedures listed in the architecture diagram, or the sample module when `isMockMode()` is true. Sample copy includes `Datos de ejemplo`. The approvable sample draft is titled `Instancia de entrega` and its `requiredReviewMs` is 3,000, which is shorter than the production floor. The sample firm's displayed `minimumReviewSeconds` is 60. The phone uses the draft's `requiredReviewMs` and does not recompute it in sample mode.

#### 3. `packages/db/src/draft-review.ts` and `packages/core/src/draft-review.ts` (Modify)

*   **Type / Scope**: Server and shared draft rules.
*   **Proposed Changes**: `requiredReviewDurationMs` lives in `packages/core/src/draft-review.ts`. It clamps `minimumReviewSeconds` to 30–1800, default 60, then multiplies by `Math.max(1, Math.ceil(originalText.length / 1500))` and by 1000. `approveReviewDraft` in `packages/db/src/draft-review.ts` requires `confirmation === true`, a lawyer whose email matches the user and whose id was sent, status `in_review`, an `openedAt`, and `reviewTimeSatisfied` (`elapsed >= required`). Hashes are SHA-256 hex of the UTF-8 text. The diff tokenizes on whitespace and runs a word-level longest common subsequence. The log stores that diff, both hashes, the lawyer name, the card number from the lawyer row, the model fields already on the draft, `openedAt`, and `approvedAt`. The original text and original hash cannot be updated. A second open does not replace `openedAt`.

#### 4. `packages/core/src/push-notice.ts` (Modify)

*   **Type / Scope**: Shared push helper.
*   **Proposed Changes**: `sanitizePushPayload` returns only `ALMA` and `Hay un borrador pendiente de revisión`.

#### 5. `apps/mobile/lib/sentry-policy.ts`, `apps/mobile/lib/sentry-upload.cjs`, `apps/mobile/app.config.ts` (Modify)

*   **Type / Scope**: Expo config and runtime reporting policy.
*   **Proposed Changes**: Runtime reporting and source-map upload both refuse `sentry.io` and `sentry-cdn.com`. `app.config.ts` loads the upload check through the CJS file because the Expo config evaluator cannot import the TypeScript module directly.

#### 6. `apps/mobile/app/sign-in.tsx` and `apps/mobile/lib/locales/*.ts` (Modify)

*   **Type / Scope**: Existing auth screen and catalogs.
*   **Proposed Changes**: English headings are `Sign in to ALMA` and `Create your ALMA account`. The other catalogs translate those headings. Settings strings that named the previous product now say ALMA.

#### 7. `bitrise.yml`, `apps/mobile/fastlane/Fastfile`, `Appfile`, `Matchfile`, `Gemfile`, `docs/mobile-release.md` (Create or Modify)

*   **Type / Scope**: Release config.
*   **Proposed Changes**: Workflows and lanes in the release pipeline section. `mobile-tests` runs `pnpm db:generate` after install. Matchfile default git URL is the certificates repo. `MATCH_PASSWORD` is not hardcoded.

### Verification Plan

*   **Unit tests**: `pnpm --filter @rakazo/mobile test` covers the review gate, the 60 second boundary, the untranslated confirmation sentence, sample mode, Sentry refusal, and the Bitrise and fastlane guards in `apps/mobile/lib/store-release.test.ts`.
*   **Shared checks**: `packages/core/src/push-notice.test.ts` asserts the sanitized title and body and that a case-like body does not pass through. `packages/adapters/src/expo-push.test.ts` asserts the sent body. `packages/db/src/draft-review.test.ts` asserts the early clock, the missing confirmation, and the lawyer check. `apps/api/src/monitoring.test.ts` and `apps/api/src/app-association.test.ts` cover reporting and the app link.
*   **Bitrise**: `mobile-tests` is the pull-request workflow. It generates the Prisma client before those tests. Store lanes are not triggered by a pull request.
*   **Screenshots**: `apps/mobile/.maestro/alma-screenshots.yaml` expects `Borradores para revisión`, `Datos de ejemplo`, and `Instancia de entrega` when sample mode and Spanish are on. It is not run in `mobile-tests`.
*   **Not in this plan**: Running match, TestFlight, or Play upload. The Planned additions section (account deletion, content reporting, the 18+ rating, Dominican Republic transcription, direct APNs and FCM, and on-device anonymization) is not implemented and has no tests yet.

--------------------------------------------------------------------------------

## Planned additions (awaiting Damien's spec approval, do not implement yet)

These are store requirements. They are not in the app. Do not build them, do not add strings for them, and do not change the push sender until that spec is approved. A drift check should treat their absence as expected.

Today, dictation uses on-device speech recognition (`apps/mobile/lib/dictation.ts`). Push sending goes through Expo (`packages/adapters/src/expo-push.ts`). The phone does not anonymize identifiers before a model call, and it does not offer account deletion or content reporting.

*   **Eliminar cuenta.** An in-app flow labeled `Eliminar cuenta` deletes the signed-in account. A public web page explains the same deletion path for someone who no longer has the app. Both are required by the stores. The page is public. It does not require a session to read.
*   **Reportar contenido.** AI output shows a control labeled `Reportar contenido`. The report goes to the firm. It is not a second model call.
*   **Age rating.** The store listing is 18+. The binary does not ask the device for an age. The rating is listing metadata.
*   **Voice.** Speech is transcribed on the Dominican Republic server. The audio is deleted as soon as transcription returns, including when transcription fails, and a crash must not leave a copy. The recording is not sent to a hosted speech vendor and is not written into the draft. Only the transcript remains, and it stays under the draft rules. Today’s on-device recognizer stays until this is approved. Approval has to say whether a store build may still use it.
*   **Push transport.** Notifications are sent directly through APNs and FCM. They are not sent through Expo's push service. The title and body stay the sanitized pair: `ALMA` and `Hay un borrador pendiente de revisión`.
*   **Data-flow wording.** The store sentence is: client data stays in the Dominican Republic, and identifiers are anonymized on the office device before anything goes to the model, except where a read-only portal view needs those identifiers inside the Dominican Republic. That portal view does not send the identifiers to the model. This is not implemented. The current client still sends requests to whatever API URL it is given, and it does not strip identifiers on device.

Approval has to decide these points before anyone writes code. This document does not decide them.

*   Which records `Eliminar cuenta` deletes, and which approval-log fields the firm keeps.
*   Whether the public page only explains deletion or also accepts a deletion request, and how that request proves who is asking.
*   Where a `Reportar contenido` report is stored, which fields it may contain, and what sample mode does with it.
*   The Apple age-rating value and the Play questionnaire answers that the listing calls 18+.
*   Which host transcribes, and that a failed transcription deletes the audio.
*   The APNs and FCM credentials, and whether a build may still send through Expo until those exist.
*   Which device is the office device, which fields are identifiers, and which screen is the read-only portal.

--------------------------------------------------------------------------------

Goldfish review of this document, including Planned additions, is recorded in `docs/designs/reviews/2026-10-26-alma-mobile-app.md`.

*Drafted with EGM*
