import { buildMonthlyReport } from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { runAsSystem } from "./row-security.js";

function monthBounds(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

async function counts(
  prisma: PrismaClient,
  whereUser: { userId?: string },
  start: Date,
  end: Date,
) {
  const practice = await prisma.reportRunMark.findMany({
    where: { practice: true, ...(whereUser.userId ? { userId: whereUser.userId } : {}) },
    select: { runId: true },
  });
  const practiceIds = practice.map((row) => row.runId);
  const span = { gte: start, lt: end };
  const [tasksFinished, practiceTasks, draftsWritten, draftsApproved, emailsMarkedSent, reminders] =
    await Promise.all([
      prisma.run.count({
        where: {
          ...whereUser,
          status: "completed",
          trigger: "user",
          createdAt: span,
          ...(practiceIds.length ? { id: { notIn: practiceIds } } : {}),
        },
      }),
      prisma.run.count({
        where: {
          ...whereUser,
          status: "completed",
          createdAt: span,
          id: { in: practiceIds.length ? practiceIds : ["__none__"] },
        },
      }),
      prisma.outboundDraft.count({
        where: {
          ...(whereUser.userId ? { createdByUserId: whereUser.userId } : {}),
          createdAt: span,
        },
      }),
      prisma.outboundDraft.count({
        where: {
          ...(whereUser.userId ? { createdByUserId: whereUser.userId } : {}),
          approvedAt: span,
        },
      }),
      prisma.outboundDraft.count({
        where: {
          ...(whereUser.userId ? { createdByUserId: whereUser.userId } : {}),
          channel: "email",
          status: "sent",
          updatedAt: span,
        },
      }),
      prisma.run.count({
        where: {
          ...whereUser,
          status: "completed",
          trigger: "routine",
          createdAt: span,
          ...(practiceIds.length ? { id: { notIn: practiceIds } } : {}),
        },
      }),
    ]);
  return {
    tasksFinished,
    practiceTasks,
    draftsWritten,
    draftsApproved,
    emailsMarkedSent,
    reminders,
  };
}

export async function userMonthlyReport(prisma: PrismaClient, userId: string, month: string) {
  const bounds = monthBounds(month);
  if (!bounds) return null;
  return runAsSystem("monthly report", async () => {
    const totals = await counts(prisma, { userId }, bounds.start, bounds.end);
    const contexts = await prisma.workContext.findMany({
      where: { kind: "client", roles: { some: { userId } } },
      select: { id: true, label: true },
    });
    const clients = await Promise.all(
      contexts.map(async (context) => {
        const span = { gte: bounds.start, lt: bounds.end };
        const [draftsWritten, draftsApproved, emailsMarkedSent] = await Promise.all([
          prisma.outboundDraft.count({ where: { contextId: context.id, createdAt: span } }),
          prisma.outboundDraft.count({ where: { contextId: context.id, approvedAt: span } }),
          prisma.outboundDraft.count({
            where: { contextId: context.id, channel: "email", status: "sent", updatedAt: span },
          }),
        ]);
        return { label: context.label, draftsWritten, draftsApproved, emailsMarkedSent };
      }),
    );
    return buildMonthlyReport({ ...totals, clients });
  });
}

/** Totals only. No customer names. */
export async function adminMonthlyReport(prisma: PrismaClient, month: string) {
  const bounds = monthBounds(month);
  if (!bounds) return null;
  return runAsSystem("monthly report admin", async () => {
    const totals = await counts(prisma, {}, bounds.start, bounds.end);
    return buildMonthlyReport({ ...totals, clients: [] });
  });
}
