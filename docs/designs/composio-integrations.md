# Composio integrations, matching Rakazo Cloud

- **Status:** Implementing
- **Date:** 2026-11-12
- **Upstream:** `elie222/rakazo` `main` at `103e87088` (2026-11-12). Seven commits ahead of ALMA's last sync (`0106118b1`). None of them change Composio.

## What Rakazo Cloud does

Upstream has one integrations catalog. `COMPOSIO_API_KEY` on the API and the worker fills it from Composio. The web plugins page and the phone Integrations screen both render that catalog. Five apps are pinned first: Gmail, Google Calendar, Google Drive, Slack, and Notion. The rest of the Composio directory follows, then plugins that are not already one of those apps. Connect opens Composio's sign-in link. Tool calls go through the Composio session. There is no hosted-only flag and no second connector for Gmail, Calendar, or Drive.

`session.authorize` is called without an auth-config id, so the sign-in is Composio's managed app unless the Composio project itself has a default auth config. That default is dashboard state. It is not in this repository. Apps with no managed sign-in and no enabled auth config are left out of the directory. Which apps that removes depends on the project behind the API key.

## What ALMA does now

The same screens, with one overlay. When `ALMA_GOOGLE_OAUTH_CLIENT_ID` is a Google client id, `WEB_ORIGIN` is set, and `MCP_OAUTH_PRESET_CLIENTS` has exactly one entry with that client id and a secret, ALMA registers a `google` connector. That connector serves Gmail, Calendar, and Drive with ALMA's own OAuth client. Composio's rows for those three apps are hidden from search. Slack, Notion, GitHub, and the other Composio apps stay on Composio. The phone list in the request is that screen: the five pinned apps, then the next Composio apps (the shot shows Composio and GitHub, and the list continues). "Working…" is the shared Add button while a connect is in progress.

`ALMA_GOOGLE_SCOPE_MODE` (default `limited`) is the verification path that asks only for `gmail.send`, calendar scopes, and `drive.file`, plus the Drive picker. `ALMA_GOOGLE_BYO_OAUTH=true` lets an organization admin store their own Google client as a Composio auth config and use it for those toolkits.

## Replacement

`ALMA_COMPOSIO_INTEGRATIONS` is on only when the value is exactly `true`. Unset, `yes`, and `1` stay off. The API and the worker both read it.

Off, nothing changes.

On:

- The `google` connector is not registered. Gmail, Calendar, and Drive come back into the Composio catalog. Web and phone render that catalog with the same components they use today. No new labels.
- Composio sessions are built the way upstream builds them: the API key only, no organization auth-config ids, and the three Google apps are not filtered out.
- The organization Google card is hidden, saving or attaching an organization Google client is refused, and the in-app Google help page is not served. Stored client rows stay.
- Grants and connection rows already saved for the `google` connector stay in the database. They are not deleted, so turning the flag off registers the connector again and those grants work again. While the flag is on they are not used, and they do not mark the Composio Gmail, Calendar, or Drive rows as added. A person connects those three again from Integrations. Composio connections already stored keep working.
- Drive file choice is unavailable, because that control belongs to the `google` connector.
- Preview Google MCP hosts are dialed again, as they are upstream.

Pipedream stays available when its four variables are set. That is upstream's behavior.

## Production

Leave the flag unset in this change. To turn it on later, set `ALMA_COMPOSIO_INTEGRATIONS=true` on the API and the worker and restart both. `COMPOSIO_API_KEY` is already the catalog. Do not print it. No migration runs. No column is added or dropped.

## What the open-source tree cannot show

- The Composio project's managed-auth coverage and any default auth config. If most toolkits have no managed scheme and no enabled auth config, the list stays short after this flag is on. That is the project behind the key, visible in the Composio dashboard.
- Whether Rakazo Cloud's project uses a custom OAuth app for Google. The code asks Composio for a connect link and does not send an auth-config id.
- Whether Cloud sets Pipedream variables. The code mounts Pipedream only when all four are set.
- A signed-in look at `app.rakazo.com`. This change does not have that session.

## Questions

1. Should production set `ALMA_COMPOSIO_INTEGRATIONS=true` after review? This change leaves it off.
2. People who already connected Gmail, Calendar, or Drive with ALMA's client need to connect those apps again through Composio. The old grants stay stored until the flag is turned off. Is that the migration you want?
3. While the flag is on, Google's consent screen is Composio's managed app, and the limited-scope path (`gmail.send`, `drive.file`, the Drive picker) is idle. Is that acceptable?
4. If an organization Google client already created auth configs in the Composio project, should those configs be disabled in the dashboard so connect uses managed auth? This change does not delete them.
5. Is the Composio project for this server the one that should match Cloud's catalog, or does Cloud use a different project?
