# ALMA managed voice calls

*   **Author:** WEB-DO-Cloud/alma
*   **Status:** In Review
*   **Date:** 2026-10-27

--------------------------------------------------------------------------------

## Overview

ALMA is the product. The operator is the person who runs one server for every lawyer. On that server, a lawyer can dictate into the composer and can call a bot. Dictation that uses the server, and every spoken reply, uses the operator's xAI key. The lawyer does not see a voice provider, a voice list, or a key.

A call is one thread turn. Speech becomes text. The existing chat runtime writes the reply. That reply is spoken back. The call does not ring a phone, does not start the bot tool that phones the user, and does not bill. Those stay behind `PHONE_CALLS_ENABLED`.

## The Problem

`PHONE_CALLS_ENABLED` is the incoming-call switch. It defaults off. The preview server (the deployment of main that lawyers are trying) sets `ALMA_VOICE_PROVIDER=xai` and `XAI_API_KEY`, and leaves `PHONE_CALLS_ENABLED` unset.

The web composer shows the microphone and the Call button only when that switch is on. `voice/status` already reports `transcribe: true` when the key is set. The microphone does not read `transcribe`. Call does not read it either.

The mobile thread composer has no Dictate control. Its waveform starts a call. The managed adapter transcribes and does not speak, so a call has nothing to play back. `ready` meant dictation is available. `voiceId` was empty. Speech playback looked for a user credential and found none.

`me` is the signed-in user record. `me.managedVoice` is true when `ALMA_VOICE_PROVIDER` is `xai`, including when `XAI_API_KEY` is unset.

## Goals

*   Web Hold to talk is visible when any of these is true: `PHONE_CALLS_ENABLED`, `voice/status.transcribe`, or `me.managedVoice`. The browser speech recognizer runs first. If that recognizer cannot run and `transcribe` is true, the recording is posted to `POST /api/voice/transcribe` and the returned text is sent as the chat message. If `transcribe` is false, only the browser recognizer is used.
*   Mobile Dictate is visible when `me.managedVoice` is true or `voice/status.transcribe` is true. `PHONE_CALLS_ENABLED` does not show or hide it. A tap records for the server when `transcribe` is true. The on-device recognizer runs when `transcribe` is false or the server request fails. The words are inserted into the draft. The lawyer sends the draft. The control reads Dictate before recording and Listening during recording. Mobile prefers the server first because an on-device session beeps and cuts a phrase.
*   With a key, `voice/status` is `configured: true`, `ready: true`, `transcribe: true`, `provider: null`, `voiceId: "eve"`. Without a key it is `configured: false`, `ready: false`, `transcribe: false`, `provider: null`, `voiceId: ""`.
*   Speech playback posts JSON to `https://api.x.ai/v1/tts`. The body fields are `text`, `voice_id` (`eve`), `language`, and `text_normalization` (`true`). The response body is `audio/mpeg`. `language` is `es-ES` for `es`, `es-DO`, and any other Spanish tag except `es-MX`. `es-MX` stays `es-MX`. `pt-BR` and `pt-PT` stay themselves. `en`, `zh`, `fr`, `de`, `hi`, `id`, `it`, `ja`, `ko`, `ru`, `tr`, `vi`, `bn`, `ar-EG`, `ar-SA`, and `ar-AE` stay themselves. Anything else is `es-ES`. The bearer token is `XAI_API_KEY`. There is no new environment variable.
*   The web Call button is visible when `PHONE_CALLS_ENABLED` is on, or when `transcribe` is true and `voiceId` is non-empty. Tapping it starts the existing in-app call. If there is no `voiceId` and the operator does not manage voice or the chat model, Voice settings open. If the operator manages voice (`me.managedVoice`) or the chat model (`me.managedModel`), Voice settings do not open.
*   The mobile waveform stays where it is. With `voiceId` set, that call speaks the reply through the same text-to-speech request. This change does not add a second mobile Call control.
*   A speak attempt with no key logs `alma.managed-voice.auth-missing`. A failed text-to-speech request logs `alma.managed-voice.request-failed`. Neither log contains the key or the audio. The user-visible text for both is `No se pudo leer la respuesta.` That sentence is the HTTP error. It is not shown when speak is not offered. Without a key, the web Call button stays hidden and message Speak stays hidden, because `ready` is false.

## Non-Goals

*   No realtime voice session at `wss://api.x.ai/v1/realtime`. That session would answer beside the thread.
*   No voice picker and no per-bot voice while `me.managedVoice` is true.
*   No change to draft approval. Web dictation sends a normal chat message. Mobile dictation only fills the draft.
*   No change to incoming calls, the ring, or the bot tool that phones the user. Those stay behind `PHONE_CALLS_ENABLED`.
*   Browser speech recognition and on-device recognition do not send audio to xAI. Audio posted to `/api/voice/transcribe` or received from `/v1/tts` does leave the Dominican Republic and is processed by xAI. Preview use of that path is accepted. A production firm needs approval from Damien, who approves production use of this server, before the path is used for client work.

## Critical User Journeys

### CUJ 1: Dictate on the web

*   **Given**: `ALMA_VOICE_PROVIDER=xai`, `XAI_API_KEY` is set, and `PHONE_CALLS_ENABLED` is unset.
*   **When**: The lawyer holds the microphone and releases.
*   **Then**: Hold to talk is visible because `transcribe` is true. The browser recognizer is used when it can run. Otherwise the audio is posted to `/api/voice/transcribe` and the transcript is sent as the chat message.

### CUJ 2: Dictate on mobile

*   **Given**: The same server. The thread composer is open.
*   **When**: The lawyer taps Dictate.
*   **Then**: The clip goes to the server because `transcribe` is true. The words appear in the draft. The control reads Listening until the turn ends.

### CUJ 3: Call the bot

*   **Given**: The key is set, so `voiceId` is `eve` and `transcribe` is true.
*   **When**: The lawyer taps Call on the web, or the existing waveform on mobile.
*   **Then**: The in-app call listens, sends the transcript into the thread, and speaks the reply with `POST /v1/tts`. Voice settings do not open. No vendor name is shown. The phone does not ring.

### CUJ 4: The key is missing

*   **Given**: `ALMA_VOICE_PROVIDER=xai` and `XAI_API_KEY` is unset. `me.managedVoice` is still true.
*   **When**: The lawyer opens the composer.
*   **Then**: Hold to talk is visible because `me.managedVoice` is true, and it uses the browser only. Dictate is visible and uses the device. Web Call is hidden because `voiceId` is empty and phone calls are off. Message Speak is hidden because `ready` is false. No speak request is made by opening the composer.

## Technical Plan

`XaiVoiceProvider.synthesize` posts the JSON object above to `https://api.x.ai/v1/tts` and returns `{ bytes, mimeType: "audio/mpeg" }`. `prepareVoice` and `synthesizeVoice` use this provider when managed voice is on, before any user credential is read. `POST /api/voice/speak` accepts optional `language` and returns the mpeg bytes with status 200. A missing key or a failed upstream call returns status 400 and `{ "error": "No se pudo leer la respuesta." }`.

`/api/voice/transcribe` is unchanged: JSON `audioBase64`, `mimeType`, and optional `language`, response `{ "text" }`.

## Tests

*   The text-to-speech body is `text`, `voice_id` `eve`, `language` `es-ES`, and `text_normalization` true. Status `voiceId` is `eve` only when the key is set, and `""` when it is not.
*   `POST /api/voice/speak` returns mpeg bytes with no user credential.
*   The web composer shows Hold to talk when `dictationEnabled` is true. That prop is true when phone calls are on, or `transcribe` is true, or `me.managedVoice` is true. It stays hidden when all three are false.
*   The mobile composer omits Dictate until `onDictate` is passed. `insertText` appends the transcript to the draft.

## Open Questions

*   **Production audio leaving the country.** Preview use is accepted. Client work waits for Damien's approval.
*   **The fixed voice.** `eve` is the API default. A later operator variable can name another built-in voice. It is not a screen.

--------------------------------------------------------------------------------

Goldfish review of this document is recorded in `docs/designs/reviews/2026-10-27-alma-managed-voice-calls.md`.
