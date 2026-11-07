# Phase 2C engagement

*   **Status:** Reviewed. The resolutions in the next section override any sentence they name.
*   **Date:** 2026-11-07
*   **Author:** ALMA overlay. Upstream Rakazo files change only where this note names them.
*   **Do not merge, deploy, or start a store build.** The owner approves each pull request.

## Review resolutions

A zero-context review read only this note. These sentences override any earlier sentence they touch. They do not add a feature.

*   **Flag off.** `FORBIDDEN` and the `*_disabled` code apply only to RPCs added for that flag. `gateToolCall` and `ExpoPushProvider.deliver` stay as they are today when their flag is off.
*   **Rewards flag.** The reader is `readReferralRewardsConfig` in `packages/core/src/referral-prompt.ts`. Exact `true` throws `referral rewards are not approved` and never returns enabled. Any other value is off and does not throw. The new function `blockedReferralReward` returns before any provider call. It is the only new reward code. Stripe is not called.
*   **Existing grants.** With the prompt flag off, `createReferrals` is unchanged. With the prompt flag on and the existing reward switch false, `claim` inserts one `referrals` row and calls neither `grantBalanceCredit` nor `extendByokFreePeriod`. With the prompt flag on and that switch true, today's claim and settle run once, including today's grant. This note does not add a second grant. `paidAt` is set only when today's settle grants or declines. When the prompt flag is on, the reward switch is false, and `recordActivationEvent` writes `payment_completed` for the referred organization, set `paidAt` if it is null and do not grant.
*   **Activation.** `activatedAt` is set once, on the first `task_completed` whose `organizationId` is the referred organization's id. Another user's event in a different organization does not set it.
*   **Hold list.** `phase2a_external_hold` applies to `send_email`, to `mirrorMessagingOutbound`, and to a connector tool whose name contains the substring `send`, whose `readOnly` is not true, and whose connector kind is outside the Phase 2A payment set. `send_email` stores channel `email`, recipient `to[0]`, body `text`. `mirrorMessagingOutbound` stores channel `whatsapp` and is not given a draft by this pull request: the mirror returns without sending and without a draft, because it has no recipient argument. A connector hold stores channel `other`, recipient argument `to` when it is a string, otherwise the hold creates no draft. Body is argument `text` when it is a string, otherwise argument `body` when it is a string. Missing recipient or body creates no draft. In every hold case the tool function is not called.
*   **No sender.** This pull request does not call `claimDraft` and does not add a caller. `dispatchAfter` passing leaves status `approved`. Cancel of `approved` sets `cancelled`. Cancel of `dispatching` returns `phase2a_in_flight`. Cancel of `sent`, `failed`, or `unknown` returns `phase2a_already_sent`. The screen string for that code is `undo.alreadySent`, which names the draft status and does not say the recipient got a message. This slice's own drafts show `undo.notSent` while they are `approved`. The push body for a new approval is `undo.notSent`. Tap opens the queue. No notification action is registered. When notify policy is also on, `decidePush` replaces that body with `notify.needsYou`.
*   **Notify wins.** When `ALMA_NOTIFY_POLICY` is on, `ExpoPushProvider.deliver` sends only the `decidePush` result. A digest body becomes `notify.updates`. `kind` is kept only when it is `approval_waiting`, `deadline`, `failure`, or `digest`.
*   **Digest job.** Only the worker runs `scanDigests`, once a minute. It selects subscriptions with `enabled` true. It runs `buildDigest` first. `{ empty: true }` inserts nothing and pushes nothing. Otherwise it inserts, and the worker that loses the unique key does not push or email. Push and email run only after that insert commits. Email stays, because the backlog asks for optional email, default off. Subject is `digest.pushDaily` or `digest.pushWeekly`. The body is the two counts and the two link strings. No retry. A missing provider, a missing `user.email`, or a send error leaves the issue and shows no error.
*   **Quiet hours.** If either minute is null, or the minutes are equal, quiet hours are off. If start is less than end, a minute matches from start inclusive to end exclusive. If start is greater than end, a minute matches when it is greater than or equal to start or less than end. Channel `in_app` does not call Expo. Channel `push` or `both` calls Expo for urgent pushes, and for routine pushes outside the window. No row means `both`.
*   **Batch.** At most one row per user with `sentAt` null. A second routine push updates nothing. The row stores `userId` and `kind` `routine` only. Flush claims with `flushingAt` null or older than 5 minutes, sends one `notify.updates` push, sets `sentAt`, and does not delete the row.
*   **Practice marks.** `report_run_marks` has `userId` and `spaceId` copied from the run. The shared tenant rule applies. The report reads marks for the signed-in user only.
*   **Seal.** Seal `voice_transcripts.text`, `noteTitle`, and `noteBody`, and `referral_share_texts.body`. Owner column `userId`. Space column `spaceId` on the transcript. The share-text table has no `spaceId`; its policy is `userId` only.
*   **Transcript row.** Unique `(userId, artifactId)`. Insert the row first. Only the insert winner calls `transcribeVoice`. A second call updates `text` and leaves `status`, `noteTitle`, and `noteBody` as they are.
*   **Personal context.** The `work_contexts` row in that space with `kind` `personal` and `ownerUserId` equal to the user, oldest `createdAt` if several. No row means no `work_records` insert and no outbound draft. The tool is still not called.
*   **Schedule zone.** A non-empty valid IANA name on `user.timezone` is used. Null, empty, and any other string use `America/Santo_Domingo`.
*   **Monday.** The implemented default is on. Open decision 5 is a confirmation before the flag is set in production, not a choice the pull request leaves open.
*   **One-hand.** The phone queue screen shows the existing Approve, Save, and Cancel actions at 44 points. It adds no command. When send undo is on, the approved-row Cancel label is `undo.button`.
*   **Hours.** The line shows `count * 5` minutes and `count * 15` minutes, plus `report.hours`. It does not convert to hours.
*   **Share sentence.** The default is the copy-table value. It does not say that ALMA sends.
*   **Compose.** The eight names are copied the same way `ALMA_PHASE2A` is copied, including the `x-app-environment` anchor. Grants use role `rakazo_app`.

The feedback backlog lists seven items. This note is the one design for all seven. Each item ships in its own pull request, behind its own flag, default off. ND01 and ND02 stay two flags. They are not one feature.

## Brainstorm

These alternatives were rejected:

*   A new speech vendor, a Dominican-accent model, or an `es-DO` voice id. The server already transcribes and speaks through the managed voice path. This work does not add a provider, a voice id, or a language code.
*   A model-written summary of a voice note. A model can add facts that were not in the audio. The note is the transcript, split into a title and a body, and the user edits both before saving.
*   Calling a mailbox or a calendar to fill the morning summary. This product has no first-party mail store and no first-party calendar store. Sections without a row are omitted.
*   Attaching the email or messaging sender at the end of the undo window. Phase 2A approves text and does not call a provider. This slice keeps that rule. Turning the undo flag on stops the immediate send. It does not start a new send.
*   A home-screen shortcut, a biometric module, or a notification action that edits `app.json`, an entitlement, or a version number. Those wait for a store build the owner approves. This slice ships the pure routing and the on-screen controls.
*   A second referral reward (coupon or balance credit) or a change to the reward path that already ships. The new prompt does not grant anything. `ALMA_REFERRAL_REWARDS=true` is rejected at startup.

## Problem

A person in the Dominican Republic dictates in Spanish or English, receives voice notes, and wants the words on screen before anything is saved. Reply playback already exists. Uploaded audio does not become an editable transcript.

On the phone, pending drafts are a settings screen, not a one-hand review. Camera and share-sheet upload already exist. Home-screen shortcuts and a biometric app lock need a store build.

Nothing sends a morning or Monday summary. Push notifications can put message text on the lock screen. There is no quiet-hours rule and no split between an urgent alert and a routine one.

Phase 2A (`ALMA_PHASE2A`, merged, default off) stores an outbound draft, approves an exact hash, and sets `dispatchAfter`. It does not call a provider. `externalSendHold` in `packages/core/src/phase2a.ts` refuses clinical, filing, price, and payment tools. It does not hold `send_email` or a messaging reply, so those still run when the flag is on. There is no user setting for 0, 10, 30, or 60 seconds, and no Undo control. Nothing may say a sent message was recalled.

There is no monthly page of what was done. There is no practice-versus-real split. Referral codes already exist per organization and can grant a free period when billing rewards are configured. There is no post-win share prompt, no editable share sentence, and no signup-then-activation-then-paid timestamps that stay reward-free.

## Goals

With every flag below off, current voice, pushes, sends, referrals, and screens behave as they do today.

With a flag on, only that flag's behavior changes. Two flags interact only where this note says so.

## Non-goals

*   No new paid provider, no new mailbox, no new calendar connector, no new speech vendor.
*   No provider call after the undo window. No status and no label means sent or delivered. The words "recall", "recalled", and "unsend" do not appear in copy or error text.
*   No Stripe coupon, no new balance credit, no change to the existing referral grant.
*   No edit to `apps/mobile/app.json`, `app.config.ts` permission strings, entitlements, `expo.version`, iOS `buildNumber`, or Android `versionCode`.
*   No merge, no deploy, no store build.

## Flags

Each reader returns enabled only when the value is exactly `true`. `1`, `yes`, and `TRUE` are off. An empty value is off. Readers do not read each other's names, except `readSendUndoConfig`, which requires Phase 2A as stated in Undo.

| Env | Reader | On `me` | Default |
| --- | --- | --- | --- |
| `ALMA_VOICE_NOTES` | `readVoiceNotesConfig` in `packages/core/src/voice-notes.ts` | `voiceNotesEnabled` | off |
| `ALMA_MOBILE_ACTIONS` | `readMobileActionsConfig` in `packages/core/src/mobile-actions.ts` | `mobileActionsEnabled` | off |
| `ALMA_DIGEST` | `readDigestConfig` in `packages/core/src/digest.ts` | `digestEnabled` | off |
| `ALMA_NOTIFY_POLICY` | `readNotifyPolicyConfig` in `packages/core/src/notify-policy.ts` | `notifyPolicyEnabled` | off |
| `ALMA_SEND_UNDO` | `readSendUndoConfig` in `packages/core/src/send-undo.ts` | `sendUndoEnabled` | off |
| `ALMA_MONTHLY_REPORT` | `readMonthlyReportConfig` in `packages/core/src/monthly-report.ts` | `monthlyReportEnabled` | off |
| `ALMA_REFERRAL_PROMPT` | `readReferralPromptConfig` in `packages/core/src/referral-prompt.ts` | `referralPromptEnabled` | off |
| `ALMA_REFERRAL_REWARDS` | same file | not on `me` | off, and `true` throws |

`loadEnv` in `apps/api/src/env.ts` and worker startup in `apps/worker/src/index.ts` (next to `readPhase2aConfig`) call every reader. A throw fails startup before serving.

`ALMA_REFERRAL_REWARDS=true` throws the error `referral rewards are not approved`. Any other value is off and does not throw.

`ALMA_SEND_UNDO=true` while `ALMA_PHASE2A` is not exactly `true` throws the error `send undo requires phase 2a`. When send undo is off, Phase 2A is not required.

Add the eight names to `x-app-environment` in:

*   `infra/compose/docker-compose.yml`
*   `infra/compose/docker-compose.images.yml`
*   `infra/compose/docker-compose.prod.yml`

Duplicate them on the api service where `ALMA_PHASE2A` is duplicated. The worker inherits the anchor. Empty values pass the host value through only when it is set. The phone and the web app do not read the env names. They read the `me` booleans.

`meDto` in `apps/api/src/routes/shared.ts` sets each boolean from `deps.env`. The fields are optional on `MeSchema` in `packages/contracts/src/domain.ts`. Absent means off. `MobileMe` in `apps/mobile/lib/mobile-types.ts` lists the same booleans.

Flag off: every new procedure throws `FORBIDDEN` with the flag's code (`voice_notes_disabled`, `mobile_actions_disabled`, `digest_disabled`, `notify_policy_disabled`, `send_undo_disabled`, `monthly_report_disabled`, `referral_prompt_disabled`) and writes nothing.

## Shared rules

New tables are empty. The previous release does not read them. Ids are Prisma `cuid()`. Adding a table is safe for the previous release.

Tenant policies use `USING` and `WITH CHECK`. System policies are `USING ((SELECT app_rls_bypass()))` and nothing else. Grants are `SELECT, INSERT, UPDATE, DELETE` to the application role, matching `20261120120000_phase2a_foundation`. A row is visible when `userId` equals `app.user_id`. Where a table has `spaceId`, `USING` and `WITH CHECK` also require `spaceId` equal to `app.space_id`. Inserts set `userId` to `app.user_id`.

User-written prose is sealed when content encryption is on, the same way `work_records.body` is sealed. The columns are named in Voice notes. Encryption off keeps plaintext. Counts, ids, and the fixed push strings are not sealed.

Push text that this note creates uses the fixed strings in the copy table. A push body is never a transcript, a draft, an email subject, a person name, or a routine name. Ids travel in `data` and are not copied into the visible title or body.

Deep links:

| Target | Web | Phone |
| --- | --- | --- |
| Queue | `/app/queue` | the existing queue screen |
| Thread | `/app` with that thread open | the existing thread route |
| Report | `/app/report` | the report screen added in the report pull request |
| Digest | `/app/digest` | the digest screen added in the digest pull request |

## Copy

English is the source string. Spanish is the `es` catalog string. No other new sentences.

| Key | English | Spanish |
| --- | --- | --- |
| `voice.recording` | Recording | Grabando |
| `voice.transcribing` | Transcribing | Transcribiendo |
| `voice.transcript` | Transcript | Transcripción |
| `voice.play` | Play | Reproducir |
| `voice.saveNote` | Save note | Guardar nota |
| `voice.noWords` | No words | Sin palabras |
| `digest.optIn` | Morning summary | Resumen de la mañana |
| `digest.weekly` | Monday summary | Resumen del lunes |
| `digest.email` | Email the summary | Enviar el resumen por correo |
| `digest.pushDaily` | Morning summary | Resumen de la mañana |
| `digest.pushWeekly` | Monday summary | Resumen del lunes |
| `digest.review` | Review drafts | Revisar borradores |
| `digest.reminders` | Open reminders | Abrir recordatorios |
| `notify.needsYou` | Needs you | Te necesita |
| `notify.updates` | Updates | Novedades |
| `undo.button` | Undo | Deshacer |
| `undo.notSent` | Not sent | No enviado |
| `undo.alreadySent` | Already sent. | Ya se envió. |
| `undo.setting` | Undo send | Deshacer envío |
| `report.title` | This month | Este mes |
| `report.noData` | No data | Sin datos |
| `report.practice` | Practice | Práctica |
| `report.tasks` | Tasks finished | Tareas terminadas |
| `report.draftsWritten` | Drafts written | Borradores escritos |
| `report.draftsApproved` | Drafts approved | Borradores aprobados |
| `report.emails` | Marked sent | Marcados como enviados |
| `report.reminders` | Reminders | Recordatorios |
| `report.meetings` | Meetings | Reuniones |
| `report.minutes` | {min} to {max} minutes | {min} a {max} minutos |
| `report.hours` | Each finished task counts as 5 to 15 minutes. | Cada tarea terminada cuenta de 5 a 15 minutos. |
| `notify.quiet` | Quiet hours | Horas en silencio |
| `notify.channel` | Alerts | Avisos |
| `notify.both` | Both | Ambos |
| `referral.share` | Share ALMA | Compartir ALMA |
| `referral.defaultText` | I use ALMA for drafts I review on screen. | Uso ALMA para borradores que reviso en pantalla. |

Push title for every new push is `ALMA`. The visible body is one of `digest.pushDaily`, `digest.pushWeekly`, `notify.needsYou`, `notify.updates`, or `undo.button`.

## 1. Voice notes (VO01)

### Behavior

Reply playback stays the existing control: web "Speak this reply" (`apps/web/src/pages/shell/use-read-aloud.ts`) and mobile `useAutoSpeakReply` (`apps/mobile/lib/thread-voice.ts`). This pull request does not add a second speak button on a message.

Recording state on the web stays `HoldToTalk` (`apps/web/src/components/composer/HoldToTalk.tsx`). When `voiceNotesEnabled` is on, the mobile composer shows one control. Idle reads Dictate only if that string already exists; otherwise the control has no visible word until recording starts. Recording reads `voice.recording`. Transcribing reads `voice.transcribing`. The control is absent when the flag is off.

Language goes through the existing `voiceLanguage` and `ttsLanguage` in `packages/adapters/src/xai-voice.ts`. No new branch and no new keyterm list. A Spanish locale stays the existing Spanish tag. English stays English.

When the flag is on, the user can transcribe one audio artifact they already own:

1. `POST` the existing `/api/voice/transcribe` path by calling `transcribeVoice` in `apps/api/src/voice.ts`. The route is `voiceNotes/transcribe` with `{ artifactId }`. It loads the artifact the user owns, rejects a non-audio mime with `voice_notes_audio`, and stores the returned text.
2. If the attachment already has a voice transcript from `normalizeVoiceTranscript` in `packages/core/src/attachments.ts`, that text is stored and `transcribeVoice` is not called.
3. The client shows the text under `voice.transcript`. The user can edit it. Save writes the edit. The text is not sent anywhere by saving.
4. `voice.play` calls the existing `POST /api/voice/speak` with that text. The control is hidden when `voice/status` has `transcribe` false.
5. Save note writes `noteTitle` and `noteBody` from `splitTranscript`. The user can edit both before the write. Status becomes `saved`. A saved note is also inserted as a `work_records` row of kind `note` when `ALMA_PHASE2A` is on and the user has a personal context in that space. If Phase 2A is off, or there is no personal context, the note stays on `voice_transcripts` only. No personal context is created by this feature.

`splitTranscript`: the title is the first non-empty line, trimmed, at most 80 characters. The body is the rest. An empty transcript shows `voice.noWords` and does not call speak.

### Data

`voice_transcripts`: `id`, `organizationId`, `spaceId`, `userId`, `artifactId` unique, `text`, `noteTitle` nullable, `noteBody` nullable, `status` `open` or `saved`, `createdAt`, `updatedAt`.

Seal `text` and `noteBody` in `ENCRYPTED_MODELS` (`packages/db/src/content-encryption.ts`), `ROW_OWNER` (`packages/db/src/content-keys.ts`) as `userId`, and the migration delegate list in `packages/db/src/content-migration.ts`. Owner relation is the Prisma relation to `User`. Space column is `spaceId`. `contentEncryptionStatus` gains one `UNION ALL` for this table using the `rkz1:%` rule on `text`.

### Tests

*   Flag values other than `true` are off and write nothing.
*   `splitTranscript` splits the first line and the rest, and caps the title at 80 characters.
*   An existing attachment transcript is stored and `transcribeVoice` is not called.
*   A second transcribe of the same artifact updates the row in place.
*   Edit changes `text`. Save note sets `saved` and, with Phase 2A and a personal context, one `work_records` note. Without Phase 2A, no `work_records` row.
*   Speak is not requested when `transcribe` is false.
*   Copy keys match the table. The strings do not name a vendor.

## 2. Mobile quick actions (MO01)

### Behavior

When `mobileActionsEnabled` is off, routes and the queue screen are unchanged.

When it is on, `quickActionTarget` in `packages/core/src/mobile-actions.ts` maps a name to a screen:

| Name | Target | Absent when |
| --- | --- | --- |
| `review` | queue | `phase2aEnabled` is false |
| `camera` | current thread with `capture=camera` | there is no open thread id |
| `share` | the existing `/share` route | never, while the flag is on |
| `voice` | current thread with `capture=voice` | `voiceNotesEnabled` is false or there is no open thread id |

The thread screen, only when the flag is on, reads `capture`. `camera` calls the existing `launchCameraAsync` path in `apps/mobile/lib/pick-attachments.ts` and attaches the file to that thread. `voice` starts the voice-notes recording control. The param is consumed once. Unknown names return null and open nothing.

The queue screen already uses `queueDraftActions` from `packages/core/src/phase2a.ts`. When both `mobileActionsEnabled` and `phase2aEnabled` are on, Approve, Save, and Cancel render as the existing actions, each at least 44 points tall. This pull request adds no new draft command.

App lock: `lockAvailability` in `apps/mobile/lib/app-lock.ts` returns `unavailable`. No settings row is rendered. The module does not import a biometric package.

This pull request does not register a home-screen shortcut and does not add a notification category. Lock-screen text is the notify-policy pull request.

### Tests

*   Each name maps as the table says, including the absent cases.
*   An unknown name is null.
*   Flag off: `quickActionTarget` is not consulted by the screen tests, and `capture` is ignored.
*   `lockAvailability` is `unavailable`.
*   The pull request diff does not change `app.json`, `app.config.ts`, or version fields.

## 3. Morning and Monday summary (ND01)

### Behavior

Opt-in is off until the user turns on `digest.optIn`. The time is 7:30 in the schedule zone, minute `450`. The user can set another minute from 0 through 1439. `digest.weekly` defaults on when they opt in, and they can turn it off. `digest.email` defaults off.

Schedule zone: `user.timezone` when it is a non-empty IANA name. When it is null, the zone is `America/Santo_Domingo`. This is the product default for an unset zone, not a guess about the person.

A job runs once a minute. It inserts a `digest_issues` row for a subscription whose local minute matches and whose `(userId, kind, localDate)` is not already present. The unique key is the claim. Two workers cannot both insert. Daily kind is `daily`. Monday kind is `weekly`, and it is inserted only when `weekly` is true and the local weekday is Monday. A Monday can have both rows.

`buildDigest` is pure. Inputs are waiting drafts and reminders, already loaded for that user. Waiting drafts are `outbound_drafts` with status `pending` or `approved` in spaces the user belongs to. Reminders are `routines` with `active` true and `nextRunAt` inside the local day (weekly: the local day and the six days before it). Calendar is not queried. Mail is not queried. A source with zero rows is omitted. Zero of both returns `{ empty: true }`. An empty result does not insert an issue, does not push, and does not email.

Suggestions, at most two, and only from those rows:

*   One or more waiting drafts: `digest.review`, link queue.
*   One or more reminders: `digest.reminders`, link the first reminder's thread when `threadId` is set, otherwise no link.

The in-app screen `/app/digest` lists the latest issue's counts and those links. Routine names are loaded when the screen opens. They are not stored on the issue.

Push, when an issue is inserted: title `ALMA`, body `digest.pushDaily` or `digest.pushWeekly`. `data` is `{ kind: "digest", issueId }` only.

Email, only when `email` is true and `configuredEmailProvider` in `packages/adapters/src/email-provider.ts` returns a provider: one message to the account email with the same counts and links. No provider means skip email and keep the in-app issue. The skip is not an error and not a prompt. This does not add an email provider.

Quiet hours are not read here. The notify-policy flag, when on, treats `data.kind === "digest"` as routine. Until that flag is on, the digest push is sent at the scheduled minute with the fixed body above.

### Data

`digest_subscriptions`: `userId` primary key, `enabled`, `weekly`, `minuteOfDay`, `email`, `updatedAt`.

`digest_issues`: `id`, `userId`, `kind` `daily` or `weekly`, `localDate` (a `YYYY-MM-DD` string), `draftCount`, `reminderCount`, `createdAt`. Unique `(userId, kind, localDate)`. No free text.

### Tests

*   Flag off writes nothing.
*   Null timezone uses `America/Santo_Domingo`. A set timezone is used as given.
*   An empty input does not insert.
*   Drafts and reminders produce the two suggestions and no third.
*   A duplicate insert for the same local day does not create a second issue or a second push.
*   Email stays unsent when the toggle is off, and when the toggle is on but no provider is configured.
*   The push body is the fixed string, not a count and not a name.

## 4. Notification policy (ND02)

### Behavior

When the flag is off, `ExpoPushProvider.deliver` in `packages/adapters/src/expo-push.ts` is unchanged.

When the flag is on, `decidePush` runs before a push is handed to Expo:

*   Urgent kinds are `approval_waiting`, `deadline`, and `failure`. Everything else is routine, including `digest` and run completion.
*   Visible title is `ALMA`. Urgent body is `notify.needsYou`. Routine body is `notify.updates`.
*   `data` keeps `spaceId`, `threadId`, `botId`, `draftId`, `issueId`, and `kind` when those keys were present. Every other data key is dropped, including `body`, `title`, `name`, `text`, `email`, and `notificationBody`.
*   Channel `in_app` sends no push. Channel `push` and channel `both` may push. The default channel when no row exists is `both`.
*   Quiet hours are optional start and end minutes in the same schedule zone as the digest. A start equal to the end means quiet hours are off. A window that crosses midnight still matches. Routine pushes inside the window are held. Urgent pushes inside the window are sent, redacted.
*   Held routine pushes become one `notification_batches` row per user. A flush job every 30 minutes sends one push per user who has a held row, body `notify.updates`, then deletes the held rows. Two flushers claim with `UPDATE ... WHERE sentAt IS NULL` and a lease column `flushingAt`. A row claimed by one flusher is not sent twice.
*   In-app chat alerts are unchanged. This flag does not suppress them and does not add a second inbox.

A deadline is urgent when the caller passes kind `deadline`. This slice does not invent a deadline from a routine. The approval queue, when it notifies, passes `approval_waiting`. Run failure already uses the failure path in `expo-push.ts` and passes `failure`.

### Data

`user_notification_policies`: `userId` primary key, `channel` `push`, `in_app`, or `both`, `quietStartMinute` nullable, `quietEndMinute` nullable, `updatedAt`.

`notification_batches`: `id`, `userId`, `kind`, `createdAt`, `flushingAt` nullable, `sentAt` nullable.

### Tests

*   Flag off does not call `decidePush`.
*   A payload that contains a subject and a person name comes out with the fixed body and without those strings in `data`.
*   Quiet hours hold a routine push and do not hold an urgent push.
*   A window crossing midnight matches a time after the start and a time before the end.
*   Channel `in_app` sends no push.
*   Two flush claims send one push.

## 5. Undo before send

### Behavior

Requires Phase 2A, as the flag section says. When send undo is off, `gateToolCall` in `packages/adapters/src/run-tool-gate.ts` keeps today's Phase 2A hold, which only refuses the tools Phase 2A already refuses.

When send undo is on, `externalSendHold` also returns `{ code: "phase2a_external_hold" }` for an external message. An external message is `send_email`, or a messaging outbound mirror, or a connector tool whose names include `send` and whose `readOnly` is not true, and whose connector kind is not in the Phase 2A payment set. Payment, clinical, filing, and price tools still return `phase2a_refused`. A hold does not call the tool and does not call a provider.

The gate then creates an `outbound_drafts` row in the user's personal context in that space, status `draft`, channel `email`, `whatsapp`, or `other`. Recipient and body come from the tool arguments. Missing recipient or body returns `phase2a_external_hold` and creates no row. The tool result is that code, not a sent id. If the user has no personal context in that space, the result is the same code and no row is created. This feature does not create a context.

The user submits and approves through the existing Phase 2A commands. Approve sets `dispatchAfter` from `undoSeconds`, not from `ALMA_PHASE2A_DISPATCH_DELAY_SECONDS`. `undoSeconds` is the user's stored choice, one of 0, 10, 30, 60. No row means 30. Zero means `dispatchAfter` is now.

Undo is `cancel` on an `approved` draft, the existing command. It is allowed before a sender claims the row. This slice does not call `claimDraft`. Status stays `approved` after `dispatchAfter`. The label stays `waiting` via the existing `deliveryLabel`. The Undo control is shown while `queueDraftActions` says `cancel` and the status is `approved`. The control reads `undo.button`. Next to it, while `dispatchAfter` is in the future, the screen shows the remaining whole seconds and `undo.notSent`. After `dispatchAfter`, it shows `undo.notSent` and the button remains, because nothing was sent. An edit uses the existing edit command, clears the approval, and the draft must be approved again.

A cancel of `sent`, `failed`, `unknown`, or `dispatching` returns the existing `phase2a_already_sent` or `phase2a_in_flight`. The user-visible string for `phase2a_already_sent` is `undo.alreadySent`. That string does not contain "recall", "recalled", "unsend", or "delivered".

The notification for a newly approved draft: title `ALMA`, body `undo.notSent`, `data` `{ kind: "approval_waiting", draftId }`. Tap opens the queue. No notification action is registered. When notify policy is on, `decidePush` replaces the body with `notify.needsYou`.

### Data

`send_undo_settings`: `userId` primary key, `seconds` check constraint in `(0, 10, 30, 60)`, `updatedAt`.

No new column on `outbound_drafts`.

### Tests

*   Send undo on without Phase 2A throws at read time.
*   0, 10, 30, and 60 are accepted. 15 is rejected.
*   `send_email` with the flag on does not call the mail function. It creates one draft when a personal context exists, and no draft when it does not.
*   Approve with 30 stores `dispatchAfter` 30 seconds ahead. Approve with 0 stores now.
*   Cancel before and after `dispatchAfter` sets `cancelled` and does not say recall.
*   Edit after approve returns the draft to `draft` and clears the hash, the approver, and `dispatchAfter`.
*   `claimDraft` is not called by the worker or the API in this pull request.

## 6. Monthly report (RV01)

### Behavior

`buildMonthlyReport` is pure. The month is a `YYYY-MM` in the schedule zone (the same zone rule as the digest). The page `/app/report` shows the current month and can request another month. The phone uses the same RPC.

Counts, each scoped to the signed-in user:

| Line | Source | Empty line |
| --- | --- | --- |
| Tasks finished | `runs` with `status` completed, `trigger` `user`, `createdAt` in the month, and no practice mark | `report.noData` |
| Drafts written | `outbound_drafts` created in the month | `report.noData` |
| Drafts approved | `outbound_drafts` with `approvedAt` in the month | `report.noData` |
| Emails | `outbound_drafts` with `channel` `email` and `status` `sent` and `updatedAt` in the month | `report.noData` |
| Reminders | `runs` with `trigger` `routine` and `status` completed in the month | `report.noData` |
| Meetings | no source | `report.noData` always |
| Hours | from tasks finished, using `report.hours` | `report.noData` when tasks are absent |

A zero count is `report.noData`, not the digit 0. Hours, when tasks exist, are `count * 5` through `count * 15` minutes, shown as those two minute totals. The method sentence `report.hours` is on the page and in the PDF. The sentence is the whole method.

Practice: a run counts as practice only when `report_run_marks.practice` is true. This pull request does not write that table except in tests. Unmarked runs are real. Practice runs are excluded from the tasks and reminders lines. When any practice mark exists in the month, the page shows `report.practice` and that count. When none exist, the practice line is omitted.

Client breakdown: when the user can see at least one `work_contexts` row of kind `client`, the page adds one block per client label with the draft counts linked to that context. Runs join a client only through `work_links` of `targetKind` `thread` on `run.threadId`. A client with no rows in the month shows `report.noData`. When the user sees no client context, the breakdown is omitted.

PDF: `GET` the report RPC with `format=pdf` returns `application/pdf`. The writer is `renderReportPdf` in `packages/core/src/monthly-report-pdf.ts`. It uses no package outside the repo. The PDF contains the same lines, the same "No data" lines, and `report.hours`. It contains no chart.

Demo and real are the practice split above. There is no other demo flag.

### Data

`report_run_marks`: `runId` primary key, `userId`, `spaceId`, `practice` boolean, `createdAt`. Copied from the run. The shared tenant rule applies.

### Tests

*   Flag off rejects the RPC and writes nothing.
*   A month with no rows is "No data" on every line, and hours are "No data".
*   Three finished tasks render 15 to 45 minutes and the method sentence.
*   A practice run is excluded from tasks and listed under practice.
*   A client block appears only when a client context is in the input.
*   The PDF bytes contain the title and do not contain a count that was "No data" as `0`.

## 7. Referral prompt (RG01)

### Behavior

The existing `createReferrals` in `apps/api/src/referrals.ts` is unchanged when `ALMA_REFERRAL_PROMPT` is off. Its reward path stays as it is today.

When the prompt flag is on:

*   An organization owner gets a code from the existing `referral_codes` table. `shareLink` creates the code if needed and does not grant a reward. A user who owns no organization gets no link and no prompt.
*   The link is `{webOrigin}/sign-up?ref={code}`, the same shape `createReferrals.status` already returns.
*   Signup claim: when the prompt flag is on, `claim` inserts the `referrals` row even if the existing reward `enabled` value is false. It still refuses a self-referral and a claim after `subscribedAt`. It does not call `grantBalanceCredit` or `extendByokFreePeriod`.
*   When the existing reward `enabled` value is true, claim and settle keep today's grant behavior. This note does not add a second grant. `paidAt` is set when settle decides an outcome other than skipping the row.
*   `activatedAt` is set once, when `recordActivationEvent` writes `task_completed` for a user in the referred organization. No other event name sets it.
*   The share sentence defaults to `referral.defaultText`. The owner can edit it, up to 280 characters. It is stored in `referral_share_texts`. The client shows the stored sentence. The server does not send it.
*   A prompt is allowed when `referralPromptAllowed` is true. Inputs: the latest result was `success`, the user owns an organization, prompts recorded for that user in the last 7 days by the clock are fewer than 3, and the win is verified. A verified win is `task_completed` for that user, or an `outbound_drafts` row that user approved, in the last 24 hours. A result of `error`, a failed run, or a missing win returns false and records nothing.
*   The client shows `referral.share` and the sentence only when the RPC returns allowed. The share action is the device share sheet or copy. There is no server send.

`ALMA_REFERRAL_REWARDS` never enables a grant. Startup throws if it is `true`.

### Data

Add nullable `activatedAt` and `paidAt` on `referrals`. Existing rows stay null. The previous release does not read them.

`referral_share_texts`: `userId` primary key, `body`, `updatedAt`.

`referral_prompt_events`: `id`, `userId`, `shownAt`.

### Tests

*   Flag off: `createReferrals` tests that already pass still pass, and the new claim path is not used.
*   Prompt flag on and reward `enabled` false: claim inserts a row and does not call `grantBalanceCredit` or `extendByokFreePeriod`.
*   A fourth prompt in seven days is refused. An error result records nothing.
*   `ALMA_REFERRAL_REWARDS=true` throws.
*   The default sentence matches the copy table. The server has no send function for it.

## Pull requests

Each branch starts from `main`. Each is one item. Do not merge.

| PR | Branch | Flag |
| --- | --- | --- |
| Design | `cursor/phase2c-engagement-design-9daa` | none |
| Voice notes | `cursor/phase2c-voice-notes-9daa` | `ALMA_VOICE_NOTES` |
| Mobile actions | `cursor/phase2c-mobile-actions-9daa` | `ALMA_MOBILE_ACTIONS` |
| Digest | `cursor/phase2c-digest-9daa` | `ALMA_DIGEST` |
| Notify policy | `cursor/phase2c-notify-policy-9daa` | `ALMA_NOTIFY_POLICY` |
| Undo | `cursor/phase2c-send-undo-9daa` | `ALMA_SEND_UNDO` |
| Monthly report | `cursor/phase2c-monthly-report-9daa` | `ALMA_MONTHLY_REPORT` |
| Referral prompt | `cursor/phase2c-referral-prompt-9daa` | `ALMA_REFERRAL_PROMPT` |

Migrations sort after `20261202120400`:

*   `20261208120000_voice_notes`
*   `20261208120100_mobile_actions` is not created. That item has no table.
*   `20261208120200_digest`
*   `20261208120300_notify_policy`
*   `20261208120400_send_undo`
*   `20261208120500_monthly_report`
*   `20261208120600_referral_prompt`

## Open decisions

The owner decides these. The spec does not assume a yes.

1. **Sender after the window.** This spec does not call the existing email or messaging sender when `dispatchAfter` passes. Attach those senders only if the owner says to. Until then, Undo cancels an unsent draft and the label stays waiting.
2. **Unset timezone.** This spec uses `America/Santo_Domingo` when `user.timezone` is null. Confirm, or require the user to pick a zone before a summary is scheduled.
3. **Practice marks.** Nothing in production is marked practice. Confirm that onboarding runs stay in the real totals until a later, explicit mark exists.
4. **Store build.** Home-screen shortcuts, biometric app lock, and an Undo button inside the notification wait for a store build. This spec ships on-screen Undo, queue actions, and the `capture` routes only.
5. **Monday summary default.** Opting into the morning summary also turns on the Monday summary. Confirm, or default Monday to off.
6. **Referral link.** Only an organization owner gets a link. A member who owns nothing sees no prompt. Confirm.
7. **Hours.** The method is 5 to 15 minutes per finished task, shown as minute totals. Confirm that range before the report is turned on.

Goldfish review: `docs/designs/reviews/2026-11-07-phase2c-engagement.md`.
