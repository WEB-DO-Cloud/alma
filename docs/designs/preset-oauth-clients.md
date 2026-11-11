# Preset OAuth clients for MCP servers

-   **Status:** In Review
-   **Date:** 2026-11-04

## Problem

Google's MCP servers (`gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`, `drivemcp.googleapis.com`, and the other `*.googleapis.com` MCP hosts) do not offer dynamic client registration. Connecting one throws `McpOAuthClientRequiredError`. The only way through today is to paste a client id and secret under Advanced on that server. That is the wrong task for a lawyer who only wants to tap Sign in.

## Decision

The deployment can configure one OAuth client per host pattern. `MCP_OAUTH_PRESET_CLIENTS` is a JSON object. Each key is a hostname or a single leading wildcard (`*.googleapis.com`). Each value is `{ clientId, clientSecret, extraAuthorizationParams }`. `extraAuthorizationParams` is an object of authorization-request parameters, or the same query string the Advanced field already accepts (`access_type=offline&prompt=consent`).

The API and the worker both read the variable. With it unset or empty, nothing changes.

When a remote MCP server's endpoint host matches a pattern and that server has no OAuth client of its own, the broker uses the preset for the authorization-code flow and for later refresh. A client saved on the server still wins, including that client's own authorization parameters. The redirect URI stays `https://<web origin>/mcp/oauth/callback`.

The preset secret is never written into the server's stored credential, never returned by the API, and never included in a log line. The stored credential may record the authorization server the preset was first sent to (`presetAuthorizationServer`). That binding has no secret. It is what stops a later discovery response from steering the shared client at a different authorization server. Rotating the secret is an env change plus a restart of the API and the worker; existing grants keep working because the secret is read again at refresh time.

For a host under `googleapis.com`, the authorization URL includes `access_type=offline` and `prompt=consent` when the preset did not set them. Google ignores the `offline_access` scope the broker adds for other providers, and without those two parameters it does not issue a refresh token. Values in the preset override the defaults.

The server list gains `oauthPreset: true` when a preset covers that endpoint and the user has not saved a client. The response does not include the preset's client id or secret. While that flag is set, a stored "does not support dynamic client registration" health result is shown as not checked yet, and web, iOS, and Android offer the existing Connect OAuth action instead of asking for a client id.

An invalid value fails process startup. The error names the variable and the host pattern. It does not include the JSON or the secret.

## Non-goals

-   No new sign-in copy. The buttons stay Connect OAuth.
-   No preset for stdio servers. Those still need a client and an authorization server entered on the server, because they have no endpoint host to match.
-   No per-preset scope. The MCP resource's published scopes are still what the flow requests. A preset cannot override `redirect_uri`, `scope`, `state`, or the other parameters the flow sets itself.
-   No second redirect URI. Native apps keep opening the provider in the browser and returning to the web callback.

## Open questions

-   Google's MCP resource metadata is what supplies the API scopes. This change does not add a scope field to the preset. If a host publishes no scopes and the registered client has none either, the grant may be too narrow. That would be a follow-up, not a second env var.
-   `*.googleapis.com` matches every host that ends in `.googleapis.com`, including more than one label (`a.b.googleapis.com`). It does not match `googleapis.com` itself. An exact key wins over a wildcard.
