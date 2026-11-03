# Review: ALMA batch

*   **Document:** `docs/designs/2026-11-03-alma-batch.md`
*   **Date:** 2026-11-03
*   **Method:** Read only that note. No application source.

The note is implementable after the resolutions below. They are applied to the note before code.

## Resolutions

*   **Conflict rule.** On a three-way conflict, upstream wins the behavior and the ALMA rule wins the product value: name ALMA, host `app.alma.com.do` or `alma.com.do`, price `6900`, no Models or Voice settings, `SUBMIT_PLUGIN_URL` null, version floors `1.0.12` / iOS `66` / Android `14`. A conflict that is only a rebrand is resolved to ALMA.
*   **Docs languages.** The index is Spanish, with an English list under it. Each article stays the English page upstream wrote, with ALMA wording. Self-host pages are omitted, not translated. A link inside an article that pointed at a self-host page is removed.
*   **Report mail.** No address is written in the repo. The recipient list is `RAKAZO_ADMIN_EMAILS`. Subject is `ALMA response report`. Damien adds the mailbox he reads to that env on the server, and transactional email must already be on.
*   **Push secrets.** Nothing secret is committed. Bitrise gets `EXPO_PUBLIC_EAS_PROJECT_ID` and `GOOGLE_SERVICES_JSON` after the Expo project and the Firebase Android app exist. FCM v1 and the APNs key are uploaded to that Expo project, not to the API.
*   **Call path.** Re-attach the xAI voice factory the way the current ALMA tree does. The new call controls call that factory. They do not gain their own provider.
*   **PR shape.** The pull request base is `cursor/restore-integrations-ui-dd22`. GitHub does not take an Origin stack parent.

## Left as specified

*   Updates stay off.
*   Support URL is `https://alma.com.do/en/soporte/`.
*   Microphone sentences are the two quoted lines.
*   Android service types are `microphone` and `remoteMessaging`.
