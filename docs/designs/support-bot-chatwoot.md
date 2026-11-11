# Support bot connected to Chatwoot

Status: draft spec. No feature code yet. Do not merge, deploy, build, or change Chatwoot settings without Damien's OK.

## 1. Goal

Every ALMA user has a pinned bot called **Support**. The name is translated: "Soporte" in Spanish, "Support" in English, following the user's app language. Messages in this chat never go to an AI model. They go to a human support agent in Damien's Chatwoot cloud account (178581). Agent replies come back into the same chat live, and a push notification is sent to the user's phone.

Non-goals: AI triage or Chatwoot Captain inside ALMA; agents seeing the user's other bots, chats, documents, or memory; new support-only screens beyond small tweaks to the existing chat.

## 2. Terms

- **Support bot**: a `Bot` row with `kind = "support"`. There is exactly one per user per space.
- **Chatwoot inbox**: a new inbox of type _API channel_ in account 178581, named, for example, "ALMA App". It is created only after Damien's OK. The 8 inboxes that exist today are WhatsApp, email, website widget, and Facebook, and none of them is an API channel.
- **Contact**: a Chatwoot contact whose `identifier` is the ALMA user id.
- **Support conversation**: the single Chatwoot conversation for one ALMA user. Its id is stored on our side.

## 3. Data model (packages/db)

- `Bot.kind String @default("standard")`. Values: `standard` and `support`. This is a single new column with a default, which keeps the conflict risk with upstream low.
- New table `SupportLink`: `userId` (unique), `spaceId`, `botId`, `chatwootContactId`, `chatwootSourceId` (the API-channel contact_inbox source id), `chatwootConversationId`, `createdAt`, `updatedAt`.
- New table `SupportInboundMessage` for idempotency: `chatwootMessageId` (unique), `messageId`.
- Message rows reuse the existing `Message` table and stay encrypted the way they already are. Agent replies use `role = "assistant"`, have `botId` set to the support bot, and have no `runId`. A `blocks` metadata entry `{ source: "chatwoot", agentName }` lets the UI show the agent's first name.

## 4. Creating the bot

- **New users**: the onboarding code that creates the first bot (`packages/db/src/repos.ts` `createBot`, called from onboarding) also calls `ensureSupportBot(userId, spaceId)`. That call is idempotent.
- **Existing users**: a one-off backfill script, `apps/api/src/cli/backfill-support-bots.ts`, runs `ensureSupportBot` for every user. It processes users in batches and can safely be rerun.
- The support bot has `pinned = true` and `position = -1`, so it sits at the top. It has no computer, no model, empty instructions, `dailyCheckIns = false`, `fleetManagement = false`, and `notifyOnFinish = true`.
- **Its name**: the stored `name` is the fixed key `"Support"`. Clients display `t("support.botName")`, which is "Support" in en and "Soporte" in es, whenever `kind === "support"`. A rename attempt is rejected.
- **Users cannot delete, archive, rename, or unpin it**. `apps/api/src/routes/bots.ts` and `apps/api/src/bot-removal.ts` return 403 `support_bot_locked`, and the UI hides those menu items. When a whole account is deleted, the bot is still removed (cascade).
- **Spaces**: if a user belongs to several spaces, the support bot lives only in their personal or first space. This keeps one support conversation per user.

## 5. User sends a message (outbound)

Hook point: the user-message path in `apps/api/src/routes/threads.ts` (`sendUserMessage`, about line 396). That path normally starts an AI run (`runContinueJob`, packages/adapter-kit).

1. The message is stored and the live event is sent exactly as today. The user sees their message right away.
2. If the thread's bot has `kind === "support"`, **no run is started**: no model call, no usage, no billing count. Instead the code enqueues a background job `support.forward(messageId)`.
3. The job does the following:
   - It makes sure the Chatwoot contact exists. It creates it if needed with `identifier = userId`, the user's name and email, and `identifier_hash = HMAC-SHA256(CHATWOOT_HMAC_KEY, userId)`. That is the inbox's identity validation key, and with it agents see a verified badge.
   - It makes sure a conversation exists. If the stored conversation is `resolved`, it reopens it (`toggle_status` to `open`). If it was deleted, it creates a new one and saves the new id.
   - It posts the message as `message_type: incoming`. It includes attachments (multipart) and sends `echo_id = messageId`, so that the webhook echo is ignored.
4. The job retries with backoff for up to 24 hours. If it still fails, the message shows a small "Not delivered, tap to retry" state.

Commands like `/` skills, `@` mentions, voice-mode AI calls, and Stop do nothing in this chat (see §8).

## 6. Agent replies (inbound)

- The new route is `POST /api/support/chatwoot/webhook`, in a new file `apps/api/src/support-chatwoot-webhook.ts`.
- **Verifying the call**: The URL path carries `ALMA_CHATWOOT_WEBHOOK_SECRET`. `account.id` and `inbox.id` must match the config. Chatwoot cloud also sends `X-Chatwoot-Signature` (`sha256=` + hex HMAC-SHA256 of `CHATWOOT_INBOX_WEBHOOK_SECRET` over `{X-Chatwoot-Timestamp}.{raw body}`), `X-Chatwoot-Timestamp`, and `X-Chatwoot-Delivery`. Verify the signature with a constant-time compare, reject timestamps older than 5 minutes, and dedupe on the delivery id. If the signature headers are absent, the URL secret plus the account and inbox check is enough. Anything that fails gets a 401 and is logged without the body. A disabled or incomplete config returns 404.
- **Events handled**: `message_created`, only when `message_type = outgoing` and `private = false`. Private notes are never shown to users. Messages echoed back from our own `echo_id` are ignored. `conversation_status_changed` is only logged for now.
- **What we do with a reply**: look up the `SupportLink` by conversation id, then idempotently insert a `Message` (keyed on the Chatwoot message id). Then call `events.notify(threadId, seq)`, which updates web, desktop, and mobile live through the existing stream (`packages/db/src/events.ts`). Then mark the thread unread and send an Expo push through the existing notification path (`packages/adapters/src/run-notifications.ts` and `expo-push.ts`). The push title is the translated `support.botName` and the body is the first 120 characters.
- **Attachments from the agent**: we download them from Chatwoot's `data_url` server-side and store them as ALMA artifacts. Clients never load chatwoot.com URLs directly.
- Automatic messages from Chatwoot, such as greetings or the out-of-hours reply, arrive as outgoing messages and are shown like any other reply.

## 7. Attachments, typing, read status

- Attachments in both directions use ALMA's existing limits (`ATTACHMENT_MAX_COUNT`). Any type ALMA accepts is passed on. Chatwoot itself has a 40 MB limit.
- Phase 1 has no typing indicator or read receipts. Phase 2 (optional) adds a `toggle_typing` call while the user types, and marks Chatwoot messages read when the user opens the chat (`update_last_seen`).

## 8. UI (web, desktop, mobile)

When `kind === "support"`:

- The header shows the translated name and a headset icon, with no model or thinking-level picker.
- These are hidden: the computer panel, Stop, call/voice-AI button, skills `/`, `@` mentions, "Report AI answer", regenerate, routines, instructions, memory, and bot settings. Composer, attach, and hold-to-dictate stay. Dictation becomes text before sending.
- An empty-chat hint, `support.emptyHint`, reads: "Write to the ALMA team. A person will reply here." In Spanish: "Escribe al equipo de ALMA. Una persona te responderá aquí."
- Agent messages show "{agentName} · ALMA" instead of the AI avatar.

## 9. i18n

New keys, at least in en and es, in the web Lingui catalogs (`apps/web/src/locales/*/messages.po`) and in `apps/mobile/locales/*.json`. Other locales fall back to en.

| key                  | en                                                | es                                                         |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| support.botName      | Support                                           | Soporte                                                    |
| support.emptyHint    | Write to the ALMA team. A person will reply here. | Escribe al equipo de ALMA. Una persona te responderá aquí. |
| support.notDelivered | Not delivered. Tap to retry.                      | No enviado. Toca para reintentar.                          |
| support.locked       | The Support chat can't be removed.                | El chat de Soporte no se puede eliminar.                   |
| support.pushTitle    | Support                                           | Soporte                                                    |

Server-side push text uses the user's saved locale.

## 10. Config (env, never in repo)

`CHATWOOT_BASE_URL` (https://app.chatwoot.com), `CHATWOOT_ACCOUNT_ID` (178581), `CHATWOOT_INBOX_ID`, `CHATWOOT_INBOX_IDENTIFIER`, `CHATWOOT_API_TOKEN`, `CHATWOOT_INBOX_WEBHOOK_SECRET` (signature key for `X-Chatwoot-Signature`), `CHATWOOT_HMAC_KEY` (optional inbox identity HMAC for contact `identifier_hash`), `ALMA_CHATWOOT_WEBHOOK_SECRET` (URL path token), `SUPPORT_BOT_ENABLED` (default `false`).

Optional allowlist from the rollout: `SUPPORT_BOT_USERS`, a comma-separated list of ALMA user ids. When it is unset, every user gets the bot once the switch is on. When it is set, only those users do.

- The values live only in Mia's `.env` for the alma user and in the secret store. They are never committed, logged, or pasted in chat.
- If `SUPPORT_BOT_ENABLED` is false or the config is incomplete, the bot is not created and the routes return 404. This keeps upstream behaviour unchanged.
- Chatwoot cloud signs API-inbox webhooks. `X-Chatwoot-Signature` is `sha256=` plus hex HMAC-SHA256 of the inbox webhook secret over `{X-Chatwoot-Timestamp}.{raw body}`. Reject timestamps older than 5 minutes (and more than 5 minutes ahead). Dedupe on `X-Chatwoot-Delivery`. The URL secret plus the account and inbox id check stays as the backup when no signature header is present.

## 11. Data location

Support chats are stored in **Chatwoot cloud (app.chatwoot.com), outside the Dominican Republic**. Legal work, documents, AI chats, and memory stay in ALMA's existing DR processing. Only what the user types or attaches in the Support chat, plus their name and email, goes to Chatwoot.

**Proposed wording (PENDING DAMIEN'S APPROVAL; do not publish until approved):**

Privacy policy, new paragraph. Goes into `apps/www/src/pages/privacy.astro` and the store privacy page.

- ES: "Tu trabajo jurídico, tus documentos y tus conversaciones con el asistente ALMA se procesan y almacenan únicamente en la República Dominicana. Si escribes en el chat de Soporte, ese mensaje, los archivos que adjuntes, tu nombre y tu correo se envían a Chatwoot (Chatwoot Inc.), nuestro proveedor de atención al cliente, que los almacena fuera de la República Dominicana solo para responderte. No compartas información confidencial de tus casos en el chat de Soporte."
- EN: "Your legal work, documents and conversations with the ALMA assistant are processed and stored only in the Dominican Republic. If you write in the Support chat, that message, any files you attach, your name and your email are sent to Chatwoot (Chatwoot Inc.), our customer support provider, which stores them outside the Dominican Republic only to answer you. Please don't share confidential case information in the Support chat."

Marketing and store claim, replacing "data processed in the DR only":

- ES: "Tus casos y documentos se procesan solo en la República Dominicana."
- EN: "Your cases and documents are processed only in the Dominican Republic."

In-app note under the support empty-chat hint, key `support.privacyNote`:

- ES: "No incluyas datos confidenciales."
- EN: "Don't include confidential details."

The account-deletion and data-export flows (`apps/api/src/account-deletion.ts`, `account-export.ts`) must also delete the Chatwoot contact and its conversations. Export includes the support thread from ALMA's own copy.

## 12. Upstream / thin-overlay rules

- New code goes in new files: `support-chatwoot-*.ts` in apps/api, `support-*` components, and one Prisma migration. Upstream files get only small guarded edits:
  - `threads.ts`: one `if (isSupportBot) return forwardToSupport(...)` before the run starts.
  - `routes/bots.ts` and `bot-removal.ts`: the lock check.
  - Onboarding: one `ensureSupportBot` call.
  - Chat header and composer: a `kind === "support"` guard.
- Add all new paths to `scripts/alma-overlay-manifest.txt`. Make `scripts/check-alma-overlay.sh` pass.
- Expect merge conflicts at the guarded edits during upstream syncs. Each one is a few lines and is listed in the manifest.

## 13. Test plan

- **Unit tests**:
  - `ensureSupportBot` is idempotent.
  - Lock checks return 403.
  - A support thread starts no run.
  - The identifier hash is computed correctly.
  - The webhook rejects a bad secret, a wrong account or inbox, private notes, and echoes, and drops duplicates.
  - Locale picks "Soporte" or "Support".
- **Integration**: a Postgres test plus a fake Chatwoot HTTP server cover the round trip: user message, then contact, conversation and message created; agent webhook, then message stored, event sent, push queued. A resolved conversation gets reopened.
- **Backfill**: the dry-run count matches the number of users. A second run creates 0.
- **Manual on staging or the preview**, with a test inbox: web, iOS, and Android. Check the attachment round trip, an out-of-hours auto-reply, a push while the app is closed, and deletion of an account.
- **Billing**: the support chat does not consume model usage.

## 14. Rollout

1. Damien approves this spec and the privacy wording.
2. With Damien's OK: create the "ALMA App" API-channel inbox in account 178581, assign the team and agents, turn on identity validation, set business hours and the out-of-hours message, and add the webhook URL.
3. A coding agent opens one PR. CI must be green. No merge without OK.
4. With OK: deploy to Mia with `SUPPORT_BOT_ENABLED=false`, migrate, set the secrets, then enable it for Damien's own account only (allowlist `SUPPORT_BOT_USERS`) and test.
5. Run the backfill, set `SUPPORT_BOT_ENABLED=true`, and publish the privacy policy update the same day.
6. The mobile release carrying the UI tweaks goes out on OK. Older app versions show the chat as a normal bot and messages still route correctly, because the server enforces everything.
7. Rollback: set `SUPPORT_BOT_ENABLED=false`. That hides the routes and stops forwarding. Rows can stay.

## 15. Open decisions

1. **Team and agents**: which Chatwoot team and agents own the "ALMA App" inbox. Default proposal: Damien plus the existing WEB DO support agents.
2. **Hours and out-of-hours text**: proposal, Mon–Fri 9:00–18:00 America/Santo_Domingo.
   - ES: "Gracias por escribir. Nuestro horario es de lunes a viernes, de 9:00 a 18:00 (hora de RD). Te responderemos lo antes posible."
   - EN: "Thanks for writing. Our hours are Monday to Friday, 9:00–18:00 (DR time). We'll reply as soon as we can."
3. **Privacy and marketing wording** in §11 (pending approval).
4. **Creating the inbox**: not approved yet.

## 16. Effort

About 4–5 working days of agent time:

- Server and data model: 2 days.
- UI on web, desktop, and mobile: 1–1.5 days.
- Tests and backfill: 1 day.

On top of that come Chatwoot setup (about 30 minutes, after OK) and one mobile store build.

## Appendix: Goldfish reviews

Two fresh passes that read only this file.

**Review 1 questions, now answered in the spec**: What happens if the user is in several spaces? (§4) Is model usage billed? (§5, §13) Can private notes leak? (§6) Who loads agent attachments, and does that leak the user's IP to Chatwoot? (§6) How do old mobile builds behave? (§14.6) Does account deletion reach Chatwoot? (§11)

**Review 2 questions, now answered in the spec**: Does the name get stored or translated? (§4: stored key, translated on display) How are duplicate webhooks handled? (`SupportInboundMessage`, §3/§6) What if a conversation was deleted in Chatwoot? (§5: recreate) Is there a kill switch? (§10, §14.7) Does dictation still work? (§8) What is the push language? (§9)

**Remaining for implementation**: confirm whether account 178581's plan offers signed webhooks. If not, the URL secret plus account and inbox checks are the minimum.
