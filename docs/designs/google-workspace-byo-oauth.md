# Google Workspace sign-in: own OAuth client, and trusted app

-   **Status:** Reviewed
-   **Date:** 2026-11-08
-   **Flag:** `ALMA_GOOGLE_BYO_OAUTH` is on only when the value is exactly `true`. Every other value, including unset, is off. `BYO` means the organization brings its own Google OAuth client.

Goldfish review: `docs/designs/reviews/2026-11-08-google-workspace-byo-oauth.md`.

## Resolutions

These sentences override any earlier sentence they touch. They do not add a feature.

-   A saved client applies to Google connection starts after the save, and to tool runs of connections marked with that client. Existing connection rows are not rewritten. After a successful remove, later Google connection starts use ALMA's current sign-in. Rows already stored stay as they are.
-   A non-Google connection does not read the table and does not pass `authConfigs`. Its `composio.create` call stays the call made today.
-   For a Google toolkit, a database error fails the connection start or the tool run and does not call `composio.create`. A missing row is the current sign-in.
-   The organization's client ID leaves an RPC only as `clientIdLast4`. `trustedClientId` is the deployment client ID, returned whole, or null. Logs may include `clientIdLast4` and `trustedClientId`. They may not include the organization's full client ID.
-   `clientIdLast4` is the last four characters after removing a trailing `.apps.googleusercontent.com`, case-insensitively. The stored client ID keeps the case the admin submitted.
-   With the flag on, bootstrap sets `me.googleByoOauth` to true only for an owner or admin of the active organization's space. Anyone else, and the flag off, omit the field. Only an owner or admin sees the settings section.
-   The caller's comma-separated role list allows the RPC when it contains the entry `owner` or the entry `admin`. `get` takes no organization id and uses the organization that owns the active space. `save`, `remove`, and `test` require `organizationId` and return `FORBIDDEN` when it is not that organization. No row still returns `configured: false`.
-   A member or guest connection start may create a missing toolkit's auth config. The four RPCs stay owner and admin only.
-   Save, remove, test, and that before-connect create take the same transaction advisory lock `google-oauth` plus the organization id, and the waiter re-reads the row after it acquires the lock.
-   Save loads the Google directory. If that load fails, it writes nothing and returns a sanitized `BAD_REQUEST`. If it succeeds, it creates or updates one auth config per returned Google slug and stores those ids. A later connection start still creates a slug that is missing.
-   Listing auth configs reads every page. Zero exact name matches means create. One means update. More than one means no create and no update, and the save fails as a sanitized `BAD_REQUEST`.
-   "Is Google" and "already stored" compare slugs case-insensitively. The map keeps the casing it already has for that slug. A new key uses the directory slug's casing. `authConfigs` sends those stored keys.
-   A scope default that is missing or blank is an empty list. Otherwise it is split on whitespace only.
-   `get`, `save`, and `remove` always include `scopesUnavailable`. It is false when the directory and scope reads succeeded. It is true, with `apps: []`, when either failed. Remove still deletes from the stored ids when the directory fails.
-   A failed save puts the previous credentials back on every config this attempt updated, deletes configs this attempt created, restores the previous row, and deletes the row when there was none. Then it returns a sanitized `BAD_REQUEST`.
-   On remove, a remote config that is already gone counts as deleted. Any other failure drops the gone ids from the stored map, keeps the row and the remaining ids, and returns a sanitized `BAD_REQUEST`. The row is deleted only after every stored id is gone.
-   Test returns `{ ok: true }` only after an `https` URL that does not contain the client secret, a `client_id` query parameter that matches the stored client ID when that parameter is present, and a completed cancel. Every other outcome throws a sanitized `BAD_REQUEST` and does not return the URL.
-   The admin registers one redirect URI, the Composio v3 callback. `authorize`'s `callbackUrl` is the existing return URL, the web origin plus `/integrations/callback`.
-   The Trusted card uses the same Admin console sequence as the help article: Security, Access and data control, API controls, Manage third-party app access, Configure new app, search by the client ID, set access to Trusted. That Trusted state applies to people connecting through ALMA's own client. The organization's own client is the separate block.
-   The four RPCs are `get`, `save`, `remove`, and `test`. The catalog session cache is `sessionFor`. The catalog vendor is Composio.

## Problem

People connecting Gmail, Calendar, Drive, and the other Google apps ALMA exposes go through ALMA's current Google sign-in and see Google's "Google hasn't verified this app" screen. Two Workspace customers need a way past that screen. The current sign-in stays the default for everyone else.

## What this change does

Two additions, both inert unless the flag is exactly `true`.

1. An organization owner or admin can save that organization's own Google OAuth client (client ID and client secret). Google connections for spaces in that organization then use that client. Removing it returns those connections to ALMA's current sign-in.
2. A help article and a settings card tell a Workspace admin how to mark ALMA's own Google OAuth client as Trusted. The card shows the client ID read from the environment at runtime, with a copy button.

With the flag off, connection start, tool runs, settings, and the public docs index behave as they do today. A row in the new table is ignored.

## Composio mechanism

ALMA already connects apps through Composio sessions. `ComposioConnector.sessionFor` and `sessionForExecute` call `composio.create(userId, { manageConnections: false, sandbox: { enable: false } })` (`packages/adapters/src/composio-connector.ts`). `begin` calls `session.authorize(provider, { callbackUrl })`. The installed SDK is `@composio/core` 0.18.1. That version's `ToolRouterCreateSessionConfig` includes `authConfigs`, a record of toolkit slug to auth config id. `composio.authConfigs.create` accepts `type: "use_custom_auth"`, `authScheme: "OAUTH2"`, and `credentials` as a record of string, number, or boolean.

Current Composio docs (REST v3.1, `POST https://backend.composio.dev/api/v3.1/auth_configs`, and the session create example) say the same thing: a custom auth config holds the OAuth client ID and secret, and a session uses it only when `authConfigs` maps that toolkit to the config id. Toolkits left out of the map keep Composio-managed auth. This change uses that map. It does not add a second OAuth broker.

Evidence used, not guessed:

-   SDK 0.18.1 type `CreateCustomAuthConfigParams`: `type: "use_custom_auth"`, `authScheme: "OAUTH2"`, `credentials: Record<string, string | number | boolean>`, optional `name`.
-   SDK 0.18.1 `ToolRouterCreateSessionConfig.authConfigs`: `Record<string, string>` (toolkit slug to auth config id).
-   Docs page "Programmatic auth configs": create with `client_id`, `client_secret`, and `oauth_redirect_uri`, then pass the returned id on session create. The redirect URI they tell the provider to register is `https://backend.composio.dev/api/v3/toolkits/auth/callback`.
-   The same page: omitting `oauth_redirect_uri` makes the toolkit's own default apply, and some toolkits still default to `https://backend.composio.dev/api/v1/auth-apps/add`. This change always sends the v3 callback so the admin has one URI.

Each Google toolkit gets its own auth config, all of them using the same client ID and secret. Composio auth configs are per toolkit. The credentials object is `{ client_id, client_secret, oauth_redirect_uri }` with the v3 callback above. Scopes are not sent, so Composio keeps the toolkit's default scopes. The settings page shows those defaults from the toolkit's live metadata (`authConfigDetails` entry whose `mode` is `OAUTH2`, field named `scopes`, its `default` string). A toolkit with no such default is listed with an empty scope list. The page does not invent scopes.

A toolkit is a Google toolkit when its slug, compared case-insensitively, is `gmail` or starts with `google`. Other toolkits never receive a custom auth config.

Auth config name is `alma-google-` plus the organization id plus `-` plus the toolkit slug. Before create, list configs with that name. Reuse the id when one exists and update its credentials. The organization id is the key, so two organizations never share a config.

## Flag

`readAlmaFlags` gains `googleByoOauth`. It is `true` only when `ALMA_GOOGLE_BYO_OAUTH === "true"`. `1`, `yes`, `TRUE`, and empty are off.

When the flag is off:

-   The four new RPCs throw `NOT_FOUND` with the message `Not found.` They do not read or write the table.
-   `ComposioConnector` is constructed without an auth-config hook. `composio.create` receives the same arguments it receives today. Session cache keys stay as they are today.
-   Bootstrap does not set `googleByoOauth` (the field is absent). The settings section is not rendered.
-   The help article is not registered, so `/docs/google-workspace.md` is not found and the docs index does not list it.

When the flag is on, the behavior below applies. Existing connection RPCs stay the same procedures. They consult the table only for a Google toolkit in an organization that has a saved client.

## Data model

New table `organization_google_oauth_clients`, Prisma model `OrganizationGoogleOAuthClient`. Additive migration. The previous release does not read it.

| Column                   | Notes                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `organizationId`         | Primary key. Foreign key to `organization`, `ON DELETE CASCADE`.                       |
| `clientId`               | The Google client ID. Not a secret. Never returned whole.                              |
| `secretCiphertext`       | Output of `EncryptedSecretStore.put`, bound with `recordId` equal to `organizationId`. |
| `remoteAuthConfigIds`    | JSON object of toolkit slug to auth config id. No secret. Default `{}`.                |
| `updatedByUserId`        | The owner or admin who last saved.                                                     |
| `createdAt`, `updatedAt` |                                                                                        |

The migration enables row-level security. The tenant policy matches `alma_trials`: a row is visible when `app.space_id` is a space whose `organizationId` equals the row's. `USING` and `WITH CHECK` both use that test. The system policy is `USING ((SELECT app_rls_bypass()))` with no `WITH CHECK`. `GRANT SELECT, INSERT, UPDATE, DELETE` to `rakazo_app` when that role exists. `OrganizationGoogleOAuthClient` is added to `ROW_SECURITY_MODELS`. The row-security Postgres test's "protects exactly the tables" assertion is the list that must stay equal.

No column is named for the catalog vendor. The ciphertext is the only copy of the secret in ALMA. Deleting the organization deletes the row. Remote auth configs for a deleted organization are left; that is accepted. Organization deletion already removes the organization's connections.

## Who can do what

Better Auth stores `member.role` as a comma-separated list. An actor may read or change the row when their membership on that organization includes `owner` or `admin`, the same test `auditLogReaderWhere` uses (`role` in `owner`, `admin`). A `member` or `guest` receives `FORBIDDEN` on the four RPCs.

The active space's organization is the only organization the RPCs accept. The input `organizationId` must equal the organization that owns `actor.spaceId`. Any other id is `FORBIDDEN`, not a way to read another organization.

Every Google connection whose space belongs to that organization uses the row when it exists, including a connection started by a member or a guest. They do not choose. They do not see the form. A guest whose Google account is outside an Internal client cannot finish Google's consent; that is the client's user type, and ALMA does not fall back to the default client for that guest.

## Secret handling

-   The client secret is encrypted with the process `EncryptedSecretStore` before insert. The plaintext exists in memory only for the Composio call that creates or updates auth configs, and for the test action.
-   Decrypt uses `load(ciphertext, organizationId)` so the AAD is the organization id.
-   No RPC output schema has a secret field, a ciphertext field, or the full client ID. The saved view returns `configured: true` and `clientIdLast4`.
-   `clientIdLast4` is the last four characters of the client ID with the suffix `.apps.googleusercontent.com` removed. `123-abcdef.apps.googleusercontent.com` shows `cdef`. The full client ID is not returned.
-   Logs may include the organization id, the toolkit slug, and an auth config id. They must not include the client secret, the ciphertext, the full client ID, or the Composio API key. Errors returned to the client pass through `sanitizeIntegrationError` and a second replace that removes the secret value and the client ID value when those strings are non-empty.
-   The client secret is never written to a connection row, a session cache, or an audit metadata blob.

Validation on save, rejected with `BAD_REQUEST` before any write:

-   Client ID matches `^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$` (case-insensitive). Length at most 200.
-   Client secret length is 8 through 256. It must not contain whitespace. It must not equal the client ID.

Saving replaces the ciphertext and updates each remote auth config's credentials. Auth configs are created or updated only after the new ciphertext is written. If a remote call fails, the previous ciphertext and previous auth config ids are restored, and the RPC returns a sanitized `BAD_REQUEST`. A failed save does not leave a new secret in place without matching remote configs.

## Connection behavior

`ComposioConnector` takes an optional `authConfigIdsFor(context) => Promise<Record<string, string> | undefined>`. Production wiring passes it only when the flag is on, from both places that construct the live connector: `packages/adapters/src/run-runtime.ts` and `packages/adapters/src/integration-provider-settings.ts`. Tests that construct the connector without the hook are unchanged.

The hook loads the row for the organization that owns `context.spaceId`. It returns the stored id map, or `undefined` when there is no row. It does not decrypt.

`sessionFor` and `sessionForExecute` call `composio.create` with the same object as today when the hook is absent, returns `undefined`, or returns `{}`. They add `authConfigs` set to that map only when the map has at least one entry. The catalog and execute session cache keys gain a suffix of the sorted `toolkit:id` pairs in that case. The no-map key stays the current key, so a user with no custom client still reuses the session they reuse today.

`begin` uses that session, so `session.authorize` runs inside a session that carries the org's config for Google toolkits. Non-Google providers do not consult the table.

Before `begin` for a Google toolkit, when the flag is on and a row exists but the map has no id for that slug, the server creates the auth config, stores the id, and then starts the session. The create is serialized with a Postgres advisory lock named `google-oauth:` plus the organization id. A second request waits and reuses the id.

Tool runs use the same hook, so a connected account created under the custom config stays on that config. A connection made before the client was saved was created under managed auth. The settings copy says those Google apps may need to be connected again. ALMA does not delete or rewrite existing connection rows when the client is saved or removed.

## Remove

Remove deletes each remote auth config id, then deletes the local row. Remote deletes run first. If one fails, the row stays, the RPC returns a sanitized `BAD_REQUEST`, and the client remains in use. The admin can retry. A successful remove deletes the row. Later Google connections in that organization use ALMA's current sign-in. The UI says Google apps connected with the removed client may need to be connected again.

## Test connection

Owner or admin only. It does not create a local connection row.

1. Decrypt the stored secret.
2. Ensure the `gmail` auth config exists (create or update under the same lock as save).
3. Open a session with that `authConfigs` entry and call `authorize("gmail", { callbackUrl })` with the same callback the real connect flow uses (`webOrigin + "/integrations/callback"`).
4. If `authorizationUrl` is a string that starts with `https://` and does not contain the client secret, cancel that authorization with the existing `cancelAuthorizationRequest`, and return `{ ok: true }`.
5. Otherwise return a sanitized failure. The authorization URL is not returned to the client.

If the URL contains a `client_id` query parameter, it must equal the stored client ID. A URL with no `client_id` parameter still passes. Composio may put its own hop in front of Google.

No row means `BAD_REQUEST` with `Save a client first.` The secret is not accepted on the test RPC. Test uses the stored client only.

## Settings UI

Web settings, section Organization, under the existing name row. Desktop uses this web UI. Mobile has no organization settings screen; the server still applies the client there. No store build.

The section renders only when bootstrap `me.googleByoOauth` is `true`. The field is optional on `Me` so older servers stay valid.

Two blocks, in this order:

**Trusted app.** Short steps, the deployment client ID, a copy button whose accessible name is `Copy client ID`, and a link to `/docs/google-workspace.md`. The client ID is `ALMA_GOOGLE_OAUTH_CLIENT_ID` trimmed. It is shown only when it matches the client ID pattern above. Otherwise the block says the client ID is not set on this server and hides the copy button. This value is ALMA's client, not the organization's. It is public in the sense that Google already puts it on the consent URL. It is still not hardcoded.

**Own client.** Closed until the owner or admin opens `Use your own Google client`. Then: the redirect URI with a copy button, the scope list grouped by app name, the steps below, client ID and client secret inputs, Save, Test connection, and Remove when a client is saved. A member never sees the inputs. The secret input is write-only. After save, the secret field is cleared and the row shows `Client ID ending in {clientIdLast4}` plus `Secret saved`. Remove asks for confirmation and includes the reconnect sentence.

Steps, in order, via Lingui so English and Spanish both exist:

1. In Google Cloud, open the OAuth consent screen for your Workspace project and set the user type to Internal.
2. Create an OAuth client ID of type Web application.
3. Add the redirect URI shown here as an authorized redirect URI.
4. Add every scope listed here.
5. Paste the client ID and client secret, then save.
6. Choose Test connection.
7. Removing the client uses ALMA's Google sign-in again. Google apps already connected with this client may need to be connected again.

The same reconnect sentence is shown after a successful save, because connections made before the client was saved may also need to be connected again.

Copy that is not one of those steps stays as short as the rest of Settings. No second explanation of the same control.

Spanish is filled in `apps/web/src/locales/es/messages.po`. English is the Lingui source. Other catalogs get the new entries translated in the same change so the catalogs stay complete. The help article is not a Lingui catalog. It is markdown with an English section and a Spanish section, because `/docs` serves one file.

## Help article

File `docs/google-workspace.md`. Registered in `HELP_DOC_NAMES` only when the flag is on. `readHelpDoc` replaces the token `{{ALMA_GOOGLE_OAUTH_CLIENT_ID}}` with the trimmed env value when that value matches the client ID pattern. When it does not, the token is replaced with the sentence `The client ID is not set on this server.` The token is never left in the served page. The file in git contains the token, never a real client ID.

The article tells a Workspace admin to open Google Admin console, then Security, Access and data control, API controls, Manage third-party app access, Configure new app, search by the OAuth client ID, and set the app to Trusted. It states that after that, people in the organization connect without the unverified-app warning. It links to Settings → Organization for the own-client option and says that option is present when the server has it turned on. It does not name the flag.

## API

Namespace `googleOAuth` on the RPC contract.

-   `get` → `{ configured, clientIdLast4, redirectUris, apps, trustedClientId }`. `redirectUris` is the one v3 callback. `apps` is `{ slug, name, scopes: string[] }[]` sorted by name. `trustedClientId` is the deployment client ID or `null`.
-   `save` input `{ organizationId, clientId, clientSecret }` → the same shape as `get` after the write.
-   `remove` input `{ organizationId }` → `{ configured: false, clientIdLast4: null, redirectUris, apps, trustedClientId }`.
-   `test` input `{ organizationId }` → `{ ok: true }`.

`apps` is loaded from the Composio directory of Google toolkits plus each toolkit's OAuth2 `scopes` default. If the directory call fails, `apps` is `[]` and `scopesUnavailable` is `true`. The client still shows the redirect URI and the steps, and says the scope list could not be loaded.

Flag off: all four throw `NOT_FOUND` / `Not found.`

## Rollout

The flag stays off in production until the operator sets `ALMA_GOOGLE_OAUTH_CLIENT_ID` to the client ID of the Google OAuth app behind ALMA's current sign-in and sets the flag to `true`. This change does not know that client ID and does not put one in the repo. With the flag off, nothing in the connection path reads the new table.

No store build. No deploy in this change.

## Tests

-   Encrypt and decrypt with `EncryptedSecretStore`: the ciphertext does not contain the plaintext, and `load` with the organization id returns it. `load` with a different id fails.
-   `get` and `save` responses, serialized, do not contain the client secret, the ciphertext, or the full client ID. They do contain `clientIdLast4`.
-   With no row, and with the flag off even if a row exists, `composio.create` is called without `authConfigs` and with `manageConnections: false` and `sandbox: { enable: false }`.
-   With a row and the flag on, a Gmail `begin` calls `composio.create` with `authConfigs` containing the stored id for `gmail`, and a non-Google provider does not.
-   A member and a guest receive `FORBIDDEN` on `get`, `save`, `remove`, and `test`. An owner and an admin succeed. A member's Gmail `begin` still uses the org map when a row exists.
-   After a successful remove, the next `create` omits `authConfigs`.
-   A thrown provider error that includes the secret is returned and logged without the secret.
-   The row-security test's protected-table list includes `organization_google_oauth_clients`.

Tests stay offline. Composio is the existing fake client. No live Google call.

## Open decisions

-   The production value of `ALMA_GOOGLE_OAUTH_CLIENT_ID` is not in this repo. The operator has to set it to the client ID Google shows on the unverified screen today. Until then the trusted card says the client ID is not set.
-   Scopes follow Composio's toolkit defaults and are not stored. A later change in those defaults changes the list the admin is told to register. Saved auth configs are not rewritten until the next save.
-   Remote auth configs of a deleted organization are not cleaned up.
-   A guest in the organization's space uses the org client and is not offered the default client when Google rejects them.
