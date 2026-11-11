# Phase 1 activation

-   **Status:** Reviewed, ready to implement
-   **Date:** 2026-11-07
-   **Author:** ALMA overlay. "ALMA overlay" means this repository's product changes on top of upstream Rakazo. Upstream files change only where this note names them.

## Review resolutions

Zero-context reviews (Zoom Out, Comprehension, Design Critique, Implementation Readiness) read this note and the repository. These decisions override any earlier sentence they touch.

-   **One trial.** If an `alma_trials` row exists, `trialAvailable` is false and `billing/checkout` does not send Stripe `trialDays`. The plan button says subscribe, not "start a free trial". The no-card trial is the only trial that organization gets.
-   **Cap inside the send transaction.** `consumeTrialMessage` runs inside `sendThreadMessage` in `apps/api/src/thread-target.ts`, after active runs are loaded and before the user message is inserted, and only when that send will queue a new run. A cap miss throws `trial_limit` and the transaction rolls back, so no message is stored. Steering a run that is already active does not count. `threads/followUp` calls the same consume before `sendUserMessage`. Support sends stay on the forward path and do not count. Routine-only sends and reactions do not count; they still stop when `hasModelAccess` is false because the trial clock has ended. That cost hole is owner decision 5.
-   **Row security.** Policies follow `organization_profiles` in `packages/db/prisma/migrations/20261026120000_organization_settings/migration.sql`: a tenant can see and write a row when `app.space_id` is a space in that organization. `USING` and `WITH CHECK` both use that test. The system policy is `(SELECT app_rls_bypass())`, the same function `packages/db/prisma/migrations/20261114120000_rls_bypass_key/migration.sql` installed. `AlmaTrial`, `AlmaProfile`, and `ActivationEvent` are added to `ROW_SECURITY_MODELS` in `packages/db/src/row-security.ts`.
-   **Flags.** On only when the value is exactly `true`, matching `SUPPORT_BOT_ENABLED`. `packages/db/src/alma-flags.ts` parses them. `loadEnv` and the worker startup both call it, so an out-of-range day or cap fails both processes.
-   **No second first-run.** When `ALMA_ONBOARDING_V2` is on, `promptFocus` returns without posting a card. The sector screen does not call `bots/create`, so it does not enqueue the "created" intro run. It creates the bot through the database helper with the sector instructions already set.
-   **Survey.** When onboarding v2 is on, the web and phone skip the existing signup survey screen. Saving a sector writes an empty-or-mapped `signup_surveys` row so `needsSignupSurvey` becomes false. Personal maps to survey `personal`, work maps to `work`, skip stores an empty row.
-   **Who is asked.** `needsSectorChoice` is true only when v2 is on, no profile exists, `hasModelAccess` without a trial is false, and no non-support bot has a user message. Otherwise `me` writes `source = existing` and does not show the screen. The web shell redirects `/app` to `/onboarding/sector` when the flag is still true, same as the phone inbox.
-   **Owner.** Only an organization owner may call `onboarding/sector`. Every member shares the message cap.
-   **Checklist assistant step.** Done when `use` is `personal`, or `use` is `work` and `sector` is not null.
-   **Connections.** A calendar step is done when `provider` or `connectorId`, lowercased, is `googlecalendar` or contains `calendar`. Email is done when one of those fields is `gmail` or `outlook`, or a messaging installation exists for the space.
-   **Events.** `task_started` uses the same sends that pass the "new queued run" test, when either flag is on. `task_completed` is written after `completeRun` when the outcome is `completed` and that run's `sourceMessageId` has a `task_started` row. `limit_reached` with the `:time` key is written from `billing/status` when `endsAt` is in the past. `plan_viewed` is called from `PaywallPage`, from the plans dialog in `SubscriptionGate`, and from `apps/mobile/app/paywall.tsx` on mount. `payment_completed` is recorded only when the subscription status is `active`.
-   **Clients for the cap error.** `apps/web/src/pages/shell/use-composer-actions.ts` and the phone send path under `apps/mobile/components/thread/` open the plan page when the error message is `trial_limit`.
-   **Feedback chrome.** Web item lives in `apps/web/src/pages/shell/chat-header.tsx`. Phone item lives in `apps/mobile/components/thread/thread-screen.tsx`.
-   **Gate fail-open stays.** `SubscriptionGate` still opens the app when `billing/status` throws. The file already says enforcement belongs to the API. The send path enforces the cap. This slice does not lock the app on a failed status call.
-   **`planClarity` stays.** One boolean on `BillingStatus` so the plan page does not re-read both flags.

This slice is ON01, ON02, ON03, ON04, ON08, UX01, and UX02 from the activation week in the product backlog. It does not implement later epics (public demo, DOP prices, local payments, WhatsApp, sector CRMs, or a funnel dashboard).

## Glossary

-   **Organization.** The billing tenant. One user owns it at signup. Model access is decided per organization, not per chat.
-   **Own-key plan.** The paid plan whose monthly price is `BYOK_MONTHLY_PRICE_CENTS` in `packages/contracts/src/domain.ts` (5900 cents, 59 US dollars). Checkout is the existing `billing/checkout` Stripe session.
-   **Launch coupon.** The optional env `STRIPE_PROMO_COUPON_ID`. When it is a repeating USD amount off the monthly plan, `BillingStatus.byokPromo` is `{ priceCents, months }`. The design in `docs/designs/launch-promo.md` already does this. This slice does not create or edit a Stripe coupon.
-   **Complimentary period.** `model_credit_accounts.byokFreeUntil`. `hasModelAccess` already grants access while that timestamp is in the future and the organization is in own-key mode. Access grants extend it. This slice does not write that column.
-   **Paywall.** `SubscriptionGate` in `apps/web/src/components/SubscriptionGate.tsx`, and the phone screen `apps/mobile/app/paywall.tsx`. Both call `billing/status`. When `access` is false they replace the app with the plan page. `/onboarding` is behind that gate, so a new account with no access never reaches onboarding.
-   **Support chat.** The pinned bot with `kind = "support"`. User messages in that thread are forwarded to Chatwoot by the existing support path. They do not start a model run. The bot exists only when `SUPPORT_BOT_ENABLED` is on.
-   **Managed model.** The server-hosted model ALMA already runs. It has its own prepaid budget. This slice does not raise that budget.

## Problem

A new account is sent to the plan page before it can open the assistant. Eight demo accounts stopped there. People who do get in see a blank bot and no setup path. The plan page already shows a launch price when the coupon is configured, and it does not state the renewal or that the charge is in US dollars. Feedback leaves the product by email. Nothing in our database records the steps from signup to payment without a third-party tracker.

## Goals

-   With the trial flag on, signup and a later refresh open the assistant until the trial day or the message cap is reached. No card is collected to start. The existing Stripe checkout is the upgrade.
-   A paying subscription and a complimentary `byokFreeUntil` keep the access they have today. Turning the flags off returns the current paywall.
-   The first question is personal use. Professional use then picks one of the eight launch sectors, or Other. The choice configures one assistant and shows three starter prompts. Spanish is the default copy. English is available when the account locale starts with `en`.
-   A short checklist deep-links to the choice, the existing integrations overlay, files, and the composer. It completes from real records and can be reopened.
-   The plan page states the current monthly price, the launch coupon when the server already returns one, the renewal, the currency, and the existing cancellation behavior. It adds no refund, deadline, or DOP claim.
-   Feedback is a draft the person edits and sends in the existing Support chat.
-   Funnel rows live in our database. They store no message text.

## Non-goals

-   No public demo, no Google or Apple sign-in, no WhatsApp, no DOP, no new payment method, no fiscal invoice, no sector CRM, no template library, no autonomous send.
-   No change to privacy-policy text, store listings, DNS, production env, or Stripe objects.
-   No PostHog events for this funnel. The existing analytics client is left as it is.
-   No dashboard.
-   Photography, finance, and agriculture are not choices.
-   Desktop is the web UI inside Electron. It gets these screens because it loads the web app. There is no separate desktop screen and no store build.

## Flags

Parsed by `readAlmaFlags` in `packages/db/src/alma-flags.ts`. Absent or any value other than the exact string `true` is off. `1` and `yes` are off.

| Env                      | Meaning                                                                             | Default |
| ------------------------ | ----------------------------------------------------------------------------------- | ------- |
| `ALMA_TRIAL_ENABLED`     | Start and enforce the no-card trial                                                 | off     |
| `ALMA_TRIAL_DAYS`        | Length of a trial started while this value is set. Integer 1 through 90.            | 14      |
| `ALMA_TRIAL_MESSAGE_CAP` | User messages that may start a model run during that trial. Integer 1 through 1000. | 50      |
| `ALMA_ONBOARDING_V2`     | Sector question, starter assistant, checklist, plan sentences, feedback entry       | off     |

`ALMA_TRIAL_DAYS` and `ALMA_TRIAL_MESSAGE_CAP` are validated only when the trial flag is on. An out-of-range value throws from `readAlmaFlags`. `loadEnv` in `apps/api/src/env.ts` and worker startup in `apps/worker/src/index.ts` both call it, so a bad value fails before serving. The four names are added to the `environment:` block of the `api` and `worker` services in:

-   `infra/compose/docker-compose.yml`
-   `infra/compose/docker-compose.images.yml`
-   `infra/compose/docker-compose.prod.yml`

Compose lists the key with an empty value, which passes the host value through only when it is set. `infra/updater/src/compose-env.test.ts` fails if a key read by `apps/api` or `packages/db` is missing from those files.

The phone and the web app do not read these variables. They read fields on `Me` and `BillingStatus`.

## ON01 — No-card trial

### Who gets one

`billing/status` calls `ensureAlmaTrial` before it computes `access`. The insert runs only when all of these are true:

-   `ALMA_TRIAL_ENABLED` is on.
-   The organization has no `alma_trials` row.
-   `billing_accounts.status` is not `trialing`, `active`, or `past_due`.
-   `billing_accounts.subscribedAt` is null.
-   `model_credit_accounts.byokFreeUntil` is null. A past or future complimentary timestamp blocks a trial. The column is not modified.
-   `model_credit_accounts.mode` is not `byok`. An own-key organization is either complimentary or waiting to pay. It does not receive a trial.
-   The credit balance is 0. A positive balance already has access through `hasModelAccess`.

The insert is one statement, `INSERT ... ON CONFLICT ("organizationId") DO NOTHING`. Two concurrent status calls leave one row. `startedAt` is the database `now()`. `endsAt` is that time plus `ALMA_TRIAL_DAYS`. `messageCap` is the cap at insert time. Later edits to the env do not change an existing row.

A second organization for the same person is a second trial. This slice does not bind a trial to a device or a card. That gap is an owner decision, not a silent fraud system.

### Access

`hasModelAccess` in `packages/db/src/billing.ts` keeps every current true result. The new argument is optional and defaults to null, so existing callers stay on the current result.

```ts
export type AlmaTrialAccess = {
  endsAt: Date;
  messagesUsed: number;
  messageCap: number;
} | null;

export function hasModelAccess(
  credits: { mode: string | null; balanceMicros: bigint; byokFreeUntil: Date | null },
  subscriptionStatus: string | null,
  now = new Date(),
  trial: AlmaTrialAccess = null,
): boolean;
```

Order:

1. `hasBillingAccess(subscriptionStatus)` returns true for `trialing`, `active`, and `past_due`. A paying organization never depends on the trial row.
2. Own-key mode with a free plan (`resolveByokMonthlyPriceCents() === null`) or a future `byokFreeUntil` returns true.
3. A positive credit balance outside own-key mode returns true.
4. A free credit plan returns true.
5. Only if those are false: the trial grants access when `trial` is non-null, `endsAt > now`, and `messagesUsed < messageCap`.

`spaceHasModelAccess` loads the trial row for the space's organization and passes it in. The worker process already runs inside `runAsSystem`, and the API request runs as the tenant. The trial table's policies allow both (see Migration).

`billing/status` sets `access` from `hasModelAccess` including the trial. `SubscriptionGate` and the phone inbox already open the app when `access` is true and show the paywall when it is false. No second gate is added.

`BillingStatus` gains an optional object so an older client ignores it:

```ts
almaTrial: {
  endsAt: string; // ISO
  messagesUsed: number;
  messageCap: number;
  daysLeft: number;
  messagesLeft: number;
} | null
```

`daysLeft` is `0` when `endsAt` is not after now. Otherwise it is `Math.ceil((endsAt - now) / 86_400_000)`. `messagesLeft` is `max(0, messageCap - messagesUsed)`. The field is `null` when the flag is off or the organization has no row. A complimentary period does not fill this object.

### Message cap

A user message counts when it is accepted on a non-support bot and a model run is about to start. Support-chat messages do not count. Routine runs, retries of the same message, and group fan-out do not count. The cap is on user messages, which is what the env name says. Routine cost stays inside the trial's clock and the existing managed-model budget.

The increment is one conditional update inside the `sendThreadMessage` transaction in `apps/api/src/thread-target.ts`, after active runs are loaded and before the user message is inserted, and only when that send will queue a new run. `threads/followUp` calls the same function before it stores a message. The support branch in `threads.ts` returns before either path. See Review resolutions.

```sql
UPDATE alma_trials
SET "messagesUsed" = "messagesUsed" + 1, "updatedAt" = now()
WHERE "organizationId" = $org
  AND "endsAt" > now()
  AND "messagesUsed" < "messageCap"
RETURNING "messagesUsed";
```

If the organization has no trial row, the update matches nothing and the send continues under the existing access check. If the row exists and the update matches nothing, the send throws `ORPCError("FORBIDDEN", { message: "trial_limit" })` and does not insert the user message. The client treats that message as the upgrade prompt and opens the existing plan page (`showPlans` on the web, `/paywall` on the phone). The next `billing/status` returns `access: false`, so a refresh shows the paywall.

The web and phone error text for that code:

-   English: `The trial has reached its limit.`
-   Spanish: `La prueba llegó a su límite.`

### Countdown and upgrade

When `almaTrial` is non-null and `access` is true, the web shell (`apps/web/src/pages/Shell.tsx`) shows one line above the thread:

-   English: `{days} days left · {left} messages`
-   Spanish: `Quedan {days} días · {left} mensajes`
-   One day: `1 day left` / `Queda 1 día`
-   One message: `1 message` / `1 mensaje`

The button label is `Upgrade` / `Mejorar plan`. It opens the existing plan dialog (`useBilling().showPlans`), which already calls `billing/checkout`.

The phone inbox (`apps/mobile/app/index.tsx`) shows the same sentence under the header and a button that pushes `/paywall`.

When the trial row exists and `access` is false, the plan page adds one line and no other new promise:

-   English: `The trial ended.`
-   Spanish: `La prueba terminó.`

## ON02 and ON03 — Personal use, sector, starter assistant

### When the question appears

`Me` gains optional fields:

```ts
onboardingV2: boolean; // omitted by older servers
needsSectorChoice: boolean;
```

`needsSectorChoice` is true only when `ALMA_ONBOARDING_V2` is on, the organization has no `alma_profiles` row, and both of these are true:

-   The organization does not already have model access from a subscription, a complimentary `byokFreeUntil`, or a positive credit balance.
-   No non-support bot in the organization has a user message.

Otherwise, if the flag is on and no profile exists, `ensureAlmaProfile` writes one row with `source = "existing"`, `use = "skip"`, `sector = null`, and does not change any bot. Paying and complimentary accounts are not shown the question. `needsSectorChoice` is then false.

A new trial account has no user messages and no prior access, so the question shows.

### Screen

Web route `/onboarding/sector`, rendered by `apps/web/src/pages/SectorStart.tsx`, still behind `SubscriptionGate`. `OnboardingPage` redirects there when `needsSectorChoice` is true, before the model form. The phone pushes `apps/mobile/app/sector.tsx` from the inbox when `needsSectorChoice` is true.

Step 1. Title `What do you want ALMA for first?` / `¿Para qué quieres ALMA primero?`

-   `Personal use` / `Uso personal`
-   `Work` / `Trabajo`
-   `Skip` / `Omitir`

Personal use saves and finishes. Work opens step 2. Skip saves and finishes.

Step 2. Title `What kind of work?` / `¿En qué trabajas?` A text field filters the rows by the name in the active language. Rows, in this order:

| id               | English        | Spanish        |
| ---------------- | -------------- | -------------- |
| `abogados`       | Law            | Abogados       |
| `notaria`        | Notary office  | Notarías       |
| `arquitectura`   | Architecture   | Arquitectura   |
| `contabilidad`   | Accounting     | Contabilidad   |
| `clinica-dental` | Dental clinic  | Clínica dental |
| `clinica-medica` | Medical clinic | Clínica médica |
| `inmobiliaria`   | Real estate    | Inmobiliarias  |
| `seguros`        | Insurance      | Seguros        |
| `otro`           | Other          | Otro           |

Step 2 also has `Skip`.

### Saved profile

Table `alma_profiles`, one row per organization:

| Column                   | Type              | Notes                           |
| ------------------------ | ----------------- | ------------------------------- |
| `organizationId`         | text, primary key | Cascades on organization delete |
| `userId`                 | text              | The person who chose            |
| `use`                    | text              | `personal`, `work`, or `skip`   |
| `sector`                 | text, null        | A sector id, or null            |
| `source`                 | text              | `choice` or `existing`          |
| `checklistDismissedAt`   | timestamp, null   |                                 |
| `createdAt`, `updatedAt` | timestamp         |                                 |

`use = personal` stores `sector = personal`. `use = work` stores the chosen sector id. Skip stores `use = skip`, `sector = null`, `source = choice`, and does not rewrite a bot.

RPC `onboarding/sector`, authenticated, owner or any member of the organization (the first member is the owner at signup):

```ts
input: { use: "personal" | "work" | "skip"; sector?: SectorId }
output: { ok: true; botId: string | null }
```

`work` without a sector id is a validation error. `personal` and `skip` ignore `sector`. The write is an upsert on `organizationId`, so a later change from settings replaces the row. Changing the sector rewrites the assistant only when that bot's current instructions still equal the instructions this module last applied (compared as a string). Edited instructions are left alone.

Settings reopens the same screen. Web: an item `Your work` / `Tu trabajo` in the account menu (`apps/web/src/components/AccountMenu.tsx`) when `onboardingV2` is true. Phone: a row on `apps/mobile/app/(settings)/account.tsx` with the same label.

### Assistant and starter prompts

The catalog is `packages/contracts/src/alma-sectors.ts`. The API applies it. The clients use it for labels and for the prompt they insert. Instructions are Spanish unless `user.locale` starts with `en`.

Shared instruction, Spanish, with the bot name filled in:

> Eres {name}. Respondes en español de la República Dominicana y tratas de usted, salvo que te pidan otro idioma. Preparas borradores para que la persona los revise. No inventas fechas, montos, diagnósticos, coberturas ni citas. Si falta un dato, escribes [DATO PENDIENTE]. No envías mensajes ni presentas trámites.

English:

> You are {name}. You reply in English unless asked for another language. You prepare drafts for the person to review. You do not invent dates, amounts, diagnoses, coverage, or appointments. A missing fact is marked [DATO PENDIENTE]. You do not send messages or file anything.

Bot names:

| sector           | Spanish name           | English name          |
| ---------------- | ---------------------- | --------------------- |
| `personal`       | Asistente              | Assistant             |
| `abogados`       | Asistente legal        | Legal assistant       |
| `notaria`        | Asistente notarial     | Notary assistant      |
| `arquitectura`   | Asistente de obra      | Site assistant        |
| `contabilidad`   | Asistente contable     | Accounting assistant  |
| `clinica-dental` | Recepción dental       | Dental desk           |
| `clinica-medica` | Recepción              | Front desk            |
| `inmobiliaria`   | Asistente inmobiliario | Real estate assistant |
| `seguros`        | Asistente de seguros   | Insurance assistant   |
| `otro`           | Asistente              | Assistant             |

The target bot is the first non-support bot in the space (`spawnKey = "onboarding:first"`, else the oldest standard bot). If none exists, `onboarding/sector` creates one with that spawn key, the sector name, the instructions, `notifyOnFinish: true`, and no computer. It does not create a second bot when one exists. It renames the existing one only when the name is still `Chief` or still a name from this catalog.

Each sector has three starter prompts. Tapping one inserts the prompt into the composer. It does not send. The person sends it, which counts as a trial message. The prompts ask for missing facts and produce a draft. They do not claim a connected calendar, a sent message, or a filed document.

Personal:

1. `Plan the day` / `Ordenar el día` — Ask for the three things that cannot slip and propose a schedule. Do not invent appointments.
2. `Reminder` / `Recordatorio` — Draft a reminder the person can copy. Ask what and when.
3. `Reply draft` / `Borrador de respuesta` — Draft a short polite reply. The person pastes the message.

Law:

1. `New matter checklist` / `Lista de un caso` — List missing facts for a new matter. Do not state a deadline.
2. `Chronology` / `Cronología` — Turn pasted notes into a chronology. Add no fact that is not in the text.
3. `Draft` / `Borrador` — Draft in formal Spanish, marked BORRADOR. It is not a signed act.

Notary:

1. `Act checklist` / `Lista del acto` — Ask which act and list documents. Do not say the act is valid.
2. `Power of attorney draft` / `Poder en borrador` — Draft marked BORRADOR. Leave unknown facts blank.
3. `Signing appointment` / `Cita de firma` — Propose a scheduling text. Do not confirm a time the person did not give.

Architecture:

1. `Site diary` / `Diario de obra` — Date, place, what was seen, what is pending. Do not certify structure.
2. `Budget lines` / `Partidas` — A table from what the person dictates. Do not invent prices.
3. `Permit letter` / `Carta de trámite` — A short municipal letter marked BORRADOR. No invented file numbers.

Accounting:

1. `Month-end list` / `Cierre del mes` — A checklist the person marks. Do not compute tax or say a filing was sent.
2. `Missing documents` / `Documentos faltantes` — List documents from what the person describes. Do not invent amounts.
3. `Follow-up draft` / `Borrador de seguimiento` — A short request for a document, for the person to review before sending.

Dental and medical each use:

1. `Appointment text` / `Texto de cita` — A confirmation draft. Do not invent the time or the name.
2. `Recall text` / `Texto de seguimiento` — A short invitation. Do not state insurance coverage.
3. `Front-desk list` / `Lista de recepción` — Non-clinical intake questions. No diagnosis. The medical third prompt adds: if the person describes an urgent symptom, say a person at the clinic should see them now, and do not diagnose.

Real estate:

1. `Lead card` / `Ficha` — Ask zone, USD budget, and timing. Do not invent availability.
2. `Visit text` / `Texto de visita` — A scheduling draft. Do not confirm a time that was not given.
3. `Next-day note` / `Nota de seguimiento` — A short follow-up draft.

Insurance:

1. `Renewal list` / `Lista de renovación` — Facts needed for a renewal. Do not invent a premium or say a policy is in force.
2. `Compare figures` / `Comparar cifras` — Compare only numbers the person pastes. Missing ones are `[DATO PENDIENTE]`.
3. `Claim pack` / `Aviso de siniestro` — Documents to gather. Do not decide coverage.

Other:

1. `Today's task` / `Tarea de hoy` — Ask what they do and what is due today.
2. `List` / `Lista` — Turn dictation into a list.
3. `Draft` / `Borrador` — A short message for them to review.

### Workspace

On an empty non-support thread, when `onboardingV2` is on and the profile `source` is `choice`, the thread shows three quiet lines and the three buttons. It does not add a second home app.

-   `Nothing due today.` / `Nada pendiente hoy.`
-   `No files yet.` / `Todavía no hay archivos.`
-   `Calendar and email connect in Settings. They are not connected.` / `El calendario y el correo se conectan en Ajustes. No están conectados.`

The third line is a button that opens the existing integrations overlay (`setOverlay({ kind: "integrations" })` in `apps/web/src/pages/Shell.tsx`). On the phone it pushes `/(settings)/integrations`. The lines stay honest: this slice does not invent pending work or files. After the first user message, the lines hide and the chat is the thread. The three prompts stay available from the checklist's first-task step.

## ON04 — Checklist

RPC `onboarding/checklist` returns:

```ts
{
  visible: boolean;
  dismissed: boolean;
  steps: Array<{
    id: "assistant" | "calendar" | "email" | "file" | "task";
    done: boolean;
  }>;
}
```

`visible` is true when the flag is on, a profile exists, `source` is `choice`, and `checklistDismissedAt` is null. `dismissed` mirrors the timestamp. Steps are computed, not stored:

| id          | Done when                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `assistant` | `use` is `personal` or `sector` is a non-null sector id                                                 |
| `calendar`  | The space has a connection whose catalog id contains `calendar`                                         |
| `email`     | The space has a connection whose catalog id is `gmail` or `outlook`, or a messaging installation exists |
| `file`      | The space has at least one artifact                                                                     |
| `task`      | A non-support bot in the space has at least one user message                                            |

`onboarding/checklistDismiss` sets `checklistDismissedAt`. `onboarding/checklistReopen` clears it. Both return the checklist.

The web list sits under the trial line in the shell. The phone list sits under the trial line on the inbox. Each row navigates:

-   assistant → the sector screen
-   calendar and email → the integrations overlay (phone: integrations settings)
-   file → `/app/artifacts` (phone: `/artifacts`)
-   task → the first standard bot's composer

Labels: `Setup` / `Preparación`, and `Assistant`, `Calendar`, `Email`, `First file`, `First task` with Spanish `Asistente`, `Calendario`, `Correo`, `Primer archivo`, `Primera tarea`. Dismiss is `Hide` / `Ocultar`. The account menu item `Setup` / `Preparación` calls reopen and shows the list again. When every step is done, the list still shows until it is hidden.

Connectors are not required before chat. An undone calendar row is a link, not a block.

## ON08 — Plan page

`BillingStatus.planClarity` is an optional boolean. The server sets it true when `ALMA_TRIAL_ENABLED` or `ALMA_ONBOARDING_V2` is on. When it is absent or false, `CreditChoice` in `apps/web/src/components/ModelCredits.tsx` and `apps/mobile/app/paywall.tsx` stay as they are today, including the existing launch-offer line.

When it is true, the own-key monthly block adds these sentences. Prices come from `byokPriceCents` and `byokPromo`. The copy does not hardcode 9 or 59. If the server price is 5900 cents, the formatted price is 59 US dollars. The existing formatter (`formatBillingAmount`) is used.

When `byokPromo` is set:

-   Keep the current sentence `{promo}/month for your first {months} months, then {price}/month` and its Spanish catalog line.
-   Add: `Billed in US dollars.` / `Se cobra en dólares de Estados Unidos.`
-   Add: `After that, the plan renews at {price}/month until you cancel.` / `Después, el plan se renueva a {price}/mes hasta que lo canceles.`

When `byokPromo` is null:

-   `{price}/month, billed in US dollars.` / `{price}/mes, en dólares de Estados Unidos.`
-   `The plan renews monthly until you cancel.` / `El plan se renueva cada mes hasta que lo canceles.`

Always, when `planClarity` is true:

-   `Cancel in the billing portal. Access lasts through the period already paid.` / `Cancela en el portal de facturación. El acceso dura hasta el final del período ya pagado.`

The yearly interval does not show the coupon sentences. The coupon is monthly-only in the existing checkout code. No end date is shown for the offer. No refund window is stated. No DOP amount is shown.

Opening this page records `plan_viewed` (see UX02). The subscribe button records `checkout_started` inside `billing/checkout` before the Stripe session is created. A failed session does not record `payment_completed`.

## UX01 — Feedback

The control is shown only when the current space has a bot with `kind === "support"`. If the support flag is off, the bot does not exist and the control is hidden. This slice does not create support bots and does not add an email fallback.

Web: a menu item on the non-support thread header, `Feedback` / `Comentarios`. Phone: the same item in the thread menu (`apps/mobile/app/thread.tsx`).

It opens the support thread and puts this text in the composer. It does not send.

-   English: `I want to comment on an answer.` then a newline, `What I expected:` newline, `What happened:` newline.
-   Spanish: `Quiero comentar una respuesta.` newline, `Qué esperaba:` newline, `Qué ocurrió:` newline.

The person edits that text and may attach a file with the existing composer. Send uses `threads/send`. The existing support forward delivers it to Chatwoot. No run id, prompt, or timing is attached.

## UX02 — Funnel events

Table `activation_events`:

| Column           | Type              | Notes                             |
| ---------------- | ----------------- | --------------------------------- |
| `id`             | text, primary key | cuid                              |
| `organizationId` | text              |                                   |
| `userId`         | text              |                                   |
| `name`           | text              | One of the names below            |
| `dedupeKey`      | text, unique      |                                   |
| `sector`         | text, null        | Profile sector at insert, or null |
| `use`            | text, null        | Profile use, or null              |
| `createdAt`      | timestamp         |                                   |

Insert is `INSERT ... ON CONFLICT ("dedupeKey") DO NOTHING`. A failed insert is logged and does not fail the user action. Rows contain no message body, email, or prompt. They are not sent to PostHog.

| name                | When                                                                       | dedupe key                                              |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `signup`            | The trial row is inserted                                                  | `signup:{organizationId}`                               |
| `sector_chosen`     | `onboarding/sector` saves `source = choice`                                | `sector_chosen:{organizationId}:{use}:{sector or none}` |
| `assistant_ready`   | The sector save applies instructions                                       | `assistant_ready:{organizationId}:{sector or none}`     |
| `task_started`      | A counted trial or v2 user message is accepted                             | `task_started:{messageId}`                              |
| `task_completed`    | That message's run reaches `succeeded`                                     | `task_completed:{runId}`                                |
| `limit_reached`     | The cap update matches nothing, or status sees `endsAt` in the past        | `limit_reached:{organizationId}:cap` or `:time`         |
| `plan_viewed`       | The plan page calls `onboarding/event`                                     | `plan_viewed:{organizationId}:{UTC date}`               |
| `checkout_started`  | `billing/checkout` is about to create a session                            | `checkout_started:{organizationId}:{UTC date}`          |
| `payment_completed` | A billing sync first observes `active` or `trialing` for a subscription id | `payment_completed:{organizationId}:{subscriptionId}`   |

`onboarding/event` accepts only `{ name: "plan_viewed" }`. Any other name is a validation error. The server fills the organization, user, sector, and use.

`task_completed` is written from the worker when a run finishes, looking up the user message that started it. If the run was not counted as `task_started`, no completion row is written. The worker already runs as system, so the insert is allowed by the system policy.

Events are written only when `ALMA_TRIAL_ENABLED` or `ALMA_ONBOARDING_V2` is on. `signup` and `limit_reached` require the trial flag. There is no backfill.

## Migration

One migration, `packages/db/prisma/migrations/20261119120000_alma_activation/migration.sql`, plus the matching models on `Organization` in `packages/db/prisma/schema.prisma`. The folder sorts after `20261118120000_support_bot`, so it applies on databases that already ran the support migration.

The three tables start empty. The previous release does not read them. Adding them is safe while the old API is still serving. Rollback is the flags off. The tables stay. Nothing in this migration is marked `-- deferred` because nothing is dropped.

Row-level security follows Review resolutions: space-to-organization tenant policy with `WITH CHECK`, system policy `(SELECT app_rls_bypass())`, and `GRANT SELECT, INSERT, UPDATE, DELETE` to `rakazo_app` on the three tables. The Prisma models are listed in `ROW_SECURITY_MODELS`.

No `*_previous_release` policy. The old process has no queries against these tables.

## Client and API files

New:

-   `packages/contracts/src/alma-sectors.ts` — sector ids, names, bot names, instructions, three prompts, both languages.
-   `packages/contracts/src/alma-sectors.test.ts` — eight sectors plus personal and other; three prompts each; both languages non-empty; no phrase `abogado IA`.
-   `packages/db/src/alma-trial.ts` — `ensureAlmaTrial`, `loadAlmaTrial`, `consumeTrialMessage`.
-   `packages/db/src/alma-activation.ts` — profile upsert, checklist query, event insert.
-   `packages/db/src/alma-activation.postgres.test.ts` — one trial, conflict, cap, complimentary exclusion, event dedupe, checklist facts.
-   `apps/web/src/pages/SectorStart.tsx` and `SectorStart.test.tsx`.
-   `apps/web/src/components/TrialBanner.tsx` and `TrialBanner.test.tsx`.
-   `apps/web/src/components/SetupChecklist.tsx` and `SetupChecklist.test.tsx`.
-   `apps/mobile/app/sector.tsx`.

Edited:

-   `packages/db/src/billing.ts` and `billing.test.ts` — the extra argument. Existing cases pass `null` and keep their results. New cases cover an active trial, an expired trial, a full cap, a paying status with a trial row, and a future `byokFreeUntil` with a trial row.
-   `packages/db/src/index.ts` — export the new modules. `export *` already exports `billing.ts`.
-   `packages/contracts/src/domain.ts` — `almaTrial`, `planClarity`, `onboardingV2`, `needsSectorChoice`.
-   `packages/contracts/src/rpc.ts` — `onboarding/sector`, `onboarding/checklist`, `onboarding/checklistDismiss`, `onboarding/checklistReopen`, `onboarding/event`.
-   `apps/api/src/env.ts` and `env.test.ts`.
-   `apps/api/src/billing.ts` — pass the trial into `hasModelAccess`, fill `almaTrial` and `planClarity`, record `checkout_started` and `payment_completed`.
-   `apps/api/src/routes/shared.ts` — `onboardingV2` and `needsSectorChoice` on `me`.
-   `apps/api/src/routes/mcp.ts` — the five onboarding handlers next to `signupSurvey`.
-   `apps/api/src/routes/threads.ts` — consume a trial message or throw `trial_limit`; record `task_started`.
-   The run-completion path in `packages/adapters/src/executor.ts` — one call to record `task_completed` after a run is marked succeeded. No other executor change.
-   `apps/web/src/pages/Onboarding.tsx` — redirect when `needsSectorChoice`.
-   `apps/web/src/App.tsx` — the `/onboarding/sector` route beside the other onboarding route.
-   `apps/web/src/pages/Shell.tsx` — trial line, checklist, feedback menu.
-   `apps/web/src/components/ModelCredits.tsx` — the plan sentences.
-   `apps/web/src/components/AccountMenu.tsx` — `Your work` and `Setup`.
-   `apps/mobile/app/index.tsx`, `paywall.tsx`, `thread.tsx`, `(settings)/account.tsx`.
-   `apps/mobile/lib/locales/es.ts` — Spanish lines for the new English source strings. Other phone locales fall back to English.
-   `packages/testkit/src/authorization.test.ts` — the five new procedures in the unauthenticated list.
-   `apps/web/e2e/billing-paywall.spec.ts` — a stubbed status with `almaTrial` and `planClarity` so the countdown and the renewal sentence render. A sector-screen test stubs `me.needsSectorChoice`.
-   The three compose files.

`pnpm --filter @rakazo/web intl:extract` is run and the updated catalogs are committed. Spanish entries for the new strings are filled in `apps/web/src/locales/es/messages.po`. English stays the source in `apps/web/src/locales/en/messages.po`.

## Tests

-   Unit: `hasModelAccess` matrix, including paying and complimentary rows that also carry a trial.
-   Unit: sector catalog shape and the banned phrase.
-   Postgres: trial insert once; complimentary and subscribed organizations get no row; the conditional update stops at the cap; a second event with the same dedupe key does not add a row; checklist steps flip when a connection, an artifact, or a user message exists.
-   API: `billing/status` access true during a trial and false after the cap; `threads/send` returns 403 `trial_limit` on the next message; a support send does not increment.
-   Authorization: the five new procedures return 401 without a session.
-   Web component tests for the sector steps, the countdown, and the checklist rows.
-   Playwright, stubbed RPC, for the plan sentences and the sector screen.

The desktop Electron suite is not run locally. Phone store builds are not run.

## Decisions for owner

These are not decided by this implementation. The flags stay off until you turn them on.

1. **Trial length and cap.** The code defaults are 14 days and 50 user messages. Confirm or replace them before `ALMA_TRIAL_ENABLED` is set in production.
2. **Expired complimentary accounts.** An organization with any `byokFreeUntil`, past or future, does not get a trial. Confirm that an expired complimentary account should stay on the paywall.
3. **Own-key mode.** An organization already in `byok` mode does not get a trial, even if the free period is empty. Confirm that.
4. **One trial per organization.** A second account is a second trial. This slice does not add a device or card check. Say if that hole has to close before the flag goes on.
5. **Routine runs.** They do not consume the message cap. They stop when the trial clock ends, and they still sit under the existing managed-model budget. Say if a routine run should count as a message.
6. **Funnel screen.** Events are stored and not shown in the product. Say if you want a page.
7. **Feedback depends on the support bot.** The control is hidden until `SUPPORT_BOT_ENABLED` has created that bot. Confirm that email is not required as a second path.
8. **Sectors.** Personal use plus the eight launch sectors plus Other. Photography, finance, and agriculture are omitted. Confirm that list.
9. **Plan copy.** Renewal and US-dollar sentences appear only when a flag is on. The 9-dollar line appears only when the existing coupon field is already returned. No refund sentence was added. Confirm the quoted sentences before the flag is on.
10. **Silent skip.** An organization that already has access, or that already has a user message, does not see the question. They can open `Your work` later while the onboarding flag is on.
