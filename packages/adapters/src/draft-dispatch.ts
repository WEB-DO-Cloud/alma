import type { TransactionalEmailProvider } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";

/** Sends one approved email draft through the same mail provider bots already use. */
export async function sendApprovedEmailDraft(
  deps: {
    prisma: PrismaClient;
    email: TransactionalEmailProvider | null;
    domain: string | undefined;
  },
  draft: {
    channel: string;
    recipient: string;
    body: string;
    spaceId: string;
    createdByUserId: string;
  },
): Promise<"sent" | "failed" | "unknown"> {
  if (draft.channel !== "email") return "unknown";
  if (!deps.email || !deps.domain) return "failed";
  const bots = await deps.prisma.bot.findMany({
    where: { spaceId: draft.spaceId, userId: draft.createdByUserId },
    select: { id: true, name: true },
  });
  const address = await deps.prisma.botEmailAddress.findFirst({
    where: { botId: { in: bots.map((bot) => bot.id) } },
    select: { name: true, botId: true },
  });
  const bot = bots.find((item) => item.id === address?.botId);
  if (!address || !bot) return "failed";
  const from = `${address.name}@${deps.domain}`;
  const subject = draft.body.split(/\r?\n/, 1)[0]?.trim().slice(0, 80) || "Message";
  await deps.email.send({
    from: `"${bot.name.replace(/["\\\r\n]/g, "")}" <${from}>`,
    replyTo: from,
    to: draft.recipient,
    subject,
    text: draft.body,
  });
  return "sent";
}
