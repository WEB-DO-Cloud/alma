# Goldfish review: ALMA managed voice calls

*   **Document:** `docs/designs/alma-managed-voice-calls.md`
*   **Date:** 2026-10-27
*   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model). Six fresh sessions. Each session was told to read only the design document and one persona. Reviewers did not receive the application source.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness. All six returned fail on the first draft. The resolutions below were applied to the document. A second swarm was not run. The edits close the two-way readings. They do not add a feature.

## Resolutions applied to the document

*   **One problem.** The preview hides the web microphone and Call button because both read `PHONE_CALLS_ENABLED`, not `transcribe`. Mobile has no Dictate control. The adapter does not speak.
*   **`me.managedVoice`.** It is true when `ALMA_VOICE_PROVIDER` is `xai`, including when the key is unset. Hold to talk uses that flag so a missing key still shows the browser recognizer.
*   **Different show rules.** Web Hold to talk is phone calls, or `transcribe`, or `me.managedVoice`. Mobile Dictate is `me.managedVoice` or `transcribe` only. Phone calls do not show Dictate.
*   **Where the words go.** Web hold-to-talk sends a chat message. Mobile Dictate fills the draft. Draft approval is unchanged.
*   **Recognition order.** Web tries the browser first, then the server. Mobile tries the server first, then the device, because an on-device session beeps and cuts a phrase.
*   **Call scope.** The in-app call does not ring, does not phone the user, and does not bill. Incoming calls stay behind `PHONE_CALLS_ENABLED`. The mobile waveform is the existing control. This change does not add another one.
*   **Status.** With a key: `voiceId` `eve`, `ready` true, `transcribe` true, `provider` null. Without a key: `voiceId` empty, `ready` false, `transcribe` false.
*   **Speech request.** The JSON fields are `text`, `voice_id`, `language`, and `text_normalization`. The language table is listed. Failure text is `No se pudo leer la respuesta.` and is the HTTP error only. Opening the composer with no key does not speak.
*   **Audio.** Browser and on-device recognition stay on the device. Only server transcription and text-to-speech leave the Dominican Republic.
*   **Names.** ALMA is the product name. The operator runs the server. The preview is the deployment of main the lawyers are trying. Damien approves production use.

## Accepted without a further product change

*   **No second full re-audit.** The edits close the two-way readings. They do not add a screen or a second call path.
*   **The fixed voice stays `eve`.** A picker would put a provider choice back on screen.
