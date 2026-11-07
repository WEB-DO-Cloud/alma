# Phase 2A foundation

*   **Status:** Reviewed, ready to implement
*   **Date:** 2026-11-07
*   **Branch:** `cursor/phase2a-foundation-633f`
*   **Author:** ALMA overlay. Upstream Rakazo files change only where this note names them.

## Review resolutions

A zero-context review read this note and the code it names. These decisions override any earlier sentence they touch.

*   **Personal visibility.** `work_contexts` adds `kind <> 'personal' OR ownerUserId = app.user_id`. A global owner filter would hide work and client contexts from everyone except the creator.
*   **Role inserts do not read `work_contexts`.** `work_context_roles` copies `kind`. `WITH CHECK` allows a personal role only when `userId` and `grantedByUserId` are the current user. That blocks a shared personal context without a policy cycle.
*   **Child writes.** Records, links, and drafts check the actor's role on `work_context_roles` in `WITH CHECK` (draft and record inserts require `owner`, `professional`, or `assistant`). Setting `status` to `approved` requires `owner` or `professional`. The role policy does not read those tables.
*   **Grants.** `GRANT SELECT, INSERT, UPDATE, DELETE` matches `20261119120000_alma_activation`, not `organization_profiles`. System policies are `USING ((SELECT app_rls_bypass()))` with no `WITH CHECK`. Tenant policies have both `USING` and `WITH CHECK`, like `alma_trials`.
*   **Encryption owner.** `ROW_OWNER` is the column `createdByUserId`. `ENCRYPTED_MODELS.ownerRelation` is the Prisma relation `createdBy`. `SpaceSource` gains `work_records` and `outbound_drafts`. Migration delegates are `workRecord` and `outboundDraft`. `contentEncryptionStatus` gains two `UNION ALL` branches using the `rkz1:%` rule. Bodies are plain text, like memory documents, not message blocks.
*   **Hold placement.** `externalSendHold` runs inside `gateToolCall` after the connector kind and batch tool names are known, and before occurrence counting and `recordEffect`. It runs for approval replays. A hold returns `{ result: { error } }` and records no effect. Flag off does not call it.
*   **Mirror.** When the flag is on, skip `mirrorRun` only. Still set `messagingMirroredAt` for messaging runs so the job reconciler does not retry forever.
*   **Phase 1 names.** The nine names are real, but they are not all written in `alma-activation.ts`. `signup`, `task_started`, and `limit_reached` are in `alma-trial.ts`. `plan_viewed` is in `apps/api/src/alma-onboarding.ts`. `checkout_started` and `payment_completed` are in `apps/api/src/billing.ts`. The regression test greps `recordActivationEvent` call sites under `packages/db/src` and `apps/api/src`. Phase 2A does not call it.
*   **Hash.** Sorting `attachmentIds` means order does not change the hash. The hash changes when recipient, channel, body, or the set of attachment ids changes.
*   **Compose.** Add both keys to `x-app-environment` in the three compose files, and duplicate them on the api service where the Phase 1 keys are duplicated. The worker inherits the anchor.
*   **Startup.** `loadEnv` and `apps/worker/src/index.ts` (next to `readAlmaFlags()`) call `readPhase2aConfig`.

This slice is the dependency-first part of Phase 2A from the feedback backlog: scope isolation (MF01) and the external-message approval contract (WA02 with the TE01 roles that contract needs). A structured professional refusal (SK04) and offline fixtures (UX05, UX03) ship with it because they are small and they name the safety rules the contract enforces. OCR, spreadsheet parsing, invitations, a queue screen, and a real sender do not.

Decisions D02, D06, D08, D11, D13, and D14 stay at the backlog's conservative recommendation. No privacy or legal wording, prices, trial terms, retention promises, or paid vendors. No autonomous external send. Do not merge, deploy, or tag.

## Problem

Chat memory and files are isolated by Space and, in application code, by the user who owns the bot. There is no personal-versus-work boundary and no per-client record. Two clients in one space can be mixed by any query that forgets a `userId` filter, and nothing stops one thread from being treated as belonging to two clients.

Outbound mail and linked-chat replies are not an exact-text approval. A tool card can allow a tool name. Auto mode and "always allow" can send with no card. Linked-chat mirroring copies the bot's reply after the run. `MessagingOutbound.status` is set to `sent` before the provider accepts, and a delivered receipt is stored as `sent`. Nothing offers a cancel window, and nothing may promise that a sent WhatsApp can be recalled.

Phase 1 (merged) already records the activation funnel in `activation_events`. This slice must not add a second stream.

## Goals

*   With `ALMA_PHASE2A` off, every current send, approval card, upload, and screen behaves as it does today.
*   With the flag on, a personal context is visible only to its owner. A work or client context is visible only to people with a role on that context. A list or a resolve never returns another context's rows.
*   With the flag on, an external message leaves only as a draft whose recipient, channel, body, and attachments were approved as one hash. An edit after approval clears the approval. A cancel before dispatch stops the send. No status and no label means delivered. This slice does not call a provider.
*   With the flag on, connector writes and linked-chat mirroring do not run. They return a hold. Clinical, filing, payment, and price actions are refused and cannot be drafted as external messages.
*   Fixtures cover personal use and the eight launch sectors. They do not insert activation events.

## Non-goals

*   No OCR, no spreadsheet or statement parsing, no field extraction (MF02, IN04). Follow-up.
*   No email invitations, expiring links, or seat prices (the rest of TE01, and D05).
*   No WhatsApp provider, no email sender, no recall, no correction-after-delivery UI (WA01, UX04).
*   No new screen on web, desktop, or phone. The flag stays off until a later slice ships the queue on every surface that can approve.
*   No new analytics event, no PostHog change, no latency recorder, no dashboard.
*   No change to Phase 1 trial, sector copy, checklist, or plan sentences.
*   Photography, finance, and agriculture are not fixtures.

## Flags

Parsed by `readPhase2aConfig` in `packages/core/src/phase2a.ts`. On only when the value is exactly `true`. `1` and `yes` are off.

| Env | Meaning | Default |
| --- | --- | --- |
| `ALMA_PHASE2A` | Isolation, drafts, holds, and refusals | off |
| `ALMA_PHASE2A_DISPATCH_DELAY_SECONDS` | Seconds after approval before a later sender may claim the draft. Integer 0 through 300. | 30 |

The delay is validated only when the flag is on. An out-of-range value throws. `loadEnv` in `apps/api/src/env.ts` and worker startup in `apps/worker/src/index.ts` both call `readPhase2aConfig`, so a bad value fails before serving.

Add both names to `x-app-environment` in:

*   `infra/compose/docker-compose.yml`
*   `infra/compose/docker-compose.images.yml`
*   `infra/compose/docker-compose.prod.yml`

Duplicate them on the api service in those files, where `ALMA_TRIAL_ENABLED` is duplicated. The worker service only uses the anchor.

Empty values pass the host value through only when it is set. The phone and the web app do not read these variables.

`readPhase2aConfig` does not read `ALMA_TRIAL_*` or `ALMA_ONBOARDING_V2`. Phase 1's `readAlmaFlags` does not read these two names.

## Decisions

1. **One flag.** Isolation without the send hold would let a model read a client record and still send. The hold without a context would approve text that is not tied to a client. They switch together.
2. **Contexts, not a new tenant.** A context lives in one existing Space and organization. It does not replace Space RLS. Personal versus work is `kind`, not a second account.
3. **Personal is never shared.** `grant` on a personal context fails. A personal row's policy also requires `ownerUserId` = `app.user_id`.
4. **Client hangs off work.** A client context may set `parentId` only to a work context in the same space. A personal context has no parent and cannot be a parent.
5. **Roles are the approval gate.** `owner` and `professional` may approve. `assistant` may draft and may not approve. `reader` may read and may not draft. The context creator is `owner`. An owner or professional may approve a draft they wrote (a solo office). An assistant's draft needs a different owner or professional.
6. **Exact text is a hash.** SHA-256 over UTF-8 JSON with keys in this order: `recipient`, `channel`, `body`, `attachmentIds` (sorted). Approval stores the hash. Approve fails unless the stored hash still matches. Edit of any of those fields on a `pending` or `approved` draft returns it to `draft` and clears the approver, the hash, and `dispatchAfter`.
7. **No provider in this slice.** Nothing in the API or the worker calls `recordDispatchResult`. The status `sent` exists so a later sender can record an honest handoff. This slice never writes it. `approved` stays `approved` after the delay elapses. The label stays "waiting", not "sent".
8. **No delivered, no recall.** The status enum has no `delivered`. Presenter labels are `draft`, `waiting`, `sending`, `sent`, `failed`, `unknown`, `cancelled`. Cancel of `sent`, `failed`, or `unknown` returns `phase2a_already_sent` and the error text does not contain "recall" or "delivered".
9. **Audit stores the hash, not the text.** `work_approval_events` records actor, action, and hash. D11: do not keep a second copy of the body. The draft row is the only copy, and it is overwritten on edit. Version history is MF05.
10. **Bodies are sealed.** `work_records.body` and `outbound_drafts.body` join the existing content-encryption list. `ROW_OWNER` stores `createdByUserId`. The Prisma relation used as `ownerRelation` is `createdBy`. Space column is `spaceId`. See Review resolutions for the type list. A deployment with encryption off keeps today's plaintext behavior for these columns too.
11. **Refusal is structural.** SK04 does not scan the body with a word list. The server classifies the tool or the draft's `actionClass`. `clinical`, `filing`, `payment`, and `price` cannot be created as external drafts and cannot pass the tool gate. Judging free-form prose needs a versioned rubric and stays a follow-up.
12. **Ambiguous means stop.** `records/resolve` searches one context. Two title matches return `{ status: "ambiguous", ids }` and no bodies. Zero matches return not found. There is no cross-context search.
13. **Links are exclusive.** A thread or artifact links to at most one context. A second context is rejected. Chat uploads are not auto-linked.
14. **Phase 1 events stay put.** The nine activation names are `signup`, `sector_chosen`, `assistant_ready`, `task_started`, `task_completed`, `limit_reached`, `plan_viewed`, `checkout_started`, and `payment_completed`. They are written from `alma-activation.ts`, `alma-trial.ts`, `apps/api/src/alma-onboarding.ts`, and `apps/api/src/billing.ts`. This slice does not call `recordActivationEvent` and does not insert into `activation_events`.

## Data model

All new tables are empty. The previous release does not read them. Ids are Prisma `cuid()`.

### `work_contexts`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `organizationId` | Cascade on organization delete |
| `spaceId` | Cascade on space delete |
| `ownerUserId` | Creator. Personal rows are readable only by this user |
| `kind` | `personal`, `work`, or `client` |
| `label` | 1–80 characters |
| `parentId` | Null, or a work context in the same space |
| `createdAt`, `updatedAt` | |

### `work_context_roles`

| Column | Notes |
| --- | --- |
| `contextId`, `userId` | Primary key |
| `organizationId`, `spaceId`, `kind` | Copied from the context so the policy does not read `work_contexts` |
| `role` | `owner`, `professional`, `assistant`, `reader` |
| `grantedByUserId` | |
| `createdAt` | |

The creator's owner row is inserted in the same transaction as the context. Personal contexts get that one row and no others.

### `work_records`

| Column | Notes |
| --- | --- |
| `id`, `contextId`, `organizationId`, `spaceId`, `createdByUserId` | |
| `kind` | `contact`, `matter`, or `note` |
| `title` | 1–160 characters |
| `body` | Nullable text, sealed when encryption is on |
| `createdAt`, `updatedAt` | |

### `work_links`

| Column | Notes |
| --- | --- |
| `id`, `contextId`, `organizationId`, `spaceId`, `createdByUserId` | |
| `targetKind` | `thread` or `artifact` |
| `targetId` | |
| `createdAt` | |

Unique on `(targetKind, targetId)`.

### `outbound_drafts`

| Column | Notes |
| --- | --- |
| `id`, `contextId`, `organizationId`, `spaceId` | |
| `createdByUserId`, `creatorRole` | Role at create time, so approval does not read another person's role row |
| `recipient` | 1–200 characters. A display address, not a provider id |
| `channel` | `whatsapp`, `email`, or `other` |
| `body` | 1–8000 characters, sealed when encryption is on |
| `attachmentIds` | Text array, at most 8, each already linked to this context |
| `bodyHash` | Hex SHA-256 of the canonical payload |
| `actionClass` | Always `message` for a stored draft |
| `status` | `draft`, `pending`, `approved`, `cancelled`, `dispatching`, `sent`, `failed`, `unknown` |
| `approvedByUserId`, `approvedAt`, `approvedBodyHash`, `dispatchAfter` | Null unless `approved` or a later status a future sender sets |
| `createdAt`, `updatedAt` | |

### `work_approval_events`

Append-only in application code. Columns: `id`, `draftId`, `contextId`, `organizationId`, `spaceId`, `actorUserId`, `action` (`created`, `edited`, `submitted`, `approved`, `invalidated`, `cancelled`), `bodyHash`, `createdAt`. No body, recipient, or attachment ids.

## Authorization

Tenant policies use `USING` and `WITH CHECK`. System policies are `(SELECT app_rls_bypass())` and nothing else.

A context row is visible when `spaceId` matches `app.space_id`, the user owns it or has a role row, and personal rows also have `ownerUserId` = `app.user_id` (`kind <> 'personal' OR owner matches`). `WITH CHECK` also requires `organizationId` to be the organization of that space. Role rows are visible when the space matches and `userId` or `grantedByUserId` is the current user. Role inserts require `grantedByUserId` = `app.user_id`, and a personal role only for that same user. The role policy does not read `work_contexts`.

Records, links, drafts, and approval events are visible when the space matches and the actor has a role on that context. Draft and record inserts require a writing role. An update that sets `approved` requires an approving role. Approval events are insert-only at the route.

Application checks, on top of RLS:

*   The actor's space supplies `organizationId`.
*   `grant` and `revoke` require the actor's role to be `owner` on that context.
*   The grantee has a `member` row in the organization. This slice does not invite new people.
*   `revoke` of the last owner fails.
*   Draft create, edit, submit, and cancel require `owner`, `professional`, or `assistant`.
*   Approve requires the approver's role to be `owner` or `professional`. When the drafter's role is `assistant`, the approver must be a different user. An owner or professional may approve a draft they wrote.

Flag off: every new procedure throws `FORBIDDEN` with message `phase2a_disabled` and writes nothing.

## State machine

Pure functions in `packages/core/src/phase2a.ts`. The database applies them with a conditional update so two callers cannot both win.

| From | Command | To | Notes |
| --- | --- | --- | --- |
| `draft` | edit | `draft` | Replaces payload and hash |
| `draft` | submit | `pending` | Hash frozen |
| `pending` | edit | `draft` | Action `invalidated` |
| `pending` | approve | `approved` | Stores approver and `dispatchAfter` = now + delay |
| `pending` | cancel | `cancelled` | |
| `approved` | edit | `draft` | Clears approval. Action `invalidated` |
| `approved` | cancel | `cancelled` | Allowed before a later sender claims |
| `approved` | claim | `dispatching` | Only when `dispatchAfter` <= now and hashes match. Not called by this slice's processes |
| `dispatching` | result | `sent`, `failed`, or `unknown` | Not called by this slice's processes |
| `sent`, `failed`, `unknown`, `dispatching`, `cancelled` | edit or cancel | error | `phase2a_already_sent` or `phase2a_in_flight` |

Approve when the hash changed returns `phase2a_stale_approval` and leaves the row unchanged (the edit already moved it, or the update matches zero rows).

Presenter `deliveryLabel(status, dispatchAfter, now)`:

*   `draft` → `draft`
*   `pending` → `waiting`
*   `approved` → `waiting`
*   `dispatching` → `sending`
*   `sent` → `sent`
*   `failed` → `failed`
*   `unknown` → `unknown`
*   `cancelled` → `cancelled`

The function's return type does not include `delivered`.

## Tool hold and refusal

`externalSendHold` in the same module. `gateToolCall` calls it after the connector kind and batch names are known, before it counts an occurrence or records an effect, including when the call is an approval replay. `mirrorMessagingOutbound` skips `mirrorRun` when the flag is on and still stamps `messagingMirroredAt`.

When the flag is off, both call sites do what they do today.

When the flag is on:

*   A tool whose class is `clinical`, `filing`, `payment`, or `price` returns `{ error: "phase2a_refused" }`. Class comes from an explicit tool-name set (`prescribe`, `diagnose`, `file_return`, `submit_filing`, `commit_price`, `send_quote`) or from a mutating call whose connector kind is `stripe`, `shopify`, `paypal`, or `square`, or from `paid_request`.
*   Any other mutating connector call (`connectorToolRequiresApproval`) returns `{ error: "phase2a_external_hold" }`.
*   Reads, in-app `message_user`, and `web_fetch` are unchanged.
*   Linked-chat mirroring does not enqueue.

The hold does not create a draft. Guessing the context from the run would attach a client the person did not name.

## RPC

Authenticated procedures on `appContract`, implemented in `apps/api/src/routes/phase2a.ts` and registered from `apps/api/src/router.ts`. Each path is added to `exhaustiveProtectedCalls` in `packages/testkit/src/authorization.test.ts`.

*   `phase2a/contexts/list`, `create`, `grant`, `revoke`
*   `phase2a/records/list`, `create`, `resolve`
*   `phase2a/links/create`
*   `phase2a/drafts/list`, `create`, `edit`, `submit`, `approve`, `cancel`

`records/list` and `drafts/list` require a `contextId`. There is no list across contexts.

Contracts live in `packages/contracts/src/phase2a.ts` and are exported from `packages/contracts/src/index.ts`.

## Fixtures

`packages/core/src/phase2a-fixtures.ts` lists personal plus `abogados`, `notaria`, `arquitectura`, `contabilidad`, `clinica-dental`, `clinica-medica`, `inmobiliaria`, and `seguros`. Each entry has:

*   a sector id taken from `ALMA_WORK_SECTORS` or `ALMA_PERSONAL_SECTOR`
*   one refused `actionClass` (`clinical`, `filing`, `payment`, or `price`)
*   two context ids and one record id that `visibleRecordIds` must hide when the other context is queried
*   `proposedBudgetMs` copied from the backlog's proposed targets, with `sla: false`
*   `activationEventName: null`

`splitTiming({ modelMs, approvalWaitMs })` returns those two numbers separately. It does not add them into one latency.

A test greps `recordActivationEvent` under `packages/db/src` and `apps/api/src` and checks that each of the nine names is still passed, and that `packages/core/src/phase2a.ts` does not mention `recordActivationEvent` or `activation_events`.

## Migration

`packages/db/prisma/migrations/20261120120000_phase2a_foundation/migration.sql`, after `20261119120000_alma_activation`.

Additive tables, indexes, foreign keys, and policies. `GRANT SELECT, INSERT, UPDATE, DELETE` to `rakazo_app` where that role exists, matching `20261119120000_alma_activation`. No `-- deferred` line. No drop. No `*_previous_release` policy.

Models are added to `ROW_SECURITY_MODELS` in `packages/db/src/row-security.ts`: `WorkContext`, `WorkContextRole`, `WorkRecord`, `WorkLink`, `OutboundDraft`, `WorkApprovalEvent`.

`WorkRecord` and `OutboundDraft` are added to `ENCRYPTED_MODELS` (`ownerRelation: "createdBy"`), `SpaceSource` (`work_records`, `outbound_drafts`), `ROW_OWNER` (`createdByUserId`), `ROW_CONTEXT`, the content-migration `TABLES` delegates `workRecord` and `outboundDraft`, and `contentEncryptionStatus`.

Rollback is the flag off. Tables stay. The previous release never queries them.

## Tests

Unit, no database:

*   Flag off for `""`, `"1"`, `"yes"`, `"TRUE"`. Flag on only for `"true"`. Delay bounds.
*   Personal cannot parent or be shared. Client parent must be work in the same space.
*   `visibleRecordIds` hides the other context, including personal versus work.
*   Resolve of two titles is ambiguous and returns no body.
*   Edit after approve clears the hash and the approver. Approve of a stale hash fails.
*   Assistant cannot approve. Owner can approve their own draft. Reader cannot draft.
*   Cancel of `approved` works. Cancel of `sent` returns `phase2a_already_sent` and the message has neither "recall" nor "delivered".
*   Presenter never returns `delivered`. `approved` after the delay is still `waiting`.
*   Hold is null when the flag is off, including `gmail_send_email`. Hold and refusal when on, as in Tool hold.
*   Nine fixtures. No new activation event name. Timing is not summed.
*   Canonical hash changes when the body, recipient, channel, or attachment id set changes. Reordering the same attachment ids does not change it.

Postgres, when `VERIFY_DATABASE=1`:

*   Two users in one space. User B's list of user A's personal context is empty under user B's tenant context.
*   A record in client A is not returned for client B.
*   A thread linked to client A cannot be linked to client B.
*   Conditional approve: a second approve matches zero rows.

`packages/testkit/src/authorization.test.ts` lists the new procedures so an unauthenticated call is rejected.

## Rollout and rollback

Default off. Production stays off. Turning the flag on holds connector writes and linked-chat replies and still shows no queue, so it is not a production setting until the queue screen exists. That is an owner decision, recorded below.

Rollback is setting `ALMA_PHASE2A` to anything other than `true` and restarting the API and the worker. No migration down. Draft rows, if any were written in a test, remain and are ignored.

## Out of scope, as follow-ups

*   MF02 / IN04: format validation beyond the existing upload allowlist, OCR, provenance, spreadsheet and statement columns, missing-document checklists.
*   TE01 remainder: invitations, expiry, field-level rights, supervised handoff of tasks.
*   Queue UI on web and phone, then the flag may be considered for a staging deploy.
*   A sender that claims `approved` rows after `dispatchAfter`, calls a provider, and records `sent`, `failed`, or `unknown`. Still no `delivered`. Still no recall.
*   Prose refusal with a versioned rubric. Not a keyword list.
*   UX03 measurement into the existing activation events, only if D08 still allows that payload. Do not add a parallel table.

## Owner decision

Do not set `ALMA_PHASE2A=true` on production until the approval queue is on the web app and the phone. The hold is safe and the missing screen is not.
