import type { BillingProvider } from "@rakazo/adapter-kit";
import { BillingEmulator } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { resolveByokMonthlyPriceCents } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { asSystem, billingAccountForOrganization, createDb } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBillingService } from "./billing.js";

const dbTests = process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe : describe.skip;

dbTests("launch promo on billing status", () => {
  const stamp = `${process.pid}-${Date.now()}`;
  const userId = `promo-owner-${stamp}`,
    organizationId = `promo-org-${stamp}`,
    spaceId = `promo-space-${stamp}`;
  const actor: Actor = {
    userId,
    spaceId,
    email: `promo-${stamp}@rakazo.test`,
    isDeploymentOwner: false,
  };
  const amounts: number[] = [];
  const emulator = new BillingEmulator({ modelCredits: true, namespace: `promo-${stamp}` });
  const provider: BillingProvider = Object.assign(emulator, {
    async promoOffer(amountCents: number) {
      amounts.push(amountCents);
      return { amountOffCents: 5000, months: 3 };
    },
  });
  let prisma: PrismaClient,
    db: ReturnType<typeof createDb>,
    service: ReturnType<typeof createBillingService>;

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL!);
    prisma = asSystem(db.prisma);
    const createdAt = new Date();
    await prisma.user.create({
      data: { id: userId, name: "Demo owner", email: actor.email, emailVerified: false },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Promo fixture", slug: organizationId, createdAt },
    });
    await prisma.space.create({
      data: { id: spaceId, organizationId, name: "Personal", isDefault: true },
    });
    await prisma.member.create({
      data: { id: `member-${stamp}`, organizationId, userId, role: "owner", createdAt },
    });
    service = createBillingService({ prisma, provider, webOrigin: "https://example.test" });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await db.prisma.$disconnect();
    await db.pool.end();
  });

  it("offers the discounted monthly price only while a trial is still available", async () => {
    const monthly = resolveByokMonthlyPriceCents();
    expect(monthly).not.toBeNull();
    await expect(service.status(actor)).resolves.toMatchObject({
      trialAvailable: true,
      byokPromo: { priceCents: monthly! - 5000, months: 3 },
    });
    expect(amounts).toEqual([monthly]);

    const { url } = await service.checkout(actor);
    expect(url).toContain("/byok/");
    const customer = (await billingAccountForOrganization(prisma, organizationId))!.customerId;
    emulator.completeByokCheckout(customer);
    await service.sync(customer);
    await expect(service.status(actor)).resolves.toMatchObject({
      trialAvailable: false,
      byokPromo: null,
    });
    expect(amounts).toEqual([monthly]);
  });
});
