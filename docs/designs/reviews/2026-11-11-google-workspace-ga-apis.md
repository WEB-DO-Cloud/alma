# Goldfish review: Google Workspace on the generally available APIs

*   **Document:** `docs/designs/google-workspace-ga-apis.md`
*   **Date:** 2026-11-11
*   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model). One fresh session. It was told to read only that design. It did not receive the application source or the earlier conversation.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness. The session returned two-way readings. The resolutions in the design were applied before implementation. A second session was not run. The edits close those readings. They do not add a feature.

## Resolutions applied

*   **Client id.** The trimmed deployment value, and only when it matches the existing Google client id pattern. The preset must contain exactly one entry with that id and a non-empty secret.
*   **Redirect.** The server's web origin plus `/mcp/oauth/callback`. Production's origin makes that the URI already registered. `begin` does not use the redirect the connection call passes in.
*   **Who the row belongs to.** `begin` writes the signed-in user and space. The callback completes the grant only when those match. Inserts use the same test as reads.
*   **Token request.** Code, client id, the one preset secret, the stored redirect, and the stored verifier. The ciphertext afterwards is the access token, the refresh token, and an absolute expiry. No refresh token means the pending row is deleted.
*   **Refresh.** The token URL only, when expiry is inside 60 seconds or already past. Failure sets `expired` and leaves `connectionReady` false.
*   **Tool results.** JSON from that app's own grant. Over a million bytes fails with no prefix. A non-2xx response names the status and not the body.
*   **Send body.** `gmail_send` takes `to` and `body`. The POST uses Gmail's `raw` message built from those two, because posting the two strings as the body is not a request that API accepts.
*   **Gate order.** Unchanged. The hold skips the tool only when Phase 2A and send undo are both exactly `true`. Otherwise the approval card runs and then the tool posts.
*   **Preview hosts.** Dialed as today when the connector is absent. Not dialed when it is registered.
*   **Composio.** A stored connection keeps running. Catalog search omits the three apps only while this connector is registered.
*   **Chips.** Deleted. The web test uses `mobileActionsEnabled`. The phone menu keeps Camera.

## Contested

*   **Post `to` and `body` as the Gmail body.** The API accepts a base64url RFC 822 message in `raw`. The tool arguments stay exactly those two strings. The POST is the message built from them.
*   **Return a prefix of a response over one million bytes.** A cut JSON document is not a result. The call fails and returns none of the body.
*   **Leave every older grant in place.** A pending grant is replaced on the next `begin`. A connected grant stays until the new sign-in connects, then it is deleted, so a failed attempt does not drop a working token and a replaced token does not remain.
