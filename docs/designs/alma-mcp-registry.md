# MCP registry search and popular connectors

## Goal

A person adding a connector should find a known remote MCP server and add it without leaving ALMA. Search hits come from the official MCP Registry. A short Popular list, chosen for legal work and general productivity, sits at the top of the connectors screen. Both use the existing MCP server create path and, on the web, the existing OAuth popup.

## UX

The connectors screen is Integrations on the web (`Connect apps`) and the mobile integrations screen. The web MCP servers dialog gets the same browse block, because that dialog is the add-server form.

- With an empty search, a **Popular** card grid shows a logo (or an initial), the name, one line of description, the host, and **Add**.
- Typing in the existing **Search apps** field waits briefly, then asks ALMA for registry matches. Each match shows the name, description, icon when the registry has one, the remote URL, and HTTP or SSE. Stdio-only packages are not listed.
- **Add** creates the server with that URL and transport. On the web it then starts the existing OAuth popup. When the registry marks a header as required, Add asks for that header value and stores it with the existing encrypted header field. It does not open a new settings page.
- A server whose endpoint is already saved shows **Added**.
- The plugin catalog, featured app tiles, and advanced tool-source buttons stay as they are. Registry cards are not links.

Copy is Spanish-first: web strings go through the Lingui catalogs (`es` and `en`); mobile uses the same English source strings in its locale maps. Registry-provided descriptions in search results stay in the publisher's language.

## API

Authenticated procedure `mcp.registry.search`.

- Input: `query` (2–80 characters), `limit` (1–20, default 12).
- The API calls `GET https://registry.modelcontextprotocol.io/v0/servers?search=…&limit=30&version=latest`.
- Output: `{ servers: [{ registryName, name, description, iconUrl, transport, endpoint, needsHeader, headerName }] }`.
- `transport` is `streamable_http` or `sse`. Streamable HTTP is preferred when a server publishes both.
- Responses are cached in process for 60 seconds, keyed only by the normalized query. The client waits 300ms after the last keystroke and aborts the previous request.

Popular entries are not fetched at runtime. They live in `packages/core/src/mcp-registry-featured.ts`.

## Data

Each featured row records the registry server name, the display name, an English description, the remote URL, and the transport. The list was checked against `version=latest` on 2026-11-01. Only rows with a concrete `https` remote are included.

Google Drive, Dropbox, Box, and HubSpot had no first-party remote in that check, so they are absent. Gmail, Google Calendar, and Outlook use the MintMCP remotes that are actually published in the registry. Slack uses the Waystation remote. The others are the vendor's own remote.

## Security

- The upstream host is fixed. Redirects are refused. The body is size-capped and the call times out.
- Returned endpoints must be `https`, with no userinfo, fragment, or `{template}`. Loopback and private hosts are dropped before they reach the client. Creating a server still runs the existing remote-endpoint check.
- Header secret templates from the registry are not returned. Only a required header's name is, and the person types the value.
- The cache holds public registry data, not account data.
- No new provider environment variable. The registry URL is the public endpoint.

## Out of scope

- Installing stdio packages from a search hit.
- Ranking Popular by live download counts.
- Changing the OAuth redirect allowlist so the phone can finish OAuth itself. The phone saves the server; the web popup still completes OAuth.
- Editing the plugin catalog, adding navigation, or linking to Rakazo.
