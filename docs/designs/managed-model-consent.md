# Managed model does not ask for data-sharing consent

*   **Status:** In Review
*   **Date:** 2026-11-04

The mobile app asks "Share data with DeepSeek?" before a chat when `aiConsent/status` lists that model with `allowed: false`. ALMA runs one operator model for every account. People are not choosing DeepSeek, and tapping Not now blocks the reply.

## What changes

While the managed model is on, `aiConsent/status` reports these operator services as `allowed: true` even when no consent row exists:

*   The chat model (`managedChatModel`: the deployment model when `ALMA_MODEL_RUNTIME=pi`).
*   Voice, when `ALMA_VOICE_PROVIDER=xai`.
*   Memory, when `MEMORY_PROVIDER=honcho` (the server Honcho, including a self-hosted base URL on the space row).

The mobile client only prompts for recipients that are not allowed, so installed builds stop showing "Share data with …?" for those services and still send. No store build and no new environment variable.

`ALMA_MANAGED_MODEL` off keeps the previous check. A different model, a voice the operator did not take over, and a memory provider other than the server Honcho still require a grant. The disclosure sentences and the privacy policy URL are unchanged.

Web and desktop do not show this dialog. They never call the consent gate. The API does not refuse a send for a missing grant; the block was only the mobile prompt.
