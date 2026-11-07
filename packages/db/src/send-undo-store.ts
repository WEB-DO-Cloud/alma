import type { DueDraft, UndoSeconds } from "@rakazo/core";
import {
  draftFromToolArgs,
  readUndoDispatchConfig,
  runDraftDispatch,
  undoSeconds,
} from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { createOutboundDraft } from "./phase2a-store.js";
import { runAsSystem } from "./row-security.js";

export async function undoSecondsFor(prisma: PrismaClient, userId: string): Promise<UndoSeconds> {
  const row = await prisma.sendUndoSetting.findUnique({ where: { userId } });
  return undoSeconds(row?.seconds);
}

export async function saveUndoSeconds(
  prisma: PrismaClient,
  userId: string,
  seconds: UndoSeconds,
): Promise<void> {
  await prisma.sendUndoSetting.upsert({
    where: { userId },
    create: { userId, seconds },
    update: { seconds },
  });
}

/** Stores a draft when the user has a personal context. Never calls a provider. */
export async function holdExternalSend(
  prisma: PrismaClient,
  input: { userId: string; spaceId: string; toolName: string; args: Record<string, unknown> },
): Promise<string | null> {
  const payload = draftFromToolArgs(input.toolName, input.args);
  if (!payload) return null;
  const space = await prisma.space.findFirst({
    where: { id: input.spaceId },
    select: { organizationId: true },
  });
  if (!space) return null;
  const context = await prisma.workContext.findFirst({
    where: { spaceId: input.spaceId, kind: "personal", ownerUserId: input.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!context) return null;
  const draft = await createOutboundDraft(
    prisma,
    { userId: input.userId, spaceId: input.spaceId, organizationId: space.organizationId },
    {
      contextId: context.id,
      recipient: payload.recipient,
      channel: payload.channel,
      body: payload.body,
    },
  );
  return draft.id;
}

async function claimDueDraft(prisma: PrismaClient, draft: DueDraft, now: Date): Promise<boolean> {
  const claimed = await prisma.outboundDraft.updateMany({
    where: {
      id: draft.id,
      status: "approved",
      bodyHash: draft.bodyHash,
      approvedBodyHash: draft.bodyHash,
      dispatchAfter: { lte: now },
    },
    data: { status: "dispatching" },
  });
  return claimed.count === 1;
}

/** Claims due approved drafts and hands each one to the existing sender once. */
export async function dispatchDueDrafts(
  prisma: PrismaClient,
  send: (draft: {
    id: string;
    channel: string;
    recipient: string;
    body: string;
    spaceId: string;
    createdByUserId: string;
  }) => Promise<"sent" | "failed" | "unknown">,
  now = new Date(),
): Promise<number> {
  const config = readUndoDispatchConfig();
  return runAsSystem("undo dispatch", () =>
    runDraftDispatch({
      enabled: config.enabled,
      now,
      list: async () => {
        const rows = await prisma.outboundDraft.findMany({
          where: { status: "approved", dispatchAfter: { lte: now } },
        });
        return rows.map((row) => ({
          id: row.id,
          status: row.status,
          dispatchAfter: row.dispatchAfter?.toISOString() ?? null,
          bodyHash: row.bodyHash,
          approvedBodyHash: row.approvedBodyHash,
          channel: row.channel,
          recipient: row.recipient,
          body: row.body,
          spaceId: row.spaceId,
          createdByUserId: row.createdByUserId,
        }));
      },
      claim: (draft) => claimDueDraft(prisma, draft, now),
      send: (draft) => {
        const row = draft as DueDraft & {
          channel: string;
          recipient: string;
          body: string;
          spaceId: string;
          createdByUserId: string;
        };
        return send(row);
      },
      finish: async (id, result) => {
        await prisma.outboundDraft.updateMany({
          where: { id, status: "dispatching" },
          data: { status: result },
        });
      },
    }),
  );
}
