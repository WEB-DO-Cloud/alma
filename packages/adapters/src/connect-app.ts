import type { AdapterContext, ManagedConnectorProvider } from "@rakazo/adapter-kit";
import {
  appConnectCard,
  itemMatchesMailTarget,
  mailTargetsForQuery,
  matchAppCatalog,
  matchAppCatalogEntries,
  matchesAppConnection,
} from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  appendEventInTransaction,
  createThreadMessageInTransaction,
  storedMessageBlocks,
  THREAD_LOCK_TRANSACTION_OPTIONS,
} from "@rakazo/db";
import { DEFAULT_CONNECTOR_ID } from "./connector-registry.js";

const RECENT_MESSAGES = 50;
const OFFERED_APPS = 12;

function unavailableAppMessage(app: string, catalog: { slug: string; name: string }[]): string {
  const ranked = [...catalog].sort((left, right) => {
    const rank = (item: { slug: string; name: string }) =>
      itemMatchesMailTarget(item, "gmail") ? 0 : itemMatchesMailTarget(item, "outlook") ? 1 : 2;
    return rank(left) - rank(right) || left.name.localeCompare(right.name);
  });
  const names: string[] = [];
  for (const item of ranked) {
    if (!names.includes(item.name)) names.push(item.name);
  }
  const shown = names.slice(0, OFFERED_APPS);
  const extra = names.length > shown.length ? ` and ${names.length - shown.length} more` : "";
  const available = shown.length
    ? ` Apps you can connect with connect_app: ${shown.join(", ")}${extra}.`
    : " This server has no app catalog, so there is no connection card to show.";
  return `No app matching "${app}" is in the catalog.${available} Offer those in the chat. Do not tell the user to open settings, admin, or billing.`;
}

/** Catalog data is the only source of card content; serialize dedupe with the message write. */
export async function connectApp(
  deps: { prisma: PrismaClient; events: ThreadEvents },
  providers: ManagedConnectorProvider[],
  context: AdapterContext,
  target: { id: string; spaceId: string; threadId: string; botId: string },
  app: unknown,
  effectId: string,
) {
  if (typeof app !== "string" || !app.trim() || app.length > 100) {
    return { error: "Provide an app name or slug of at most 100 characters." };
  }
  const catalog = (
    await Promise.all(
      providers.map(async (provider) => {
        try {
          const query = await provider.catalog(context, app.trim());
          const own = query.filter((entry) => entry.connectorId === provider.describe().id);
          const targets = mailTargetsForQuery(app.trim());
          const found = matchAppCatalogEntries(own, app.trim());
          // A provider's text search may not recognize a featured alias such as gcal,
          // and a mail phrase can name more than the first hit.
          const complete = found.length > 0 && (!targets || found.length >= targets.length);
          const entries = complete ? own : await provider.catalog(context);
          return entries.filter((entry) => entry.connectorId === provider.describe().id);
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  const query = app.trim();
  const mailTargets = mailTargetsForQuery(query);
  const mailEntries =
    mailTargets && mailTargets.length > 1
      ? catalog.filter(
          (item) =>
            !item.connected && mailTargets.some((target) => itemMatchesMailTarget(item, target)),
        )
      : [];
  // An app connected through any provider counts, even if another provider lists it first.
  const entry =
    mailEntries.length > 0
      ? null
      : (matchAppCatalog(
          catalog.filter((item) => item.connected),
          app,
        ) ?? matchAppCatalog(catalog, app));
  if (!entry && mailEntries.length === 0) return { error: unavailableAppMessage(query, catalog) };
  const provider = entry
    ? providers.find((provider) => provider.describe().id === entry.connectorId)
    : undefined;
  const reconnect =
    entry?.connected && ((await provider?.needsReconnect?.(context, entry.slug)) ?? false);
  if (entry?.connected && !reconnect)
    return {
      status: "connected",
      message: "This app is already connected and its tools are available.",
    };
  const blocks =
    mailEntries.length > 0
      ? mailEntries.map((item) => appConnectCard({ ...item, connected: false }))
      : [appConnectCard({ ...entry!, connected: false })];
  const committed = await deps.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM threads WHERE id = ${target.threadId} FOR UPDATE`;
    const nonce = `connect-app:${effectId}`;
    const replayed = await tx.message.findFirst({
      where: { threadId: target.threadId, clientNonce: nonce },
      select: { id: true },
    });
    if (replayed) return null;
    // Only recent cards count as already shown; an old one far up the chat should not block a new one.
    const recent = await tx.message.findMany({
      where: { threadId: target.threadId },
      select: { id: true, blocks: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_MESSAGES,
    });
    if (
      recent.some((message) =>
        storedMessageBlocks(message).some((candidate) =>
          (entry ? [entry] : mailEntries).some((card) => {
            if (!matchesAppConnection(candidate, card.connectorId, card.slug, DEFAULT_CONNECTOR_ID))
              return false;
            return candidate.status === "pending";
          }),
        ),
      )
    )
      return null;
    const message = await createThreadMessageInTransaction(tx, {
      threadId: target.threadId,
      botId: target.botId,
      runId: target.id,
      role: "bot",
      blocks,
      clientNonce: nonce,
    });
    const event = await appendEventInTransaction(tx, {
      spaceId: target.spaceId,
      threadId: target.threadId,
      botId: target.botId,
      runId: target.id,
      type: "thread.message.created",
      payload: { messageId: message.id, role: "bot", blocks },
    });
    return event;
  }, THREAD_LOCK_TRANSACTION_OPTIONS);
  if (committed)
    await deps.events.notify(
      target.threadId,
      committed.seq,
      committed.firstResponse ? target.id : undefined,
    );
  const shown = committed ? "Connection card shown." : "Connection card already shown.";
  return {
    status: "pending",
    message: reconnect
      ? `${shown} The saved connection gives this app no tools, so the user must reconnect it. Wait for them to do so.`
      : `${shown} Wait for the user to connect the app.`,
  };
}
