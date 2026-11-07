import { BillingEmulator } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { admitUserRun, asSystem, createDb, spaceHasModelAccess } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBillingService } from "./billing.js";

const dbTests =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe.sequential : describe.skip;

const previousFlags = {
  ALMA_TRIAL_ENABLED: process.env.ALMA_TRIAL_ENABLED,
  ALMA_TRIAL_DAYS: process.env.ALMA_TRIAL_DAYS,
  ALMA_TRIAL_MESSAGE_CAP: process.env.ALMA_TRIAL_MESSAGE_CAP,
  ALMA_ONBOARDING_V2: process.env.ALMA_ONBOARDING_V2,
};

function restoreFlags() {
  for (const [key, value] of Object.entries(previousFlags)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

dbTests("no-card trial", () => {
  const stamp = `${process.pid}-${Date.now()}`;
  const userId = `alma-trial-owner-${stamp}`;
  const organizationId = `alma-trial-org-${stamp}`;
  const spaceId = `alma-trial-space-${stamp}`;
  const compUserId = `alma-comp-owner-${stamp}`;
  const compOrgId = `alma-comp-org-${stamp}`;
  const compSpaceId = `alma-comp-space-${stamp}`;
  const actor: Actor = {
    userId,
    spaceId,
    email: `alma-trial-${stamp}@rakazo.test`,
    isDeploymentOwner: false,
  };
  const compActor: Actor = {
    userId: compUserId,
    spaceId: compSpaceId,
    email: `alma-comp-${stamp}@rakazo.test`,
    isDeploymentOwner: false,
  };
  const provider = new BillingEmulator({ modelCredits: true, namespace: `alma-trial-${stamp}` });
  let prisma: PrismaClient;
  let db: ReturnType<typeof createDb>;
  let service: ReturnType<typeof createBillingService>;

  beforeAll(async () => {
    process.env.ALMA_TRIAL_ENABLED = "true";
    process.env.ALMA_TRIAL_DAYS = "14";
    process.env.ALMA_TRIAL_MESSAGE_CAP = "2";
    process.env.ALMA_ONBOARDING_V2 = "true";
    db = createDb(process.env.DATABASE_URL!);
    prisma = asSystem(db.prisma);
    const createdAt = new Date();
    await prisma.user.createMany({
      data: [
        { id: userId, name: "Trial owner", email: actor.email, emailVerified: false },
        { id: compUserId, name: "Comp owner", email: compActor.email, emailVerified: false },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Trial org", slug: organizationId, createdAt },
        { id: compOrgId, name: "Comp org", slug: compOrgId, createdAt },
      ],
    });
    await prisma.space.createMany({
      data: [
        { id: spaceId, organizationId, name: "Personal", isDefault: true },
        { id: compSpaceId, organizationId: compOrgId, name: "Personal", isDefault: true },
      ],
    });
    await prisma.member.createMany({
      data: [
        { id: `member-${stamp}`, organizationId, userId, role: "owner", createdAt },
        {
          id: `comp-member-${stamp}`,
          organizationId: compOrgId,
          userId: compUserId,
          role: "owner",
          createdAt,
        },
      ],
    });
    await prisma.modelCreditAccount.create({
      data: {
        organizationId: compOrgId,
        mode: "byok",
        byokFreeUntil: new Date(Date.now() + 86_400_000),
      },
    });
    service = createBillingService({ prisma, provider, webOrigin: "https://example.test" });
  });

  afterAll(async () => {
    restoreFlags();
    if (prisma) {
      await prisma.organization.deleteMany({ where: { id: { in: [organizationId, compOrgId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, compUserId] } } });
    }
    await db?.prisma.$disconnect();
    await db?.pool.end();
  });

  it("opens the assistant once, then stops at the message cap", async () => {
    const opened = await service.status(actor);
    expect(opened).toMatchObject({
      access: true,
      trialAvailable: false,
      planClarity: true,
      almaTrial: { messageCap: 2, messagesUsed: 0, messagesLeft: 2 },
    });
    expect(opened.almaTrial?.daysLeft).toBeGreaterThanOrEqual(14);
    expect(opened.almaTrial?.daysLeft).toBeLessThanOrEqual(15);
    await expect(service.status(actor)).resolves.toMatchObject({
      almaTrial: { messagesUsed: 0 },
    });
    expect(await prisma.almaTrial.count({ where: { organizationId } })).toBe(1);
    await expect(spaceHasModelAccess(prisma, spaceId)).resolves.toBe(true);

    const admit = (messageId: string) =>
      prisma.$transaction((tx) => admitUserRun(tx, { spaceId, userId, messageId }));
    await expect(admit("m1")).resolves.toBe("ok");
    await expect(admit("m2")).resolves.toBe("ok");
    await expect(admit("m3")).resolves.toBe("limit");
    await expect(spaceHasModelAccess(prisma, spaceId)).resolves.toBe(false);
    await expect(service.status(actor)).resolves.toMatchObject({
      access: false,
      almaTrial: { messagesUsed: 2, messagesLeft: 0 },
    });
  });

  it("does not add a card trial on top of the no-card trial", async () => {
    await service.selectFunding(actor, "byok", "mobile");
    const account = await prisma.billingAccount.findUniqueOrThrow({ where: { organizationId } });
    expect(provider.byokCheckouts.get(account.customerId)?.trialDays).toBeUndefined();
  });

  it("leaves a complimentary own-key period without a trial row", async () => {
    await expect(service.status(compActor)).resolves.toMatchObject({
      access: true,
      almaTrial: null,
    });
    expect(await prisma.almaTrial.count({ where: { organizationId: compOrgId } })).toBe(0);
    await expect(spaceHasModelAccess(prisma, compSpaceId)).resolves.toBe(true);
  });
});
