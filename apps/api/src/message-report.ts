import { ORPCError } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";

function alreadyReported(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

/** Stores one report per user and assistant message. A repeat report stays stored and succeeds. */
export async function reportAssistantMessage(
  prisma: PrismaClient,
  actor: Actor,
  threadId: string,
  messageId: string,
): Promise<void> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, threadId },
    select: { id: true, role: true },
  });
  if (!message) throw new IsolationError();
  if (message.role !== "bot") {
    throw new ORPCError("BAD_REQUEST", { message: "Only an assistant response can be reported." });
  }
  try {
    await prisma.messageReport.create({
      data: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        threadId,
        messageId: message.id,
      },
    });
  } catch (error) {
    if (alreadyReported(error)) return;
    throw error;
  }
}
