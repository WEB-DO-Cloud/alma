import type { Prisma, PrismaClient } from "./client.js";
import { runAsSystem } from "./row-security.js";

export type StoredNotifyPolicy = {
  timezone: string | null;
  locale: string | null;
  channel: "push" | "in_app" | "both";
  quietStartMinute: number | null;
  quietEndMinute: number | null;
};

function channelOf(value: string | undefined): StoredNotifyPolicy["channel"] {
  if (value === "push" || value === "in_app" || value === "both") return value;
  return "both";
}

export async function loadNotifyPolicy(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<StoredNotifyPolicy> {
  const [user, policy] = await runAsSystem("notify-policy read", () =>
    Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, locale: true } }),
      prisma.userNotificationPolicy.findUnique({ where: { userId } }),
    ]),
  );
  return {
    timezone: user?.timezone ?? null,
    locale: user?.locale ?? null,
    channel: channelOf(policy?.channel),
    quietStartMinute: policy?.quietStartMinute ?? null,
    quietEndMinute: policy?.quietEndMinute ?? null,
  };
}

export async function saveNotifyPolicy(
  prisma: PrismaClient,
  userId: string,
  input: {
    channel: "push" | "in_app" | "both";
    quietStartMinute: number | null;
    quietEndMinute: number | null;
  },
): Promise<void> {
  await runAsSystem("notify-policy save", () =>
    prisma.userNotificationPolicy.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    }),
  );
}

/** Inserts the one unsent row. A duplicate loses and writes nothing. */
export async function holdRoutinePush(prisma: PrismaClient, userId: string): Promise<void> {
  await runAsSystem("notify-policy hold", async () => {
    const existing = await prisma.notificationBatch.findFirst({
      where: { userId, sentAt: null },
      select: { id: true },
    });
    if (existing) return;
    try {
      await prisma.notificationBatch.create({ data: { userId, kind: "routine" } });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error;
    }
  });
}
