import type { JobPublisher, ProductAnalytics } from "@rakazo/adapter-kit";
import { supportForwardJob } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { Prisma, PrismaClient, ThreadEvents } from "@rakazo/db";
import { appendEventInTransaction, createThreadMessageInTransaction } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { buildUserMessageBlocks, resolveSendAttachments } from "./artifacts.js";

/** Stores the user's message and hands it to Chatwoot. No model run is created. */
export async function forwardSupportSend(
  deps: {
    prisma: PrismaClient;
    events: ThreadEvents;
    jobs: JobPublisher;
    analytics?: ProductAnalytics;
    maxAttachmentsPerMessage?: number;
  },
  actor: Actor,
  target: { threadId: string; botId: string },
  input: { text?: string; artifactIds?: string[]; clientNonce?: string },
) {
  if (input.clientNonce) {
    const existing = await deps.prisma.message.findUnique({
      where: {
        threadId_clientNonce: { threadId: target.threadId, clientNonce: input.clientNonce },
      },
      select: { id: true, seq: true },
    });
    if (existing) {
      return { taskId: existing.id, runId: existing.id, seq: existing.seq, runIds: [] as string[] };
    }
  }
  const committed = await deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { blocks: attachmentBlocks } = await resolveSendAttachments(
      { prisma: tx, maxAttachmentsPerMessage: deps.maxAttachmentsPerMessage },
      actor,
      target.botId,
      input.artifactIds,
    );
    const blocks = buildUserMessageBlocks(input.text, attachmentBlocks);
    const message = await createThreadMessageInTransaction(tx, {
      threadId: target.threadId,
      role: "user",
      blocks,
      clientNonce: input.clientNonce,
    });
    const event = await appendEventInTransaction(tx, {
      spaceId: actor.spaceId,
      threadId: target.threadId,
      botId: target.botId,
      type: "thread.message.created",
      payload: { messageId: message.id, seq: message.seq, role: "user", blocks },
    });
    return { message, eventSeq: event.seq };
  });
  deps.analytics?.capture(
    actor.userId,
    { name: "message_sent", trigger: "user" },
    { id: committed.message.id, at: committed.message.createdAt },
  );
  await deps.events.notify(target.threadId, committed.eventSeq).catch((error) => {
    getLogger().error("support send realtime notification", error);
  });
  await deps.jobs.enqueue(supportForwardJob(committed.message.id)).catch((error) => {
    getLogger().error("support forward enqueue", error);
  });
  // The send contract requires a run id. This is the message id, not a model run.
  return {
    taskId: committed.message.id,
    runId: committed.message.id,
    seq: committed.message.seq,
    runIds: [] as string[],
  };
}
