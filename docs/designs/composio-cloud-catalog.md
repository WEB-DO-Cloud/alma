# Composio catalog, matching Rakazo Cloud

- **Status:** Implementing
- **Date:** 2026-11-12
- **Upstream:** `elie222/rakazo` `main` at `b029a64` (2026-11-12). Compared with ALMA `main` at `7118c61b8`.

`ALMA_COMPOSIO_INTEGRATIONS` stays exactly `true` or off. Off is unchanged. On, Integrations uses the same catalog rules as Rakazo Cloud.

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

Same connect rules as Cloud:

- The directory is the live session list, paged until exhausted. Nothing is hardcoded. Toolkits with no managed sign-in and no enabled auth config are dropped, unless the person already has an account. OAuth, API key, and the other schemes on Composio's connect link stay. **Connect** is still `session.authorize`. This server does not collect the key.
- `toolkits.get` (the lookup Cloud already makes) also supplies a category name when Composio sends `meta.categories[].name`. Search matches that name. When any app has one, the category chips are those names, with the rest under **More**. Featured apps stay the five pins. The grid still grows by 60. Logos stay the toolkit logo.
- A plugin whose brand is one of those apps is not a second row. Skills still attach to the brand. On the web, an installed plugin connector hides the catalog **Connect** button and the page shows that plugin's MCP server, the same line as `plugin-marketplace.tsx` upstream. Those servers stay available to the agent. There is no migration.

## Flag off

The Google connector stays, Gmail, Calendar, and Drive leave the Composio catalog, and an installed plugin connector still replaces the managed row on the web.
