import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { provisionMessagingIdentity } from "./messaging.js";
import { asSystem, runAsSystem } from "./row-security.js";
import { backfillSupportBots, ensureSupportBot } from "./support-bot.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("support bot (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  const stamp = `support-${Date.now()}`;
  let owner: { userId: string; spaceId: string };
  let second: { userId: string; spaceId: string };

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    const signup = { signupsEnabled: undefined, signupAllowlist: undefined };
    owner = await runAsSystem("test fixture", () =>
      provisionMessagingIdentity(
        prisma,
        { provider: "sendblue", address: `+1555${stamp.slice(-6)}` },
        signup,
      ),
    );
    second = await runAsSystem("test fixture", () =>
      provisionMessagingIdentity(
        prisma,
        { provider: "sendblue", address: `+1556${stamp.slice(-6)}` },
        signup,
      ),
    );
  });

  afterAll(async () => {
    if (prisma) {
      const system = asSystem(prisma, "test fixture cleanup");
      const userIds = [owner?.userId, second?.userId].filter(Boolean);
      await system.supportLink.deleteMany({ where: { userId: { in: userIds } } });
      await system.organization.deleteMany({
        where: { id: { in: [owner?.spaceId, second?.spaceId].filter(Boolean) as string[] } },
      });
      await system.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await close?.();
  });

  it("creates one pinned support bot and a second call creates none", async () => {
    const first = await ensureSupportBot(prisma, { userId: owner.userId, spaceId: owner.spaceId });
    const again = await ensureSupportBot(prisma, { userId: owner.userId, spaceId: owner.spaceId });
    expect(first?.botId).toBeTruthy();
    expect(again).toEqual(first);
    const system = asSystem(prisma);
    const bot = await system.bot.findUniqueOrThrow({ where: { id: first!.botId } });
    expect(bot).toMatchObject({
      kind: "support",
      name: "Support",
      pinned: true,
      position: -1,
      computerId: null,
      instructions: "",
      dailyCheckIns: false,
      fleetManagement: false,
      notifyOnFinish: true,
    });
    expect(await system.bot.count({ where: { userId: owner.userId, kind: "support" } })).toBe(1);
  });

  it("dry-run counts users without a bot and a second run creates zero", async () => {
    const dry = await backfillSupportBots(prisma, {
      dryRun: true,
      userIds: [owner.userId, second.userId],
    });
    expect(dry.users).toBe(2);
    expect(dry.created).toBe(1);
    expect(dry.existing).toBe(1);
    const ran = await backfillSupportBots(prisma, { userIds: [owner.userId, second.userId] });
    expect(ran.created).toBe(1);
    const again = await backfillSupportBots(prisma, { userIds: [owner.userId, second.userId] });
    expect(again.created).toBe(0);
    expect(again.existing).toBe(2);
  });
});
