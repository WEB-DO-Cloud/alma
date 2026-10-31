# ALMA managed model

*   **Author:** WEB-DO-Cloud/alma
*   **Status:** In Review
*   **Date:** 2026-10-26

--------------------------------------------------------------------------------

## Overview

The operator chooses one chat runtime for every lawyer on this server. Lawyers do not choose a provider, paste a key, or see a model name on a screen. The runtime that ships is xAI's Grok Build CLI (`grok`), started headlessly from the API and the worker. A later model hosted in the Dominican Republic is a second runtime id behind the same switch. It is not built in this change.

The named-lawyer approval gate, the draft log, and the wording "borradores para revisión" stay as they are. This change does not route cases or bill on outcomes.

## The Problem

The apps still treat the model as something each user connects. Onboarding asks for a backend AI (a provider key or a subscription such as Codex). Settings has a Models screen. Chat and bot screens have a model picker. Mobile has bot-model screens and an AI data sharing screen. Empty states and send errors tell the user to connect a model or name a key.

The operator, not the lawyer, decides which model runs. That model is Grok through the `grok` command and the operator's subscription session. `XAI_API_KEY` is a fallback for a host that cannot complete device login. Screens in the web, mobile, and desktop apps do not show provider names, model ids, or model keys. When the operator session is missing or rejected, the lawyer sees one sentence: `ALMA no está disponible en este momento`. One deployment shares one `GROK_HOME`. Organizations on that server use the same subscription and the same session store. Session ids are per thread, so two threads do not resume each other's Grok session.

## Goals

*   One server switch, `ALMA_MANAGED_MODEL`, defaults on. After trim and lowercasing, `0`, `false`, `no`, and `off` restore the previous bring-your-own-key path. Any other set value, and an unset value, are on.
*   While the switch is on, web, mobile, and desktop show no model, provider, or model-key setup. Desktop hosts the web UI, so the web change is the desktop change.
*   Every organization and every bot uses the operator runtime. Per-user credentials are not read and cannot be saved.
*   `ALMA_MODEL_RUNTIME=grok-build` is the runtime that ships. The API and the worker spawn `grok` with `shell: false`. Streaming output becomes the existing thread text events.
*   Grok's built-in tools are off. The process runs in an empty scratch directory that is not inside a git checkout. It does not receive the server's environment.
*   The operator signs in with `grok login --device-auth`. The session file is `GROK_HOME/auth.json` on a persistent volume. `XAI_API_KEY` is a fallback only, passed through to the child process and never written to the repo or to logs.
*   A missing or rejected session logs an operator error and shows the Spanish sentence above. The sentence does not mention keys, providers, or models.
*   Provider, model id, and base URL are operator environment variables so a later runtime can point at another host without a new user-facing setting.
*   New draft rows store that operator provider and model id. The lawyer does not type them. The approval hash is the draft text, so these fields do not change it. Screens hide them. The CSV keeps them.

## Non-Goals

*   No Agent Client Protocol client. `packages/adapters` has no session type for that protocol. Grok's tool lockdown flags apply to headless runs. The command in the architecture section is the one that ships.
*   No Dominican Republic model runtime. The registry has a slot for it. An unknown `ALMA_MODEL_RUNTIME` still lets the process boot. Its health check fails, runs yield the Spanish sentence, and the operator log is `alma.managed-model.runtime-failed` with the runtime id.
*   No change to draft approval, the review clock, lawyer identity, hashes, or the diff. The approval hash is the draft text. The record still stores a model and a model version. Screens do not show those two fields. The CSV still contains them.
*   No case routing and no outcome billing.
*   The marketing site in `apps/www` is out of scope. The in-scope apps are web, mobile, and desktop.
*   Memory and integration connectors stay. Those screens can still say "API key". That residue is an accepted limit of this change, recorded under Open Questions.
*   Text-to-speech is not part of the managed voice. The xAI adapter transcribes only. Phone-call speech stays on the device path when no speak voice is stored.
*   User credential rows are not deleted. Dropping them would break the previous release during a side-by-side deploy, and it would block rollback of the switch.

## Open Questions

*   **Memory and integration key screens.** They remain reachable and can show the words "API key". Removing them is a separate product cut. Voice-provider screens are removed while the operator model or the operator voice is on. The microphone stays.
*   **Grok installer pin.** The image install is optional and uses the upstream install script. The script does not document a version pin. The container also passes `--no-auto-update` at run time. A digest pin is a follow-up once the operator has a release to pin. Running that script is an accepted supply-chain risk, and the default image does not run it.

## Critical User Journeys (CUJs)

### CUJ 1: A lawyer chats

*   **Given**: `ALMA_MANAGED_MODEL` is on, `ALMA_MODEL_RUNTIME=grok-build`, and `GROK_HOME/auth.json` parses as a JSON object with at least one property.
*   **When**: The lawyer sends a message.
*   **Then**: Onboarding never asked them to connect a model. Settings has no Models row. The thread has no model picker. The API and the worker spawn `grok` and stream `text` events into the thread. The lawyer does not see a provider name or a model id.

### CUJ 2: The operator session is missing or rejected

*   **Given**: The switch is on. A usable session file is a JSON object with at least one property. `{}`, a missing file, and a non-object are not usable. `XAI_API_KEY` is unset, or `grok` has already exited with an authentication failure.
*   **When**: The lawyer sends a message.
*   **Then**: The user-visible text is exactly `ALMA no está disponible en este momento`. No text from `grok` is included. If the process was not spawned, the log is `alma.managed-model.auth-missing` and has no exit code. If `grok` exited, the log is `alma.managed-model.auth-rejected` and includes the exit code. The log does not include a key value or the auth file body. The user message does not name a provider.

### CUJ 3: A client still tries to save a key

*   **Given**: The switch is on. An old client calls `models.connect` or a bot-model write.
*   **When**: The handler runs.
*   **Then**: The write is rejected. Nothing is stored. The error message is the same Spanish sentence. It does not say "key" or name a provider.

### CUJ 5: A lawyer dictates

*   **Given**: `ALMA_VOICE_PROVIDER=xai` and `XAI_API_KEY` is set. The lawyer's locale is Spanish, or unset.
*   **When**: The lawyer holds the microphone on the web, or taps it on mobile.
*   **Then**: The API posts the audio to `https://api.x.ai/v1/stt` as multipart form data. `model` is `grok-voice-transcribe-2.0`, `format` is true, `language` is `es` unless the locale's base code is one Grok Voice accepts, and `file` is the last field. Repeated `keyterm` fields bias legal words. The transcript is the JSON `text` field. Settings has no voice-provider screen. The status is `ready: true` and `transcribe: true` with `provider: null`, and no user credential is read.

### CUJ 6: The voice key is missing

*   **Given**: `ALMA_VOICE_PROVIDER=xai` and `XAI_API_KEY` is unset.
*   **When**: The lawyer dictates.
*   **Then**: The user sees `No se pudo transcribir.` The log is `alma.managed-voice.auth-missing` and does not include a key. Mobile falls back to the on-device recognizer. Web hold-to-talk keeps its browser recognizer because `transcribe` is false. Voice-provider settings stay hidden when the operator model is on.

### CUJ 4: The switch is off

*   **Given**: `ALMA_MANAGED_MODEL=0`.
*   **When**: A user opens onboarding and settings.
*   **Then**: The previous model connection screens and the Pi runtime behave as they do today. Tests in the default suite set this value.

## Technical Plan (Architecture)

```
Lawyer (web / desktop web / mobile)
        |
        |  me.managedModel === true
        |  no model settings, no picker, no key form
        v
API and worker
        |
        |  ALMA_MANAGED_MODEL on
        |  ALMA_MODEL_RUNTIME=grok-build
        v
GrokBuildAgentRuntime  ----spawn---->  grok -p ... --output-format streaming-json
        |                                      |
        |  text / done events                  |  GROK_HOME/auth.json
        v                                      |  empty scratch dir, tools denied
thread stream                                 v
                                         operator volume
```

`AGENT_RUNTIME=scripted` still wins, including while the managed switch is on. The default test harness keeps the scripted runtime. The managed switch selects `grok` only when the process would otherwise construct `PiAgentRuntime`.

### Operator environment

| Variable | Meaning |
| --- | --- |
| `ALMA_MANAGED_MODEL` | Trimmed and lowercased. Unset, empty, or anything other than `0`, `false`, `no`, `off` enables the mode. |
| `ALMA_MODEL_RUNTIME` | Runtime id. Default `grok-build`. |
| `ALMA_MODEL_PROVIDER` | Stored on draft rows. Default `xai`. Not shown on screens. |
| `ALMA_MODEL_ID` | Model id. See the command section for when `-m` is passed. |
| `ALMA_MODEL_BASE_URL` | When set, the runtime writes the `alma` table below and passes `-m alma`. |
| `ALMA_MODEL_API_KEY` | Secret value for a later host. The file records the name `ALMA_MODEL_API_KEY`. The value is copied into the child environment only when it is non-empty. |
| `GROK_BIN` | Executable. Default `grok`. |
| `GROK_HOME` | Config and `auth.json`. Required for the subscription session. |
| `ALMA_GROK_SCRATCH` | Parent of per-thread scratch directories. When unset, the default is `<DATA_DIR>/alma-grok` if that directory is writable, then `/data/alma-grok` if `DATA_DIR` is unset and `/data` is writable, otherwise the system temp directory. |
| `XAI_API_KEY` | Fallback secret. Forwarded to the child when set. Never logged. |

`resolveManagedModel` in `packages/adapters` is the only reader of these names. `apps/api/src/env.ts` and the worker call it. Vendor names do not move into `packages/core`.

### Session file and API-key fallback

A usable `auth.json` is a JSON object with at least one own property. The runtime spawns `grok` when that file is usable or when `XAI_API_KEY` is non-empty. If the file is not usable and the key is set, the child still receives the key. This is the host that cannot complete device login. If neither is present, the runtime does not spawn. The log is `alma.managed-model.auth-missing` and the user sees the Spanish sentence.

If `grok` exits non-zero and its stderr or an `error` event contains `auth`, `login`, `unauthorized`, or `expired`, the log is `alma.managed-model.auth-rejected` plus the exit code. A rejected session is not retried with the key in the same run. The operator repeats device login.

### Custom model table

When `ALMA_MODEL_BASE_URL` is set, the runtime ensures `GROK_HOME/config.toml` contains this table and no secret value:

```
[model.alma]
model = "<ALMA_MODEL_ID, or alma when that id is unset>"
base_url = "<ALMA_MODEL_BASE_URL>"
name = "ALMA"
env_key = "ALMA_MODEL_API_KEY"

[models]
default = "alma"
```

If the file already exists, only the `[model.alma]` table and the `default` under `[models]` change. `auth.json` is never written by the runtime.

### Grok command

The runtime spawns `GROK_BIN` with `shell: false`. `--max-turns 1` applies to that process, not to the stored session. A later message is a new process. The argument list, in order, is:

1. `--no-auto-update`
2. `--output-format`
3. `streaming-json`
4. `--cwd`
5. the scratch directory
6. `--max-turns`
7. `1`
8. `--tools`
9. empty string
10. `--disallowed-tools`
11. `run_terminal_cmd,grep,read_file,search_replace,list_dir,web_search,web_fetch,todo_write,task,Agent`
12. `--deny` `Bash`
13. `--deny` `Edit`
14. `--deny` `Write`
15. `--deny` `Read`
16. `--deny` `Grep`
17. `--deny` `WebFetch`
18. `--deny` `MCPTool`
19. `--verbatim`
20. When `ALMA_MODEL_BASE_URL` is set: `-m` `alma`. Otherwise, when `ALMA_MODEL_ID` is set: `-m` and that id. Otherwise `-m` is omitted.
21. `--rules` and the rules string from the prompt section.
22. Either `-p` and the prompt, or `--prompt-file` and the prompt path, from the prompt section.
23. `-s` and the session id on the first spawn for that run. If stderr or an error event matches `already in use` or `already exists`, the runtime kills that child and spawns once more with the same arguments except `-r` in place of `-s`. A second failure is `alma.managed-model.runtime-failed`.

The session id is 32 hex characters from SHA-256 of the UTF-8 string `alma-thread:` plus the thread id, formatted as a UUID: 8-4-4-4-12, with the version nibble set to `5` and the variant bits set to `10`. No database column is added. Session transcripts stay under `GROK_HOME` on the operator volume, the same trust boundary as the database. One in-process lock per thread id keeps two runs in one process from spawning two `grok` processes for that thread.

The child environment is a new object: `PATH`, `HOME`, `LANG`, `GROK_HOME`, `GROK_DISABLE_AUTOUPDATER=1`, plus `XAI_API_KEY` when that value is non-empty, plus `ALMA_MODEL_API_KEY` when that value is non-empty. The rest of the server environment is not copied.

### Prompt

Character counts are JavaScript string lengths.

The rules string is `request.instructions` when its length is at most 32_000. Above that, `--rules` is `Follow the rules at the start of the prompt.` and the prompt starts with `Rules:\n`, the instructions, `\n\nRequest:\n`.

The first spawn for a thread (`-s`) sends the history and the new user text. Each history line is `User: ` or `Assistant: ` plus the content. The new text follows as `User: `. A resume spawn (`-r`) sends only the new user text. Image bytes are omitted. If the user text is empty, the runtime does not spawn and the user sees the Spanish sentence. The log is `alma.managed-model.runtime-failed` with reason `empty-prompt`.

The prompt is passed with `-p` when its length is at most 100_000. Above that, the runtime writes it to `prompt.txt` inside the scratch directory, mode `0600`, and passes `--prompt-file` with that path.

### Scratch directory and filesystem

Each thread gets `ALMA_GROK_SCRATCH/<threadId>`, created empty. Before spawn, the runtime walks parent directories for a `.git` entry. If it finds one, it does not spawn. The user sees the Spanish sentence. The log is `alma.managed-model.scratch-rejected`. Grok walks upward from `--cwd` to a `.git` directory and would otherwise treat the server repository as its project.

Grok's own tools are denied with the flags above. ALMA connector tools are not passed on the command line, so computer use and other tools do not run. A `tool_call` line means a tool request got past those flags. The runtime sends `SIGTERM`, then `SIGKILL` if the child is still alive after 2 seconds. If no `text` event has been yielded, the user sees the Spanish sentence. If text was already yielded, the runtime yields `done` and does not append the Spanish sentence. The log is `alma.managed-model.tool-blocked` and includes the tool name. The user-visible text does not.

### Stream mapping

| `grok` event `type` | Runtime event |
| --- | --- |
| `text` | `{ type: "text", text }` from string field `data`. A missing or non-string `data` is ignored. |
| `thought` | ignored |
| any other known or unknown type except `error`, `end`, `tool_call`, `max_turns_reached` | ignored |
| `end` | `{ type: "done" }` |
| `error`, non-zero exit, `max_turns_reached` | the Spanish sentence only when no `text` event was yielded, then `done`. Authentication wording uses `auth-rejected`. Anything else uses `runtime-failed`. |
| `tool_call` | as in the scratch section |

Usage lines are not forwarded. They carry a model id, and the thread must not render one. Server accounting for this runtime is the operator's Grok subscription, not a per-user ledger.

`abort(runId)` sends `SIGTERM`, then `SIGKILL` after 2 seconds. A user abort does not append the Spanish sentence. The run ends with `done` when no text was yielded, or with the text already yielded.

### How this fits credential resolution

Today `resolveDeploymentModel` in `packages/adapters/src/deployment-model.ts` picks `PI_DEFAULT_PROVIDER` and a provider key, and `modelSetup` in `apps/api/src/routes/shared.ts` sets `needsModel` when the member has no credential and the deployment model is not configured. Runs then go through `PiAgentRuntime`.

While the managed switch is on:

*   `modelSetup` reports `needsModel: false` for every actor, including when `grok` is not signed in. The send path does not answer `Connect a model to start a run.`
*   Member credentials and deployment Pi keys are not consulted for the run.
*   `me` adds `managedModel: true`. `defaultProvider`, `defaultModel`, `hostCredentialProvider`, and `hostCredentialSource` are null, so clients have no model id to render.
*   `apps/api/src/app.ts` and `apps/worker/src/index.ts` construct `GrokBuildAgentRuntime` instead of `PiAgentRuntime`.

`apps/api/src/model-credentials.ts` still encrypts a credential when the switch is off. When the switch is on, `connectModelCredential` and the other model writes return before `prepareModelCredential`.

### API

*   `MeSchema` gains `managedModel`, optional, default false. Older servers omit it. Clients treat only `true` as managed.
*   These writes reject with the Spanish sentence and store nothing. The handlers live in `apps/api/src/routes/models.ts` and `apps/api/src/model-credentials.ts`: `models.connect`, disconnect, preference, model role, bot model change, and imported model keys.
*   `models.list` returns an empty catalog while managed, so a stale client has no provider rows to draw.
*   `drafts.create` still requires `model` and `modelVersion` on the contract so the previous release's client keeps parsing. While managed, `apps/api/src/drafts.ts` ignores the submitted strings and stores `ALMA_MODEL_PROVIDER` and, for the version, `ALMA_MODEL_ID` or `subscription-default` when the id is unset. The approval log still persists those values. The web form does not ask for them, and the on-screen approval table does not show them. The CSV still contains them.

### User-facing surfaces hidden while `managedModel` is true

Web (`apps/web`), which is also the desktop UI:

*   Onboarding model step in `apps/web/src/pages/Onboarding.tsx`, including a direct open of `/onboarding/model`. The signup survey stays. The next step is the existing bot-creation step. The heading `Connect a model` is not rendered.
*   Settings nav item `Models` and `ModelSettingsOverlay` in `apps/web/src/pages/SettingsOverlay.tsx`. A deep link to the models section opens General.
*   `ChatModelPicker` in `apps/web/src/pages/shell/bot-panel.tsx`.
*   Model and model-version fields on the record-draft form in `apps/web/src/pages/DraftReview.tsx`.
*   The Model column in `apps/web/src/pages/DraftApprovalLog.tsx`.
*   The agent-import control `Include API keys` in `apps/web/src/pages/shell/agent-import.tsx`.

Mobile (`apps/mobile`):

*   Account rows `Models` and `AI data sharing` in `apps/mobile/app/(settings)/account.tsx`.
*   Screens `models`, `model-connection`, `model-picker`, `bot-model`, and `ai-data-sharing`. Opening one returns to Account.
*   The model consent sheet in `apps/mobile/lib/ai-consent.ts`. It is not shown. Chat is not blocked on that consent while managed.
*   The failed-send affordance that tells the user to connect a model (`apps/mobile/components/failed-send-bubble.tsx`). The Spanish sentence, when the server sends it, is shown as the send error and is not rewritten into a connect-a-model action.
*   The billing control in `apps/mobile/app/(settings)/billing.tsx` that navigates to `/models`. That control is omitted.

Desktop (`apps/desktop`):

*   No separate model screen. `apps/desktop/src/app-document-state.ts` treats a model field as one of several signals that a page is ready. Managed onboarding does not need that signal. The script stays, because the email form and the shell mark are enough, and the switch-off path still has the model field.

Copy that is not rendered is left in the source and in locale catalogs. Deleting unused translation entries is not part of this change.

### Missing operator session

The user-facing string lives in `packages/core` as `ALMA_UNAVAILABLE_MESSAGE` with the value `ALMA no está disponible en este momento`. The API, the worker, and the grok runtime all use that constant. User-visible errors from this runtime are that string and nothing else. `userRunError` already passes a plain sentence through. The runtime must not throw `grok`'s stderr as the error message.

Operator logs use these event names and no secret material:

*   `alma.managed-model.auth-missing`
*   `alma.managed-model.auth-rejected`
*   `alma.managed-model.scratch-rejected`
*   `alma.managed-model.tool-blocked`
*   `alma.managed-model.runtime-failed`

### Migration

No schema migration. Existing `user_model_credential` rows stay. While the switch is on they are not used for runs and writes do not add new ones. Setting `ALMA_MANAGED_MODEL=0` uses them again. Draft rows already have `model` and `modelVersion`. New drafts store the operator values. Old drafts keep the values they were recorded with.

### Docker

`infra/compose/Dockerfile` gains `ARG INSTALL_GROK_CLI=0`. When the arg is `1`, the image runs `curl -fsSL https://x.ai/cli/install.sh | bash` before `USER node`, and the binary must be on `PATH` for the `node` user. The default image does not download `grok`.

`infra/compose/docker-compose.yml`, `docker-compose.prod.yml`, and `docker-compose.images.yml` set `ALMA_MANAGED_MODEL=1`, `ALMA_MODEL_RUNTIME=grok-build`, `ALMA_MODEL_PROVIDER=xai`, and `GROK_HOME=/data/grok`. `/data` is the existing data volume. The default image leaves `INSTALL_GROK_CLI` unset, so it does not download `grok`. A deployment that wants the binary builds with `--build-arg INSTALL_GROK_CLI=1`. Until that binary is on `PATH`, runs log `alma.managed-model.runtime-failed` with reason `spawn` and show the Spanish sentence.

Device login, after the binary is installed, run once inside the container as the `node` user:

```
GROK_HOME=/data/grok grok login --device-auth
```

The command prints a device code and a URL, and it waits. The operator opens the URL on a machine with a browser, signs in to the subscription, and enters the code. The command then exits 0 and writes `auth.json` on the volume. Do not copy that file into the git repository. A later `auth-rejected` log means the operator runs this command again.

### Tests

*   `packages/testkit/src/pin-test-env.ts` sets `ALMA_MANAGED_MODEL=0` so the existing suite stays on the scripted runtime and the previous model UI.
*   `packages/adapters/src/grok-build-runtime.test.ts` points `GROK_BIN` at a fake executable. The fake reads `mode` from a file in `GROK_HOME` and writes `argv.json` there. It does not read the parent environment for its mode, because the child environment is an allowlist.
*   Mode `stream` prints a `text` line then an `end` line. The test expects a `text` event whose text is the fixture chunk, then `done`, and expects `argv.json` to contain `--tools`, `""`, `--disallowed-tools`, `--max-turns`, `1`, `-s`, and the scratch path. It expects the recorded spawn options to use `shell: false`.
*   Mode `auth` prints `{"type":"error","message":"authentication expired"}` and exits 1. With `XAI_API_KEY=xai-test-fixture` set in the parent and a usable `auth.json`, the user-visible text is only the Spanish sentence. The log name is `alma.managed-model.auth-rejected`. The log record has no field equal to `xai-test-fixture`.
*   Mode `tool` prints a `tool_call` for `run_terminal_cmd` and no `text`. The user-visible text is the Spanish sentence and does not contain `run_terminal_cmd`. The log name is `alma.managed-model.tool-blocked`.
*   A scratch parent that contains `.git` does not create `argv.json`. The log name is `alma.managed-model.scratch-rejected`. The user-visible text is the Spanish sentence.
*   API tests with the switch on: `me.managedModel` is true, `needsModel` is false, `defaultModel` is null, and `models.connect` does not write a credential. Its message is the Spanish sentence.
*   A web test renders onboarding and settings with `managedModel: true` and asserts that `Connect a model` and the Models nav item are absent. A mobile test renders the account screen with `managedModel: true` and asserts that `Models` and `AI data sharing` are absent.
*   No test uses a real key. The only key string is `xai-test-fixture`.

### Rollout and rollback

The switch defaults on in this fork. Rollback is `ALMA_MANAGED_MODEL=0` and a process restart. No migration runs, so the previous process still understands the database. The optional `grok` install is a build arg. An image built without it still boots. Runs then take the missing-binary path and show the Spanish sentence, and the operator log says the binary could not be spawned.

--------------------------------------------------------------------------------

## Alternatives

### Alternative A: Call the xAI HTTP API with `XAI_API_KEY`

*   **Pros**: Reuses `PiAgentRuntime` and the existing `xai` provider.
*   **Cons**: The operator asked for the Grok Build subscription session, not a direct API key.
*   **Reason for Rejection**: The key is a fallback only.

### Alternative B: Speak Agent Client Protocol (`grok agent stdio`)

*   **Pros**: One long-lived process and a JSON-RPC session.
*   **Cons**: There is no client for that protocol in the adapters. The tool flags this design relies on apply to headless runs.
*   **Reason for Rejection**: Headless `streaming-json` maps onto `AgentRuntimeEvent` with a smaller change.

### Alternative C: Hide the screens and still run Pi against a deployment key

*   **Pros**: No process spawn.
*   **Cons**: It is the direct API path again, and Pi still has the model's tools.
*   **Reason for Rejection**: The runtime has to be `grok`, with tools denied.

--------------------------------------------------------------------------------

## Non-Functional Requirements

### Security and privacy

The child process is not a shell. Its environment is an allowlist. Scratch directories are rejected when a parent is a git checkout. A `tool_call` line aborts the child. That abort is a backstop: a tool `grok` already ran is visible to the operator log, not to the lawyer. Auth file contents and key values are not logged. The Spanish sentence is the only user-visible failure text from this runtime when no answer text was streamed.

`GROK_HOME` holds session transcripts for every thread on the deployment. It sits on the operator volume with the database. The optional `curl | bash` install is off unless `INSTALL_GROK_CLI=1`.

Draft text still crosses the existing API. The approval gate is unchanged. The command line does not include ALMA connector tools.

`XAI_API_KEY` in the environment is an operator secret. Tests and docs use the placeholder `xai-test-fixture`.

### Performance

One `grok` process per run. `--max-turns 1` caps that process. Session resume sends the new user text, not a replay of the transcript, once `-r` is the flag that was spawned.

### Rollout and rollback

Described above. The previous and new API can run together: no column is added or dropped.

--------------------------------------------------------------------------------

### Additional Resources

*   `packages/adapters/src/deployment-model.ts` — current deployment key resolution, unused for runs while the switch is on.
*   `apps/api/src/model-credentials.ts` — credential writes, rejected while the switch is on.
*   `apps/api/src/routes/shared.ts` — `modelSetup` and `me`.
*   `packages/adapter-kit/src/interfaces.ts` — `AgentRuntime`.
*   [Grok Build overview](https://docs.x.ai/build/overview)
*   [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model) — review method for this document.

## Future Improvements

*   A second runtime id for a model hosted in the Dominican Republic, using `ALMA_MODEL_BASE_URL`.
*   A pinned `grok` binary digest.
*   Whether memory and integration key screens should leave the apps.
*   xAI text-to-speech, if a later change needs spoken replies without a user voice provider.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `packages/core/src/alma-unavailable.ts` (Create)

*   **Type / Scope**: Shared constant.
*   **Proposed Changes**: Export `ALMA_UNAVAILABLE_MESSAGE`.

#### 2. `packages/adapters/src/managed-model.ts` and `grok-build-runtime.ts` (Create)

*   **Type / Scope**: Operator config and `AgentRuntime`.
*   **Proposed Changes**: `resolveManagedModel`, `managedModelEnabled`, and `GrokBuildAgentRuntime` as specified above. A `ManagedModelRuntime` registry maps `grok-build` to that class. Any other id fails health.

#### 3. `apps/api/src/env.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/shared.ts`, `apps/api/src/model-credentials.ts`, `apps/worker/src/index.ts` (Modify)

*   **Type / Scope**: Switch, `me`, write rejection, runtime selection.
*   **Proposed Changes**: Load the resolver. `me.managedModel`. Null model fields when on. `needsModel` false when on. Reject model writes. Construct the grok runtime when the switch is on and `AGENT_RUNTIME` is not `scripted`.

#### 4. `packages/contracts/src/domain.ts` and draft create handling in `apps/api/src/drafts.ts` (Modify)

*   **Type / Scope**: Contract and stored model.
*   **Proposed Changes**: Optional `managedModel` on `Me`. Server-side overwrite of draft model fields while managed, so the approval record keeps the operator identity without a field on the form. This is the Goals bullet for draft rows.

#### 5. Web and mobile surfaces listed in the architecture section (Modify)

*   **Type / Scope**: Conditional render on `me.managedModel === true`.
*   **Proposed Changes**: Hide the listed controls. Do not delete the screens' modules. Direct routes redirect or render nothing that names a model, a provider, or a key.

#### 6. `infra/compose/Dockerfile`, `infra/compose/docker-compose.yml`, `infra/compose/docker-compose.prod.yml`, `infra/compose/docker-compose.images.yml`, `.env.example` (Modify)

*   **Type / Scope**: Optional binary and operator variables.
*   **Proposed Changes**: Build arg and the environment table. Comments state the device-login command and that `XAI_API_KEY` is a fallback.

#### 7. Tests (Create and modify)

*   **Type / Scope**: Fake `grok`, API switch, UI absence.
*   **Proposed Changes**: As in the Tests section. `pin-test-env.ts` forces the switch off.

--------------------------------------------------------------------------------

## Managed voice

The operator sets `ALMA_VOICE_PROVIDER=xai` and `XAI_API_KEY`. That key is a direct xAI API key. `grok login --device-auth` does not authorize `POST https://api.x.ai/v1/stt`. The same variable remains the documented fallback for the Grok Build process.

`XaiVoiceProvider` is the `xai` entry in the voice catalog and factory. It transcribes and does not synthesize. The form fields, in order, are `model`, `format`, `language`, one `keyterm` per legal term, then `file`. `format=true` writes numbers and amounts. Language defaults to `es`.

While that provider is selected, `voice/status` reports ready and transcribe for every organization, `provider` is null, and voice connect, disconnect, and voice-choice writes answer `Esta opción no está disponible.` A missing key reports not ready and logs `alma.managed-voice.auth-missing`. A failed transcription logs `alma.managed-voice.request-failed` and answers `No se pudo transcribir.`

Web, mobile, and desktop hide voice-provider settings when `me.managedModel` or `me.managedVoice` is true. Desktop hosts the web UI. The web microphone still posts to `/api/voice/transcribe`. Mobile asks `voice/status` first and uses the server when `transcribe` is true. The on-device recognizer runs only when that flag is false or the server request fails.

## Planned additions

None. The Dominican Republic runtime, a pinned binary, and text-to-speech are future improvements, not work hiding in this plan.

Goldfish review of this document is recorded in `docs/designs/reviews/2026-10-26-alma-managed-model.md` after the review passes.
