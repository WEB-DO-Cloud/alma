import type { AdapterContext, ManagedConnectorProvider } from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import type { AppConnectBlock } from "@rakazo/core";
import {
  appConnectCard,
  itemMatchesMailTarget,
  mailTargetsForQuery,
  matchAppCatalogEntries,
  matchesAppConnection,
} from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  appendEventInTransaction,
  createThreadMessageInTransaction,
  THREAD_LOCK_TRANSACTION_OPTIONS,
} from "@rakazo/db";

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
  // An app connected through any provider counts, even if another provider lists it first.
  const matches = matchAppCatalogEntries(catalog, app.trim());
  if (matches.length === 0) return { error: unavailableAppMessage(app.trim(), catalog) };
  const pending = matches.filter((entry) => !entry.connected);
  if (pending.length === 0) {
    return {
      status: "connected",
      message: "This app is already connected and its tools are available.",
    };
  }
  const connectedNames = matches.filter((entry) => entry.connected).map((entry) => entry.name);
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
      select: { blocks: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_MESSAGES,
    });
    const fresh = pending.filter(
      (entry) =>
        !recent.some((message) =>
          (message.blocks as MessageBlock[]).some(
            (candidate) =>
              matchesAppConnection(candidate, entry.connectorId, entry.slug) &&
              candidate.status === "pending",
          ),
        ),
    );
    if (fresh.length === 0) return null;
    const blocks: AppConnectBlock[] = fresh.map((entry) => appConnectCard(entry));
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
  const already =
    connectedNames.length > 0
      ? `${connectedNames.join(" and ")} ${connectedNames.length === 1 ? "is" : "are"} already connected. `
      : "";
  return {
    status: "pending",
    message: committed
      ? `${already}${pending.length === 1 ? "Connection card shown. Wait for the user to connect the app." : "Connection cards shown. Wait for the user to connect the apps."}`
      : "Connection card already shown. Wait for the user to connect the app.",
  };
}
