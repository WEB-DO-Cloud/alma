---
title: Restore original Rakazo UI - Plan
type: refactor
date: 2026-10-27
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Restore original Rakazo UI - Plan

## Goal Capsule

- Objective: After sign-in, a person uses the original Rakazo home and thread on the phone and the original web shell, still under the ALMA name and logos, with no sample-data menu and no new microphone, while calls and the server's speech and draft approval keep working.
- Means: Remove the phone menu and the added Dictate control, and leave the approved rebrand, hidden model setup, web voice buttons, and server behavior in place (KTD1, KTD3).
- Authority: This request overrides the earlier phone-menu design. Product vision still prefers one calm product across surfaces. Stop if a change would revert the rebrand, the hidden model setup, web Hold-to-talk and Call visibility, or server speech, approval, or organization settings.
- Execution: One pull request against main. Do not merge it. Do not build or upload an app binary, and do not start a Bitrise or store workflow.
- Done by: The implementer opens the pull request. The maintainer merges.

---

## Product Contract

### Summary

People land on the original Rakazo home after sign-in. The phone menu for sample data, drafts, firm, and about is gone, and so is the Dictate button added beside the composer. The ALMA name and logos, hidden model setup, existing call and web talk controls, and the server's speech and approval behavior stay.

### Problem Frame

The phone gained a separate menu and a new microphone on top of Rakazo. That menu can take over the home screen in sample-data mode, and the Account screen links to it even when sample data is off. The owner wants the original product surfaces back, with only the rebrand, the hidden model setup, and voice on controls Rakazo already had.

### Key Decisions

- Original home only. (session-settled: user-directed — chosen over keeping the ALMA menu and sample-data mode: the product keeps the original Rakazo UI plus the approved rebrand, hidden model setup, and existing voice controls.) Governs R1, R2.
- No new microphone. (session-settled: user-directed — chosen over adding a replacement mic: the original composer has a Call control and no mic, so none is added.) Governs R4.
- Web talk controls stay. (session-settled: user-directed — chosen over reverting the web Hold-to-talk and Call visibility change.) Governs R5.
- Rebrand stays. (session-settled: user-directed — chosen over reverting the name, logos, larger splash, and the black logo above sign-in and sign-up.) Governs R6.
- Hidden model setup stays. (session-settled: user-directed — chosen over restoring the model picker in onboarding and settings.) Governs R7.
- Server behavior stays. (session-settled: user-directed — chosen over reverting managed model, the Grok Build CLI, speech-to-text, text-to-speech, the approval gate, and organization settings.) Governs R8.

### Requirements

- R1. After sign-in, the phone opens the original inbox and the web app opens the original shell, including the signup survey and onboarding paths that already belonged to those flows.
- R2. The phone menu, its screens, sample-data mode, and the Account group that opens them are gone. The original agent computer screen remains.
- R3. Copy, imports, and tests that exist only for the removed screens are removed. A short design note records what was removed and why.
- R4. The phone composer has no Dictate or Dictar control. The original Call control remains and still uses the existing call transcription path. No microphone control is added.
- R5. Web Hold-to-talk and Call still appear under the same operator-voice conditions they use now.
- R6. The visible product name stays ALMA. The larger splash and the black logo above sign-in and sign-up stay.
- R7. Model and voice setup stay hidden when the operator runtime supplies them.
- R8. Server managed model, the Grok Build CLI, speech-to-text, text-to-speech, the draft approval gate, and organization settings keep working.

### Key Flows

- F1. Sign in on the phone
  - **Trigger:** A person finishes sign-in, or opens the app with a saved session.
  - **Steps:** The app shows the inbox. It does not replace that route with the removed menu. The signup survey still runs when that path already applied.
  - **Outcome:** The original home is the landing surface.
  - **Covered by:** R1, R2
- F2. Talk from a thread
  - **Trigger:** A person opens a bot thread with an empty draft.
  - **Steps:** The composer offers Call. It does not offer Dictate. Starting Call uses the existing call path, including server transcription when that path already does.
  - **Outcome:** Voice on the phone is the original Call control.
  - **Covered by:** R4, R8

### Acceptance Examples

- AE1. Covers R1, R2. Given a signed-in phone session, when the home route opens, the inbox is shown and no sample-data menu is reachable from home or Account.
- AE2. Covers R4. Given an empty draft for a selected bot and no active call, when the composer renders, Call is available and Dictate is not.
- AE3. Covers R5, R6. Given operator voice is on, when the web composer renders, Hold-to-talk and Call follow the current visibility rules, and sign-in still shows the black ALMA logo.

### Scope Boundaries

- The rebrand, splash, sign-in logo, hidden model setup, web voice-button visibility, original Call control, original agent computer, and server speech, approval, and organization settings stay.
- Web draft review, the approval log, and the organization settings panel stay. They landed before the phone menu. See Assumptions.
- Store listing text, app icon assets, and microphone permission strings stay. This change does not ship a binary.
- Do not merge. Do not build or upload an APK or IPA. Do not start Bitrise or a store upload.

#### Deferred to Follow-Up Work

- Removing the web draft-review and approval-log pages, if the owner later wants those earlier screens gone as well.

### Sources

- Phone menu commit `5576e205` and the later Account links and layout redirect.
- Dictate commit `b94538a6` on `apps/mobile/app/thread.tsx` and `apps/mobile/components/thread-composer.tsx`.
- Web draft routes introduced in `14ea83f3`, before the phone menu.
- `docs/designs/alma-mobile-app.md` still specifies the phone menu, sample mode, and the mock screenshot flow as current requirements. `docs/mobile-release.md` and the iOS and Android screenshot lanes in `apps/mobile/fastlane/Fastfile` still start sample mode and run `apps/mobile/.maestro/alma-screenshots.yaml`.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Delete the phone menu by removing its route files and both entry points, the mock redirect and the Account group. Hiding the menu behind the sample-data flag would leave that mode reachable. Governs R1, R2.
- KTD2. Do not delete `apps/web/src/pages/DraftReview.tsx`, `apps/web/src/pages/DraftApprovalLog.tsx`, or `apps/web/src/pages/OrganizationSettingsPanel.tsx`. Pull request #3 and later did not add a web copy of the phone menu. The server behavior those pages call must keep working. Governs R8.
- KTD3. Remove the Dictate pressable, the thread wiring that feeds it, the composer text-insert handle that exists only for it, and `apps/mobile/lib/server-dictation.ts` once nothing imports it. Keep the Call pressable, the dictation-availability import used by calls, the call session, and the spoken-reply language argument in `apps/mobile/lib/voice.ts`. Governs R4, R8.
- KTD4. Delete `apps/mobile/.maestro/alma-screenshots.yaml`, the release-doc steps that require that flow, and the Fastlane screenshot helper and lanes that set sample mode and run it. Do not add a replacement screenshot lane. Leave the store upload lanes alone. Governs R2, R3.
- KTD5. Add `docs/designs/alma-restore-original-ui.md`. Mark `docs/designs/alma-mobile-app.md` as a historical record of the menu spec and point it at the new note. Do not rewrite that document's earlier requirements, and do not rewrite the rebrand or voice design docs. Governs R3.

### Assumptions

- The web draft-review, approval-log, and organization-settings screens from the two server pull requests stay, including the links between them. The opening request can be read as removing every non-original screen. The numbered bound is web equivalents added with the phone menu or later, and those pages are earlier.
- The phone signup survey and the web onboarding and integrations setup paths stay. Landing on the original home includes those existing gates.
- Microphone purpose strings in the mobile app config stay, because this change does not ship a binary and those strings are not the removed screens.

### Sequencing

U1 removes the menu and its tests. U2 removes the Dictate control after the menu's chat screen no longer imports the shared transcription helper. U3 updates the design and release notes once the deleted flow is known.

---

## Implementation Units

### U1. Remove the phone menu

- **Goal:** The phone no longer has the menu, sample-data mode, or Account links to those screens.
- **Requirements:** R1, R2, R3
- **Dependencies:** None
- **Files:**
  - Delete `apps/mobile/app/alma.tsx`, `apps/mobile/app/alma-chat.tsx`, `apps/mobile/app/alma-computer.tsx`, `apps/mobile/app/drafts.tsx`, `apps/mobile/app/draft-review.tsx`, `apps/mobile/app/draft-approvals.tsx`, `apps/mobile/app/firm.tsx`, `apps/mobile/app/about.tsx`
  - Delete `apps/mobile/components/alma-screen.tsx`, `apps/mobile/lib/alma-client.ts`, `apps/mobile/lib/alma-copy.ts`, `apps/mobile/lib/alma-copy.test.ts`, `apps/mobile/lib/alma-mock.ts`, `apps/mobile/lib/alma-mock.test.ts`, `apps/mobile/lib/alma-review.ts`, `apps/mobile/lib/alma-review.test.ts`
  - Delete `apps/mobile/.maestro/alma-screenshots.yaml`
  - Modify `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(settings)/account.tsx`, and `apps/mobile/fastlane/Fastfile`
- **Approach:**
  - Remove the stack registrations, the full-window route names, the mock hydration, and the effect that replaces home or sign-in with the menu.
  - Remove the Account group and the copy import that exists only for it.
  - Keep `apps/mobile/app/computer.tsx` and the inbox route.
  - Keep sign-in branding, splash, and the index title that belongs to the rebrand.
  - In the Fastfile, remove the mock screenshot helper and the iOS and Android screenshot lanes that set sample mode and run the deleted flow. Do not add a replacement lane. Leave the certificate, bump, metadata, archive, and store-upload lanes as they are.
- **Patterns to follow:** Expo file routes already disappear when the file is deleted. Settings groups in Account are the pattern for what to delete.
- **Test scenarios:**
  - Happy path: the layout module no longer imports mock mode, and it does not replace `/` or `/sign-in` with `/alma`.
  - Edge: a previously stored sample-data flag has no screen that reads it and no redirect that honors it.
  - Integration: Account settings no longer render links to `/alma`, `/drafts`, `/alma-chat`, `/alma-computer`, `/draft-approvals`, `/firm`, or `/about`.
  - Failure: any remaining import of a deleted module fails typecheck.
  - Integration: the Fastfile no longer sets the sample-mode switch and no longer names the deleted Maestro flow. The existing store-lane test still expects TestFlight and Play internal uploads only.
- **Verification:** Mobile unit tests and the mobile typecheck pass with those modules gone. The store-lane test still passes.

### U2. Remove the added Dictate control

- **Goal:** The phone composer offers the original Call control and no Dictate button, while calls still reach server transcription.
- **Requirements:** R4, R5, R8
- **Dependencies:** U1
- **Files:**
  - Modify `apps/mobile/components/thread-composer.tsx` and `apps/mobile/lib/thread-composer.test.tsx`
  - Modify `apps/mobile/app/thread.tsx`
  - Modify `apps/mobile/lib/locales/de.ts`, `apps/mobile/lib/locales/es.ts`, `apps/mobile/lib/locales/ja.ts`, `apps/mobile/lib/locales/nl.ts`, `apps/mobile/lib/locales/ru.ts`, `apps/mobile/lib/locales/zh.ts`
  - Delete `apps/mobile/lib/server-dictation.ts` if nothing imports it after the thread and menu chat changes
- **Approach:**
  - Remove the optional dictate callback, the dictating flag, the pressable, and the text-insert handle if only dictation uses it.
  - One focus effect fetches the account and voice status together. Keep the account read that sets upload limits, whether a model is still needed, and whether the operator model is on. Remove only the voice-status read, the dictation flag, and the Dictate wiring. Do not delete that effect.
  - Narrow the dictation import back to availability for the call plan. Keep Call, the call session, and the spoken-reply language argument.
  - Remove the Dictate locale entries. Leave the Listening string, which team conversation settings still use.
  - Do not change `apps/web/src/pages/shell/composer.tsx`, `apps/web/src/pages/Shell.tsx`, or server voice modules.
- **Patterns to follow:** The Call pressable already in the composer is the control that stays. The composer test that presses Call is the pattern for the assertion that remains.
- **Test scenarios:**
  - Happy path: with no dictate callback, the composer has no button labeled Dictate, and an empty draft for a bot with no active call still shows Call and invokes the call starter.
  - Edge: a non-empty draft still shows Send rather than Call, as it does now.
  - Integration: the thread module no longer imports the microphone transcription helper, the call plan still receives dictation availability, and the same focus effect still records upload limits and the managed-model flags from the account read.
  - Failure: Spanish and the other locale overlays no longer define Dictate, and the locale completeness check still passes.
- **Verification:** The composer unit test and the mobile typecheck pass. The web composer test still expects Hold-to-talk and Call when operator voice is on.

### U3. Record the restoration

- **Goal:** A reader can see what left the product and why, and the release notes no longer require the deleted screenshot flow.
- **Requirements:** R3
- **Dependencies:** U1, U2
- **Files:**
  - Create `docs/designs/alma-restore-original-ui.md`
  - Modify `docs/mobile-release.md` and the status line of `docs/designs/alma-mobile-app.md`
- **Approach:**
  - The note names the removed phone menu and Dictate control, the landing surfaces that remain, the original Call control, and the rebrand, hidden model setup, web voice buttons, and server behavior that stay.
  - In the release doc, remove the requirement to set sample mode and run the deleted Maestro flow. Do not add a new screenshot workflow.
  - On `docs/designs/alma-mobile-app.md`, change the status line so it says the menu spec is historical and points at `docs/designs/alma-restore-original-ui.md`. Leave the rest of that document, and the rebrand and voice design docs, unchanged.
- **Test scenarios:**
  - Test expectation: none -- these are documentation edits. The mobile release doc is prose, and the screenshot flow is not part of the mobile unit-test script.
- **Verification:** The new note exists. The release doc and the Fastfile no longer name the deleted flow or the sample-mode screenshot switch. The phone-menu design doc's status line marks it as history.

---

## Verification Contract

| Check | Command | Applies to |
|---|---|---|
| Mobile unit tests | `pnpm --filter @rakazo/mobile test` | U1, U2 |
| Mobile typecheck | `pnpm --filter @rakazo/mobile check` | U1, U2 |
| Web unit tests | `pnpm --filter @rakazo/web test` | U2, for the untouched composer cases |
| Lint | `pnpm lint` | U1, U2, U3 |

Do not run the desktop Playwright suite locally. Do not run Maestro, Bitrise, or a store build. `apps/mobile` test script does not include the deleted screenshot flow.

---

## Definition of Done

- U1, U2, and U3 match their verification lines.
- The pull request is open against main and is not merged.
- No app binary was built or uploaded, and no Bitrise or store workflow was started.
- The pull request lists every file removed or changed, what a person sees after sign-in on the web and on the phone, and that the original Call control remains while no separate mic was added.
- Abandoned experiments are not left in the diff.
