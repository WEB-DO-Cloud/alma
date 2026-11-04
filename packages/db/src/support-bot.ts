import type { PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";
import { runAsSystem } from "./row-security.js";

/** Stored bot name. Clients translate it; a rename is rejected. */
export const SUPPORT_BOT_STORED_NAME = "Support";

const BATCH = 100;

export async function ensureSupportBot(
  prisma: PrismaClient,
  input: { userId: string; spaceId?: string },
): Promise<{ userId: string; spaceId: string; botId: string } | null> {
  return runAsSystem("create the pinned support bot", async () => {
    const existing = await prisma.supportLink.findUnique({
      where: { userId: input.userId },
      select: { userId: true, spaceId: true, botId: true },
    });
    if (existing) return existing;

    const spaceId = await supportSpaceId(prisma, input.userId, input.spaceId);
    if (!spaceId) return null;
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user) return null;

    const already = await prisma.bot.findFirst({
      where: { userId: input.userId, kind: "support" },
      select: { id: true, spaceId: true },
    });
    const bot =
      already ??
      (await createRepos(prisma).createBot(
        {
          userId: input.userId,
          spaceId,
          email: user.email,
          isDeploymentOwner: false,
        },
        {
          name: SUPPORT_BOT_STORED_NAME,
          description: "",
          instructions: "",
          notifyOnFinish: true,
          dailyCheckIns: false,
          fleetManagement: false,
          kind: "support",
          pinned: true,
          position: -1,
          attachComputer: false,
          modelProvider: null,
          modelId: null,
          thinkingLevel: null,
        },
      ));

    try {
      await prisma.supportLink.create({
        data: { userId: input.userId, spaceId: bot.spaceId, botId: bot.id },
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
      return prisma.supportLink.findUnique({
        where: { userId: input.userId },
        select: { userId: true, spaceId: true, botId: true },
      });
    }
    return { userId: input.userId, spaceId: bot.spaceId, botId: bot.id };
  });
}

/**
 * Creates the support bot for users who do not have one. Safe to rerun.
 * `userIds` limits the pass to an allowlist. Dry-run counts without writing.
 */
export async function backfillSupportBots(
  prisma: PrismaClient,
  options: { dryRun?: boolean; userIds?: readonly string[] } = {},
): Promise<{ users: number; created: number; existing: number }> {
  let users = 0;
  let created = 0;
  let existing = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await runAsSystem("list users for the support bot backfill", () =>
      prisma.user.findMany({
        ...(options.userIds ? { where: { id: { in: [...options.userIds] } } } : {}),
        take: BATCH,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true },
      }),
    );
    if (page.length === 0) break;
    for (const user of page) {
      users += 1;
      const before = await runAsSystem("read a support link before backfill", () =>
        prisma.supportLink.findUnique({
          where: { userId: user.id },
          select: { userId: true },
        }),
      );
      if (options.dryRun) {
        if (before) existing += 1;
        else created += 1;
        continue;
      }
      const link = await ensureSupportBot(prisma, { userId: user.id });
      if (!before && link) created += 1;
      else existing += 1;
    }
    const last = page.at(-1);
    if (!last || page.length < BATCH) break;
    cursor = last.id;
  }
  return { users, created, existing };
}

/** Personal space when the user has one, otherwise the space they joined first. */
async function supportSpaceId(
  prisma: PrismaClient,
  userId: string,
  preferred?: string,
): Promise<string | null> {
  const memberships = await prisma.spaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { spaceId: true, space: { select: { isDefault: true } } },
  });
  const personal = memberships.find((row) => row.space.isDefault);
  if (personal) return personal.spaceId;
  if (preferred && memberships.some((row) => row.spaceId === preferred)) return preferred;
  return memberships[0]?.spaceId ?? null;
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
