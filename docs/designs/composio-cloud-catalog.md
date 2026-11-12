# Composio catalog, matching Rakazo Cloud

- **Status:** Implementing
- **Date:** 2026-11-12
- **Upstream:** `elie222/rakazo` `main` at `b029a64` (2026-11-12). Compared with ALMA `main` at `7118c61b8`.

`ALMA_COMPOSIO_INTEGRATIONS` stays exactly `true` or off. Off is unchanged. On, Integrations lists every toolkit the Composio API returns and connects each one through that catalog.

## What Rakazo Cloud does

There is no hosted-only flag. `COMPOSIO_API_KEY` on the API and the worker is the catalog.

1. **Catalog.** `ComposioConnector.catalog` (`packages/adapters/src/composio-connector.ts`) opens a session and pages `session.toolkits` until the directory is exhausted. A second call, `toolkits.get`, finds toolkits with no managed sign-in and no enabled auth config. `mergeCatalogWithConnected` (`packages/adapters/src/composio-catalog-cache.ts`) drops those (Shopify and X are the examples in the tests) unless the user already has an account. Everything else — OAuth, API key, and other schemes Composio can collect in its connect link — stays. `session.authorize` is called with the toolkit slug and no auth-config id.
2. **Browse.** Web `use-catalog-browse.ts` and phone `browsablePlugins` pin Gmail, Google Calendar, Google Drive, Slack, and Notion, then page the rest 60 at a time (`CONNECTION_CATALOG_PAGE_SIZE` in `packages/core/src/featured-connectors.ts`). Logos come from the toolkit. Search is local. Category chips come from plugin sections, not from Composio.
3. **One brand.** `managedAppFor` (`packages/core/src/plugin-catalog.ts`) matches a plugin to a catalog app by name. A match is not listed again. If the plugin has skills, opening the app opens the plugin page and the skills sit on that brand. The registries are Cursor (`github.com/cursor/plugins`) and the xAI marketplace (`packages/adapters/src/plugin-marketplace.ts`). Cursor's Gmail plugin is `third_party/gmail` and its connector is `https://gmailmcp.googleapis.com/mcp/v1`.
4. **Connect on that page.** `PluginDetail` in `apps/web/src/components/integrations/plugin-marketplace.tsx` shows the catalog **Connect** button when a managed app is passed. If the plugin is already installed with its connector part, that line sets `managed` to nothing and the page shows the plugin's MCP server instead. The phone plugin screen does not do this; it keeps the managed app when the route names one.
5. **Runtime.** A connected Composio account is a `composio` connection. Tool calls go through the Composio session (`discoverTools` / `execute` in the same connector). An installed plugin still creates MCP servers (`apps/api/src/plugin-installs.ts`), and `McpConnector` dials them, including the Google hosted MCP hosts. Cloud has no second Google connector and no preset that prefers those hosts.

## What ALMA does on this commit, before this change

The same screens, plus the flag from `docs/designs/composio-integrations.md`.

- **Off.** `GoogleWorkspaceConnector` is registered when ALMA's Google client is configured. Gmail, Calendar, and Drive leave the Composio catalog (`omitWorkspaceCatalog`). Slack, Notion, and the rest stay on Composio. Toolkits with no managed sign-in stay hidden. An installed plugin connector still hides the managed row on the web.
- **On.** The Google connector is not registered, the three Google apps return to Composio, and sessions are built with the API key only. The web hide is unchanged, so an installed Cursor Gmail plugin (`capability_installs` source `cursor/plugins#third_party/gmail`) replaces **Connect** with `gmailmcp.googleapis.com`. `MCP_OAUTH_PRESET_CLIENTS` can then sign that host in with Google. The Composio connection table stays empty. Plugin skills still merge only when the names match and the connector part is not installed.

Mail search aliases (`packages/core/src/mail-connector-aliases.ts`) are ALMA-only and stay.

## Flag on

- The directory is still the live session list, paged until exhausted. Nothing is hardcoded. `toolkits.get` (limit 1000, the call that already exists) supplies each toolkit's category name when Composio sends `meta.categories[].name`, and which toolkits have no managed scheme.
- Toolkits with a managed scheme (OAuth, API key, bearer, and the rest Composio puts on its connect link) keep **Add** / **Connect**. The link is still `session.authorize`. This server does not collect the key itself.
- Toolkits with no managed scheme and no enabled auth config are listed, not dropped. The app page says "Sign-in is not available for this app yet." and does not start a connect. An enabled auth config in the Composio project removes the sentence on the next catalog load, which is the existing rule for making that app connectable.
- Featured apps stay the five pins. Search matches name, slug, category, and the mail aliases. Category chips are the category names Composio sent, with the rest under **More**. The grid still grows by 60. Logos stay the toolkit logo.
- A plugin whose brand is one of those apps is not a second connector. Skills still attach to the brand. On the web, an installed plugin connector no longer hides **Connect**. The phone already kept it.
- While the flag is on, MCP servers that belong to those plugin installs are omitted from the agent and from the connected-apps list. The install rows stay. There is no migration and nothing is deleted. Turning the flag off uses those servers again.

## Flag off

No catalog field is set, hidden toolkits stay hidden, the Google connector stays, and an installed plugin connector still replaces the managed row on the web.

## Copy

"Sign-in is not available for this app yet."

It is the only new sentence. It appears on an app that Composio cannot connect, in place of **Connect**. Removing it would either hide the app or offer a connect that fails. A list-wide explanation would repeat it for every other app.
