# Goldfish review: ALMA managed model

*   **Document:** `docs/designs/alma-managed-model.md`
*   **Date:** 2026-10-26
*   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model) review passes. Each reviewer was a fresh session. Each session was told to read only the design document, its persona, and the matching standard. Reviewers did not receive the application source.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness.

## Resolutions applied to the document

*   **Who the runtime is for.** The operator chooses one runtime for every lawyer on the server. One deployment shares one `GROK_HOME`. Session ids are per thread.
*   **What screens hide.** Provider names, model ids, and model keys stay off web, mobile, and desktop screens. The approval CSV still stores the model fields. That download is the accepted exception. Voice, memory, and integration screens can still say "API key". That limit stays in Open Questions.
*   **Switch values.** Trim and lowercase. Only `0`, `false`, `no`, and `off` turn the switch off.
*   **Session file.** A usable `auth.json` is a JSON object with at least one property. `{}` is missing. A missing file with `XAI_API_KEY` set still spawns, and the child receives the key. A rejected login is not retried with the key in the same run.
*   **Logs.** `auth-missing` has no exit code, because `grok` was not spawned. `auth-rejected` includes the exit code. The user message is only the Spanish sentence.
*   **Custom model table.** The `config.toml` keys are named. `ALMA_MODEL_API_KEY` is the secret value in the child environment. The file stores that name in `env_key` and does not store the value. `ALMA_MODEL_BASE_URL` selects `-m alma`. Otherwise a set `ALMA_MODEL_ID` is the `-m` value.
*   **Argv.** The command section lists the arguments in order, including a separate empty string after `--tools` and one `--deny` flag per name.
*   **Session id.** SHA-256 of `alma-thread:` plus the thread id, formatted as a UUID with version nibble `5`. The first spawn uses `-s`. One retry uses `-r` when the output says the id is already in use or already exists. `--max-turns 1` applies to that process.
*   **Prompt.** `-s` sends history plus the new user text. `-r` sends only the new user text. Length limits are JavaScript string lengths. An empty user text does not spawn. Image bytes are omitted.
*   **Tools.** A `tool_call` line is a backstop after the flags. If text already streamed, the Spanish sentence is not appended. The tool name is logged and not shown.
*   **Usage events.** They are not forwarded, so a model id on that event cannot reach the thread.
*   **Unknown runtime.** The process boots. Health fails. Runs use the Spanish sentence. The log is `runtime-failed` with the runtime id.
*   **Draft fields.** The server stores the operator provider and model id. The approval hash is the draft text. Screens hide the fields. The CSV keeps them.
*   **Images.** No image bytes are sent. Empty user text shows the Spanish sentence.
*   **Installer.** `INSTALL_GROK_CLI` defaults off. The `curl` install is an accepted supply-chain risk when the arg is `1`. Device login prints a code and a URL and waits.
*   **Desktop ready script.** It stays. Managed onboarding does not depend on the model field.
*   **Headings.** Future Improvements is an H2. Additional Resources stays an H3.
*   **Style.** The Agent Client Protocol is named before the short form. The in-scope apps are named. Flag names are defined in the command section.

## Accepted without a further product change

*   **Memory and integration key screens stay.** Reviewers asked to reconcile them with "no keys on screen". The document states that those screens are a separate cut. Voice-provider screens are hidden by the voice addition below.
*   **The CSV shows the stored model.** Reviewers called that a leak. The firm record already requires the fields. The screen column is hidden. The download is the exception.
*   **Tool denial is flag-based.** A tool that runs before the `tool_call` line is logged, not shown. A sandbox profile beyond the documented flags is not added.
*   **No second full re-audit.** The edits close the two-way readings the passes reported. They do not add a feature.

## Voice addition

A second pass read only the voice section of the design, the same personas, and the speech-to-text request. It did not receive the application source.

*   **What `ready` means.** Reviewers read `ready: true` as "a speak voice is chosen" and as "dictation is available". The document now says this provider does not synthesize. `ready` with an empty `voiceId` means dictation is available. Calls that need a stored speak voice stay on the device path.
*   **The key is shared.** `XAI_API_KEY` is the voice API key and the documented Grok Build fallback. Device login does not cover speech-to-text. The document says both.
*   **The vendor name.** Status sets `provider` to null. The catalog returned to clients is empty while managed voice is on. The factory still has the `xai` id for the server.
*   **Language.** Unset and unknown tags become `es`. A supported base code, including `en` from `en-US`, is kept. Regional tags that are not in the supported set use the base code.
*   **The file field.** It is last. `format` is the string `true`. Keyterms are a fixed legal list, each under 50 characters.
*   **A missing key.** Users see `No se pudo transcribir.` The log does not include the key. Mobile uses the on-device recognizer. Voice-provider screens stay hidden when the operator model is on, so a missing key does not send the lawyer to a key form.
*   **Text-to-speech.** It is not in this change. Adding a voice catalog and a speak voice would put a provider choice back on screen.

## Drift check

Written after the implementation below.

*   The chat runtime is `selectChatRuntime`. Scripted tests win. Otherwise `ALMA_MANAGED_MODEL` on selects `grok-build` or the unavailable runtime. The executor treats `capabilities.managed` as keyless and does not forward usage events.
*   Model writes, bot model fields, and routine model fields are ignored or rejected with `ALMA no está disponible en este momento`. `me.managedModel` hides the model screens. Draft create stores the operator provider and model id. The approval table hides that column. The export path is unchanged.
*   `XaiVoiceProvider` posts to `https://api.x.ai/v1/stt` with the file last. Managed voice status is ready and transcribe without a user credential when `XAI_API_KEY` is set. Voice writes are rejected. Web and mobile hide voice-provider settings when the operator model or the operator voice is on. Mobile dictation tries the server first.
*   Text-to-speech is not implemented. `INSTALL_GROK_CLI` defaults to 0. Vitest, the e2e harness, and the mobile screenshot fixture pin `ALMA_MANAGED_MODEL=0` and clear `ALMA_VOICE_PROVIDER`.
