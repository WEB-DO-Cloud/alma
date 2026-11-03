import { ORPCError } from "@orpc/server";
import type { TransactionalEmailProvider } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";

const EXCERPT_LIMIT = 500;

function alreadyReported(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function excerpt(blocks: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (parts.join("").length >= EXCERPT_LIMIT) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") parts.push(record.text);
    for (const child of Object.values(record)) {
      if (child !== record.text) walk(child);
    }
  };
  walk(blocks);
  return parts.join("\n").replace(/\s+/g, " ").trim().slice(0, EXCERPT_LIMIT);
}

/** Stores one report per user and assistant message, then emails the operator list once. */
export async function reportAssistantMessage(
  prisma: PrismaClient,
  actor: Actor,
  threadId: string,
  messageId: string,
  notify?: {
    email?: TransactionalEmailProvider;
    adminEmails?: readonly string[];
  },
): Promise<void> {
  const message = await prisma.message.findFirst({
    where: { id: messageId, threadId },
    select: { id: true, role: true, blocks: true },
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
  const recipients = notify?.adminEmails ?? [];
  if (!notify?.email || recipients.length === 0) return;
  const text = [
    "Someone reported an assistant response.",
    `Space: ${actor.spaceId}`,
    `Thread: ${threadId}`,
    `Message: ${message.id}`,
    "",
    excerpt(message.blocks) || "(no text)",
  ].join("\n");
  await Promise.all(
    recipients.map((to) =>
      notify.email!.send({ to, subject: "ALMA response report", text }).catch(() => undefined),
    ),
  );
}
