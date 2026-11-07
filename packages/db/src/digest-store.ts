import {
  buildDigest,
  dueDigestKinds,
  localParts,
  readDigestConfig,
  scheduleZone,
} from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { runAsSystem } from "./row-security.js";

export type DigestPush = {
  userId: string;
  kind: "daily" | "weekly";
  issueId: string;
  draftCount: number;
  reminderCount: number;
  email: boolean;
};

/** Inserts at most one issue per kind and local date. The loser of the unique key pushes nothing. */
export async function scanDigests(prisma: PrismaClient, now = new Date()): Promise<DigestPush[]> {
  if (!readDigestConfig().enabled) return [];
  return runAsSystem("digest scan", async () => {
    const subscriptions = await prisma.digestSubscription.findMany({ where: { enabled: true } });
    const pushes: DigestPush[] = [];
    for (const subscription of subscriptions) {
      const user = await prisma.user.findUnique({
        where: { id: subscription.userId },
        select: { timezone: true },
      });
      const zone = scheduleZone(user?.timezone);
      const local = localParts(now, zone);
      const existing = await prisma.digestIssue.findMany({
        where: { userId: subscription.userId, localDate: local.date },
        select: { kind: true },
      });
      const kinds = dueDigestKinds(
        subscription,
        local,
        existing.map((row) => (row.kind === "weekly" ? "weekly" : "daily")),
      );
      if (kinds.length === 0) continue;
      const member = await prisma.member.findMany({
        where: { userId: subscription.userId },
        select: { organizationId: true },
      });
      const spaces = await prisma.space.findMany({
        where: { organizationId: { in: member.map((row) => row.organizationId) } },
        select: { id: true },
      });
      const spaceIds = spaces.map((space) => space.id);
      const draftCount = await prisma.outboundDraft.count({
        where: { spaceId: { in: spaceIds }, status: { in: ["pending", "approved"] } },
      });
      const dayStart = new Date(`${local.date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const reminders = await prisma.routine.findMany({
        where: {
          userId: subscription.userId,
          spaceId: { in: spaceIds },
          active: true,
          nextRunAt: { gte: dayStart, lt: dayEnd },
        },
        select: { threadId: true, nextRunAt: true },
      });
      const built = buildDigest({
        draftCount,
        reminders: reminders.map((reminder) => ({
          threadId: reminder.threadId,
          nextRunAt: reminder.nextRunAt?.toISOString() ?? "",
        })),
      });
      if (built.empty) continue;
      for (const kind of kinds) {
        try {
          const issue = await prisma.digestIssue.create({
            data: {
              userId: subscription.userId,
              kind,
              localDate: local.date,
              draftCount: built.draftCount,
              reminderCount: built.reminderCount,
            },
          });
          pushes.push({
            userId: subscription.userId,
            kind,
            issueId: issue.id,
            draftCount: built.draftCount,
            reminderCount: built.reminderCount,
            email: subscription.email,
          });
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "P2002") throw error;
        }
      }
    }
    return pushes;
  });
}
