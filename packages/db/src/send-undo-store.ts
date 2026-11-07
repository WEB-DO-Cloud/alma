import type { UndoSeconds } from "@rakazo/core";
import { draftFromToolArgs, undoSeconds } from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { createOutboundDraft } from "./phase2a-store.js";

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
