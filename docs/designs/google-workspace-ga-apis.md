# Google Workspace on the generally available APIs

*   **Status:** Reviewed
*   **Date:** 2026-11-11
*   **Author:** ALMA overlay. Upstream Rakazo has no Google REST client. This note does not add one there.

A zero-context review reads only this note. Resolutions at the top override any earlier sentence they touch. They do not add a feature.

Goldfish review: `docs/designs/reviews/2026-11-11-google-workspace-ga-apis.md`.

## Resolutions

*   A Google client id is the trimmed value of `ALMA_GOOGLE_OAUTH_CLIENT_ID` when it matches `^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$`, case-insensitive. Any other value means the connector is not registered.
*   Exactly one preset entry may have that client id and a non-empty `clientSecret`. Zero matches or more than one match means the connector is not registered. That one secret is the token request's `client_secret`.
*   `redirect_uri` is the server's web origin plus `/mcp/oauth/callback`. On the production server the origin is `https://app.alma.com.do`, which is the URI already registered. `begin` ignores the redirect URL the connection call passes in.
*   `begin` writes `userId` and `spaceId` from the signed-in user, and `provider` as `gmail`, `googlecalendar`, or `googledrive`. The authorization URL's `scope` is that app's set from the table, joined with spaces. The row id is the OAuth `state`.
*   The token request sends `grant_type=authorization_code`, the code, the client id, the preset secret, the stored redirect URI, and the stored verifier. After a successful exchange the ciphertext holds only `accessToken`, `refreshToken`, and `expiresAt`. `expiresAt` is an absolute UTC time. A token response with no refresh token deletes the pending row and does not connect.
*   Inserts use the same test as reads: `userId` equals `app.user_id` and `spaceId` equals `app.space_id`. The callback completes a grant only when the signed-in user and space are those columns. A state with no such row falls through to the MCP session check.
*   A later `begin` for the same user, space, and app deletes that app's pending and expired grants. A connected grant stays until the new grant becomes connected, then it is deleted and any connection row whose `providerRef` is that deleted id is set to revoked. A failed new sign-in leaves the connected grant in place.
*   Refresh is `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`. It runs when `expiresAt` is within 60 seconds or already past, and before the tool's request. No other URL is fetched. A failed refresh sets `status` to `expired`, leaves the ciphertext as the three token fields, and `connectionReady` stays false until a later `begin` connects a new grant.
*   A tool uses the newest connected grant for its own app: `gmail_*` uses `gmail`, `calendar_*` uses `googlecalendar`, `drive_*` uses `googledrive`. The result is the JSON body. A body over 1_000_000 bytes fails with `The response was too large.` and returns no prefix. A non-2xx response fails with `Google returned` and the status code, and does not include the body. A body that is not JSON fails with `The response was not JSON.`
*   `gmail_send` takes exactly `to` and `body`, both strings. The POST body is Gmail's `raw` field: a base64url `text/plain` message whose headers are `To` and an empty `Subject`, and whose text is `body`. `gmail_create_draft` takes `to`, `subject`, and `body` and posts the same kind of message under `message.raw`. `calendar_create_event` takes `summary`, `start`, and `end` and posts those as the event's summary and date-times. `gmail_search_threads` takes `q` and sends `maxResults=10`. `calendar_list_events` sends `maxResults=10`, `singleEvents=true`, `orderBy=startTime`, and `timeMin` of the current UTC time. `drive_search_files` takes `q` and sends `pageSize=10`.
*   This change does not reorder the existing tool gate. When Phase 2A and send undo are both on, the existing hold returns before `gmail_send` runs. When they are not both on, the existing approval card runs and then the tool performs its POST. Phase 2A is on only when `ALMA_PHASE2A` is exactly `true`. Send undo is on only when `ALMA_SEND_UNDO` is exactly `true`.
*   When the connector is not registered, preview MCP hosts are dialed as they are today. When it is registered, discovery of those hosts returns no tools and does not dial them, and a call aimed at one returns `This Google app connects from the card in the chat.`
*   A Composio connection already stored for Gmail, Google Calendar, or Google Drive keeps running. Those three rows are left out of Composio's catalog search only while this connector is registered.
*   Removing a member from a space deletes that member's grants in that space, the same as the other sign-in rows deleted there.
*   The chips are deleted. `mobileActionsEnabled` is the `me` field set from `ALMA_MOBILE_ACTIONS`. The web composer test sets that field true and expects no button named Camera, Share, or Voice note, and still expects Attach file. The phone attach menu still offers Camera, Photo library, and File. Share-sheet intake, voice calls, dictation, the biometric lock, and Undo on a notification stay. Those are the same behaviors as share-sheet import and the lock screen.

## Problem

Gmail, Google Calendar, and Google Drive are reached through Google's hosted MCP servers (`gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`, `drivemcp.googleapis.com`). Those servers are in the Workspace Developer Preview. Calls fail because Cloud project `101531130294` (`alma-play-513308`) is not enrolled. The Gmail API, Calendar API, and Drive API are already enabled on that project and do not need the preview.

The sign-in that exists today uses the web OAuth client in `ALMA_GOOGLE_OAUTH_CLIENT_ID` and the redirect `https://app.alma.com.do/mcp/oauth/callback`. People connect from the card a bot posts in the chat.

On the phone and on the web, Camera, Share, and Voice note sit as chips above the composer when `ALMA_MOBILE_ACTIONS` is exactly `true`. Camera is already in the composer's attach menu. Share-sheet intake, voice calls, dictation, the biometric lock, and Undo on a notification stay.

## What this change does

Two separate pull requests. Neither merges, deploys, or changes a production flag.

1. A connector named `google` calls the generally available REST APIs. It is registered only when `ALMA_GOOGLE_OAUTH_CLIENT_ID` is a Google client id and `MCP_OAUTH_PRESET_CLIENTS` has one entry whose `clientId` equals that value and whose `clientSecret` is non-empty. Otherwise no connector is registered and connection start, tool runs, and MCP servers behave as they do today.
2. The Camera, Share, and Voice note chips are deleted. The flag is not the thing that hides them.

## Non-goals

*   No enrollment in the Developer Preview, and no call to `gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`, or `drivemcp.googleapis.com`.
*   No new environment variable. The client id and secret already live in the two variables above.
*   No second connect screen. The existing `app_connect` card stays the way a person connects these three apps.
*   No change to Composio for any app other than these three. When the connector is registered, a catalog search does not offer Composio's Gmail, Google Calendar, or Google Drive row. A connection already stored under Composio is left as it is.
*   No home-screen shortcut is added or removed. None is registered: `app.json` has no shortcut items, Android has no shortcuts file, and `quickActionTarget` is not called from a store build. Siri and Shortcuts intents stay.
*   No store build, no version bump, and no edit to `CHANGELOG.md`.

## Sign-in

`begin` opens `https://accounts.google.com/o/oauth2/v2/auth` with the deployment client id, `response_type=code`, `access_type=offline`, `prompt=consent`, PKCE S256, and `redirect_uri` equal to the web origin plus `/mcp/oauth/callback`. The state is the id of a new row.

The row is `GoogleWorkspaceGrant`. Columns: `id`, `spaceId`, `userId`, `provider` (`gmail`, `googlecalendar`, or `googledrive`), `status` (`pending` or `connected`), `ciphertext`, `createdAt`, `updatedAt`. The ciphertext is `EncryptedSecretStore` output bound to the row id. While pending it holds the PKCE verifier and the redirect URI. After the code is exchanged it holds the access token, the refresh token, and the expiry. The plaintext is not written to the connection row, a log, or an RPC result.

The migration adds the table and enables row-level security. A row is visible when `userId` equals `app.user_id` and `spaceId` equals `app.space_id`. The system policy is `USING ((SELECT app_rls_bypass()))` with no `WITH CHECK`. `GRANT SELECT, INSERT, UPDATE, DELETE` to `rakazo_app` when that role exists. `GoogleWorkspaceGrant` is added to `ROW_SECURITY_MODELS`. The previous release does not read the table.

The callback page already posts `code` and `state` to `mcp.oauth.complete`. When that state is not an MCP session, the handler completes this grant for the signed-in user and does not call the MCP broker's error path. A state that matches neither is still an error. The code is exchanged at `https://oauth2.googleapis.com/token` with the preset client secret. The connection row's `providerRef` is the grant id. `connectionReady` is true only when that grant's status is `connected`.

Revoke deletes the grant and sends the refresh token to `https://oauth2.googleapis.com/revoke` when one was stored. A failed revoke still deletes the local row.

Scopes, one set per app, requested only for that app's card:

| App | Scopes |
| --- | --- |
| Gmail | `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.compose` |
| Calendar | `https://www.googleapis.com/auth/calendar.calendarlist.readonly` and `https://www.googleapis.com/auth/calendar.events` |
| Drive | `https://www.googleapis.com/auth/drive.readonly` |

`gmail.compose` lets the token create a draft and also lets it send. This product calls send only from the send tool, and only after the gates below. The consent screen must list these scopes. The redirect URI is already registered. No other Cloud console change is required for the calls themselves. The preview MCP services stay disabled.

A person who connected a preview MCP server connects again from the card. That server's stored grant is not copied.

## Tools

The connector id is `google`. Tools exist only after that app's grant is `connected`. Each call uses `Authorization: Bearer` and one of these URLs. Nothing else is fetched. Responses are capped at 1_000_000 bytes. A non-2xx response becomes a short error without the token, the client secret, or the response body.

| Tool | Call | Read only |
| --- | --- | --- |
| `gmail_list_labels` | `GET https://gmail.googleapis.com/gmail/v1/users/me/labels` | yes |
| `gmail_search_threads` | `GET https://gmail.googleapis.com/gmail/v1/users/me/threads` with `q` and `maxResults` | yes |
| `gmail_read_thread` | `GET https://gmail.googleapis.com/gmail/v1/users/me/threads/{id}` with `format=full` | yes |
| `gmail_create_draft` | `POST https://gmail.googleapis.com/gmail/v1/users/me/drafts` | no |
| `gmail_send` | `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` | no |
| `calendar_list_calendars` | `GET https://www.googleapis.com/calendar/v3/users/me/calendarList` | yes |
| `calendar_list_events` | `GET https://www.googleapis.com/calendar/v3/calendars/primary/events` | yes |
| `calendar_create_event` | `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` | no |
| `drive_search_files` | `GET https://www.googleapis.com/drive/v3/files` with `q` | yes |

`gmail_send` arguments include string `to` and string `body`. An access token within 60 seconds of expiry is refreshed with the refresh token before the call. A refresh that fails marks the grant unusable and `connectionReady` returns false.

An installed MCP server whose endpoint host is `gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`, or `drivemcp.googleapis.com` is not dialed. Discovery returns no tools from it. A call returns the error `This Google app connects from the card in the chat.` The error does not include the project number.

## Send

`gmail_send` is not read only, and its name contains `send`, so the existing approval card runs before the tool. When Phase 2A and send undo are both on, `externalSendHold` holds the call because of that name and does not run the tool. The draft it stores uses `to` and `body`. Undo and the later dispatch stay the code that already exists. This change does not add a sender.

`gmail_create_draft` and `calendar_create_event` are not read only, so they take the same approval card. Their names do not contain `send`, so the undo hold does not take them.

## Chips

Delete the web `QuickActions` row, the `/preview/actions` page, and the Camera / Share / Voice note row in the phone thread. Do not delete the attach menu. On the phone that menu still has Camera, Photo library, and File. Share-sheet import, voice calls, dictation, the lock screen, and notification Undo stay.

`ALMA_MOBILE_ACTIONS` may still be set. No screen reads it to show those chips. The reader stays so a value of `true` does not change startup. `quickActionTarget` stays for the queue route a later store build was going to register. It is not called from a screen.

## Tests

Offline. Fetch is replaced.

*   A labels list, a threads list, a draft create, and a calendar events list hit the URLs in the table and send the bearer token. They do not hit a `*mcp.googleapis.com` host.
*   With no matching preset secret, the connector is absent and a Gmail catalog row is unchanged.
*   The web composer, with `mobileActionsEnabled` true, has no button named Camera, Share, or Voice note, and still has Attach file.
*   The phone composer menu still includes Camera.

## Deploy

Not in these pull requests. After merge, an operator restarts the API and the worker. Both need the existing `ALMA_GOOGLE_OAUTH_CLIENT_ID`, the existing `MCP_OAUTH_PRESET_CLIENTS` secret for that client, and `WEB_ORIGIN`. No new variable. The bundled compose files pass the client id and the origin to the worker, which is what refreshes tokens. People connect Gmail, Calendar, and Drive again from the chat card. The consent screen lists the scopes in the table. The preview MCP hosts are not used.
