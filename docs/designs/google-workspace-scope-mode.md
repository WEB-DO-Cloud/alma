# Google Workspace scopes, limited by default

*   **Status:** Proposed
*   **Date:** 2026-11-11

A zero-context review reads only this note. It overrides the scope table and the Gmail and Drive tool rows in `docs/designs/google-workspace-ga-apis.md` when the mode below is `limited`. Calendar in that note stays. Restricted mode keeps that note's scopes and tools.

## Resolutions

*   `ALMA_GOOGLE_SCOPE_MODE` is `restricted` only when the trimmed value is exactly `restricted`. Unset, empty, `limited`, and every other value are `limited`. A typo stays on the narrow path.
*   Limited is the default. It is the set submitted for Google verification without a security assessment. Restricted is the wider set that exists today, kept for a later switch.
*   Scopes, one set per app, requested only on that app's card:

    | App | Limited | Restricted |
    | --- | --- | --- |
    | Gmail | `https://www.googleapis.com/auth/gmail.send` | `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.compose` |
    | Calendar | `https://www.googleapis.com/auth/calendar.calendarlist.readonly` and `https://www.googleapis.com/auth/calendar.events` | same |
    | Drive | `https://www.googleapis.com/auth/drive.file` | `https://www.googleapis.com/auth/drive.readonly` |

*   The token response's `scope` is stored on the connected secret. If Google omits `scope`, the stored set is the set just requested. If Google returns a different set, the pending row is deleted and the sign-in fails. A refresh keeps the stored set. A secret with no `scopes` field is a grant from the previous release and counts as the restricted set.
*   A grant is usable only when its stored set includes every scope the current mode requests for that app. Otherwise the catalog shows the app as not connected, its tools are hidden, a call returns `Connect this Google app again from the card in the chat.`, and the grant id is included in the reconnect list so the connection row is marked for reconnect. The old token is not used. Calendar grants from the previous release stay usable, because those scopes did not change. A new sign-in still replaces the old grant when it succeeds.
*   Limited tools are `gmail_send`, the three calendar tools, `drive_list_picked`, and `drive_read_file`. `gmail_list_labels`, `gmail_search_threads`, `gmail_read_thread`, `gmail_create_draft`, and `drive_search_files` are not offered and are not called. Restricted tools stay the nine in the earlier note. `drive_list_picked` and `drive_read_file` are not offered in restricted mode.
*   `gmail_send` is still not read-only, and its name still contains `send`, so the approval card and the send-undo hold run as they do today. This change does not add a sender. `subject` is optional. When it is absent the message subject stays empty, as the send tool does today.
*   Limited Drive reads only files recorded on that grant after the person picks them. `drive_list_picked` returns that list and does not call Drive. `drive_read_file` reads one recorded id. Google Docs and Slides are exported as plain text, Sheets as CSV, and other text types are downloaded. A file that is not text returns its name and type. An id that was not recorded is not requested.
*   The picker page is `/drive-picker.html`. Its content security policy is separate from the app's, so the app still runs only same-origin scripts. The page is opened from the web card in a popup and from the phone with the system browser. Both use the same page. The address carries a signed ticket in the fragment, not an access token. The ticket lasts 10 minutes. The page posts it to the API, which returns the browser API key, the Cloud project number, and a short-lived access token. The chosen file ids are posted back and stored on the grant. The access token is not written to a log or to the connection row.
*   `ALMA_GOOGLE_PICKER_API_KEY` and `ALMA_GOOGLE_PICKER_APP_ID` are both set or both unset. The key matches `^[A-Za-z0-9_-]{20,128}$`. The app id is the Cloud project number, `^\d{6,20}$`. One without the other, or a value that does not match, refuses to start. Unset means Drive can still be connected in limited mode, the choose control is hidden, and no file can be recorded.
*   Before Connect, a Google card shows a notice. Spanish is first, then English. The notice names what that app can do in the current mode, says Google user data follows the Google API Services User Data Policy including Limited Use, and says the data is not used to train models. The notice is on the card only while the card is pending. The choose control is `Elegir archivo`, with the accessible name `Elegir archivo. Choose a file.`, and it shows only after Drive is connected in limited mode with the picker configured.

## Problem

The connector requests `gmail.readonly`, `gmail.compose`, and `drive.readonly`. Those are restricted scopes. Google requires a paid security assessment for them when the token is used from a server. The product does not have that assessment. Calendar scopes are not in that category. People who already connected keep tokens for the old scopes.

## What this change does

One pull request. It does not merge, deploy, or change the Cloud console.

The API and the worker read the mode. The connector requests the scopes in the table, offers the tools in the resolution above, and treats an old grant as described. The connect card shows the notice. Limited Drive adds the picker page and the two file tools.

## Non-goals

*   No Cloud console edit, no consent-screen submit, and no new OAuth client.
*   No database migration. Scopes and picked files live in the grant ciphertext the previous release already stores. A refresh by the previous release rewrites that ciphertext without the new fields. The next read then treats the grant as an old one and, in limited mode, asks Gmail and Drive to be connected again.
*   No change to send undo, the approval card, or Composio for any app other than these three.
*   No reading of a mailbox, and no search across Drive, while the mode is limited.

## Tests

Offline. Fetch is replaced.

*   Limited and restricted each request the scopes in the table, and a value other than `restricted` is limited.
*   Limited discovery omits mailbox read, draft, and Drive search, and a call to one of those does not fetch. Restricted discovery still has them and does not have the picked-file tools.
*   A connected secret with no scopes is usable for calendar in limited mode and is not usable for Gmail or Drive.
*   A picked file is listed and its text is read from the file URL. An id that was not picked is not requested.

## Deploy

Not in this pull request. After merge, the API and the worker need a restart. Leave `ALMA_GOOGLE_SCOPE_MODE` unset to stay on limited. Set it to `restricted` only when the wider scopes are the ones that should be requested. Limited Drive choosing needs `ALMA_GOOGLE_PICKER_API_KEY` and `ALMA_GOOGLE_PICKER_APP_ID` on the API and the worker. The key is a browser API key. Restrict it to the Picker API, and to the site plus `https://docs.google.com/*`. The app id is the Cloud project number. Do not commit either value. People connect Gmail and Drive again from the card. Calendar grants keep working.
