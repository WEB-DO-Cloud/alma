# Managed model does not ask for data-sharing consent

*   **Status:** In Review
*   **Date:** 2026-11-04

The mobile app asks "Share data with DeepSeek?" before a chat when `aiConsent/status` lists that model with `allowed: false`. ALMA runs one operator model for every account. People are not choosing DeepSeek, and tapping Not now blocks the reply.

## What changes

While the managed model is on, `aiConsent/status` reports the operator model (`managedChatModel`: the deployment model when `ALMA_MODEL_RUNTIME=pi`) as `allowed: true` even when no consent row exists. The mobile client only prompts for recipients that are not allowed, so installed builds stop showing the dialog and still send the message. No store build is required.

`ALMA_MANAGED_MODEL` off keeps the previous check: that model is allowed only after the person grants it. Other recipients (a different model, voice, memory) are unchanged. The disclosure sentences and the privacy policy URL are unchanged.

Web and desktop do not show this dialog. They never call the consent gate. The API does not refuse a send for a missing grant; the block was only the mobile prompt.
