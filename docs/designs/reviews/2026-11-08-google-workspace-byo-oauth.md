# Goldfish review: Google Workspace sign-in

*   **Document:** `docs/designs/google-workspace-byo-oauth.md`
*   **Date:** 2026-11-08
*   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model). Six fresh sessions. Each session was told to read only that design. Reviewers did not receive the application source or the earlier conversation.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness. All six returned fail on the first draft. The resolutions in the design were applied before implementation. A second swarm was not run. The edits close the two-way readings. They do not add a feature.

## Resolutions applied

*   **Later connections.** A saved client applies to Google connection starts after the save, and to tool runs of connections marked with that client. Remove sends later Google connection starts back to the current sign-in. Stored connection rows stay.
*   **Non-Google.** Those connection starts do not read the table and do not pass auth config ids.
*   **Lookup errors.** A database error on a Google toolkit fails the connection start or the tool run. It does not fall through to the current sign-in. A missing row does.
*   **Client IDs.** The organization's client ID leaves an RPC only as the last four characters of the part before `.apps.googleusercontent.com`. The deployment client ID is returned whole as `trustedClientId`, or null.
*   **Who sees settings.** With the flag on, only an owner or admin of the active organization gets `me.googleByoOauth`. The section is absent for everyone else.
*   **Roles.** A comma-separated role entry of `owner` or `admin`. `get` uses the active space's organization. The other three RPCs reject a different organization id.
*   **Members still connect.** A member or guest connection start may create a missing toolkit auth config. The form stays owner and admin only.
*   **One lock.** Save, remove, test, and the before-connect create share `google-oauth` plus the organization id. The waiter re-reads the row.
*   **Save provisions the directory.** A failed directory load writes nothing. A successful load creates or updates one auth config per Google slug. A slug that appears later is created on the next connection start.
*   **Names.** Zero exact matches create, one updates, more than one fails the save.
*   **Casing.** Comparisons are case-insensitive. Stored keys keep their casing. New keys use the directory slug.
*   **Scopes.** Blank defaults are an empty list. Any other default splits on whitespace only.
*   **`scopesUnavailable`.** Always present on `get`, `save`, and `remove`.
*   **Failed save.** Previous credentials go back on configs this attempt updated. Configs this attempt created are deleted. The previous row is restored, or deleted when this was the first save.
*   **Failed remove.** An already-gone remote config counts as deleted. Any other failure keeps the row, drops the gone ids, and returns an error. The row is deleted only when every stored id is gone.
*   **Test.** `{ ok: true }` only after a good `https` URL, a matching `client_id` when that parameter is present, and a completed cancel. The URL is not returned.
*   **Two URLs.** The admin registers the Composio v3 callback. The authorize callback is the app's existing `/integrations/callback`.
*   **Trusted card.** The same Admin console sequence as the help article. It applies to ALMA's own client. The organization's client is the other block.

## Contested

*   **Ship only the Trusted card.** The request asks for the organization's own client as well as the Trusted guide. Both stay, behind the one flag, and the current sign-in stays the default.
*   **Fall back to the current client when an Internal client rejects a guest.** The request says members use the organization setting. The design uses that setting for every Google connection in the organization's spaces, including guests, and does not offer the other client.
*   **Clean up remote auth configs when the organization is deleted.** The data model already leaves them. Organization deletion already removes the organization's connections.

## Accepted without a further product change

*   The production value of `ALMA_GOOGLE_OAUTH_CLIENT_ID` is not in this repository. Until an operator sets it, the Trusted card says the client ID is not set.
*   Scopes follow the toolkit defaults and are not stored. The next save is what rewrites auth configs.
*   Mobile has no organization settings screen. The server still applies the client. No store build.
