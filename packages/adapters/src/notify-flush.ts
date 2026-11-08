import type { AdapterContext, NotificationMessage } from "@rakazo/adapter-kit";
import { claimableBatchIds, readNotifyPolicyConfig } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { runAsSystem } from "@rakazo/db";
import type { ExpoPushDelivery } from "./expo-push.js";

const LEASE_MS = 5 * 60_000;

/** Sends one redacted push per user who has a held row, then marks it sent. */
export async function flushNotificationBatches(
  prisma: PrismaClient,
  notifications: {
    deliver(message: NotificationMessage, context: AdapterContext): Promise<ExpoPushDelivery>;
  },
  contextFor: (userId: string) => AdapterContext,
): Promise<void> {
  if (!readNotifyPolicyConfig().enabled) return;
  await runAsSystem("notify-policy flush", async () => {
    const rows = await prisma.notificationBatch.findMany({ where: { sentAt: null } });
    const now = new Date();
    for (const id of claimableBatchIds(rows, now)) {
      const claimed = await prisma.notificationBatch.updateMany({
        where: {
          id,
          sentAt: null,
          OR: [{ flushingAt: null }, { flushingAt: { lt: new Date(now.getTime() - LEASE_MS) } }],
        },
        data: { flushingAt: now },
      });
      if (claimed.count !== 1) continue;
      const row = rows.find((item) => item.id === id);
      if (!row) continue;
      const result = await notifications.deliver(
        {
          kind: "completion",
          title: "ALMA",
          body: "Updates",
          botId: "notify",
          threadId: "notify",
        },
        contextFor(row.userId),
      );
      await prisma.notificationBatch.update({
        where: { id },
        data: result === "delivered" ? { sentAt: new Date() } : { flushingAt: null },
      });
    }
  });
}
