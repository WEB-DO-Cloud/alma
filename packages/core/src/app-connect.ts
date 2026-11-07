import type { ConnectionCatalogItem, MessageBlock } from "@rakazo/contracts";
import { featuredConnectorProvidersMatch } from "./featured-connectors.js";
import type { MailConnectorTarget } from "./mail-connector-aliases.js";
import { itemMatchesMailTarget, mailTargetsForQuery } from "./mail-connector-aliases.js";

export type AppConnectBlock = Extract<MessageBlock, { kind: "app_connect" }>;

const APP_DESCRIPTIONS: Record<string, string> = {
  slack: "Search, read, and send messages.",
  gmail: "Search, read, draft, and send email.",
  googlecalendar: "Search events and schedule meetings.",
  notion: "Search and edit pages and databases.",
  googledocs: "Draft and edit documents.",
  hackernews: "Search stories and discussions.",
};

export function matchAppCatalog(catalog: ConnectionCatalogItem[], app: string) {
  const query = app.trim().toLowerCase();
  return (
    catalog.find(
      (entry) => entry.slug.toLowerCase() === query || entry.name.toLowerCase() === query,
    ) ?? catalog.find((entry) => featuredConnectorProvidersMatch(entry.slug, query))
  );
}

/** Every catalog app a phrase names. A mail alias can name Gmail and Outlook together. */
export function matchAppCatalogEntries(catalog: ConnectionCatalogItem[], app: string) {
  const targets = mailTargetsForQuery(app);
  if (targets) {
    const found: ConnectionCatalogItem[] = [];
    for (const target of targets) found.push(...pickMailTarget(catalog, target));
    if (found.length > 0) return found;
  }
  const one =
    matchAppCatalog(
      catalog.filter((entry) => entry.connected),
      app,
    ) ?? matchAppCatalog(catalog, app);
  return one ? [one] : [];
}

function pickMailTarget(
  catalog: ConnectionCatalogItem[],
  target: MailConnectorTarget,
): ConnectionCatalogItem[] {
  const hits = catalog.filter((entry) => itemMatchesMailTarget(entry, target));
  const chosen = hits.find((entry) => entry.connected) ?? hits[0];
  return chosen ? [chosen] : [];
}

/** Like `matchAppCatalog`, but an entry some provider reports connected wins. */
export function matchConnectedAppCatalog(catalog: ConnectionCatalogItem[], app: string) {
  return (
    matchAppCatalog(
      catalog.filter((entry) => entry.connected),
      app,
    ) ?? matchAppCatalog(catalog, app)
  );
}

export function appConnectCard(entry: ConnectionCatalogItem): AppConnectBlock {
  const description =
    itemMatchesMailTarget(entry, "gmail") || itemMatchesMailTarget(entry, "outlook")
      ? "Search, read, draft, and send email."
      : (Object.entries(APP_DESCRIPTIONS).find(
          ([slug]) =>
            entry.slug.toLowerCase() === slug || featuredConnectorProvidersMatch(entry.slug, slug),
        )?.[1] ?? "");
  return {
    kind: "app_connect",
    connectorId: entry.connectorId,
    provider: entry.slug,
    name: entry.name,
    description,
    logo: entry.logo ?? null,
    status: entry.connected ? "connected" : "pending",
  };
}

export function matchesAppConnection(
  block: MessageBlock,
  connectorId: string,
  provider: string,
): block is AppConnectBlock {
  return (
    block.kind === "app_connect" &&
    (block.connectorId ?? "composio") === connectorId &&
    (block.provider.toLowerCase() === provider.toLowerCase() ||
      featuredConnectorProvidersMatch(block.provider, provider))
  );
}

export function connectedAppBlocks(
  blocks: MessageBlock[],
  connectorId: string,
  provider: string,
): MessageBlock[] {
  return blocks.map((block) =>
    matchesAppConnection(block, connectorId, provider) ? { ...block, status: "connected" } : block,
  );
}

/** Shared completion input for inline cards on every client. */
export function appConnectedInput(
  botId: string,
  threadId: string,
  block: AppConnectBlock,
  messageId?: string,
) {
  return {
    botId,
    threadId,
    ...(messageId ? { messageId } : {}),
    connectorId: block.connectorId,
    provider: block.provider,
  };
}
