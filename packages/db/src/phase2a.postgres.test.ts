import { Phase2aError } from "@rakazo/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import type { Phase2aActor } from "./phase2a-store.js";
import {
  approveOutboundDraft,
  createOutboundDraft,
  createWorkContext,
  createWorkLink,
  createWorkRecord,
  editOutboundDraft,
  listWorkContexts,
  listWorkRecords,
  submitOutboundDraft,
} from "./phase2a-store.js";
import { runAsSystem, runAsTenant } from "./row-security.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl && migrationUrl && databaseUrl !== migrationUrl
    ? describe.sequential
    : describe.skip;

describePostgres("phase 2A context isolation", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `p2a-org-${suffix}`;
  const spaceId = `p2a-space-${suffix}`;
  const userA = `p2a-a-${suffix}`;
  const userB = `p2a-b-${suffix}`;
  const botId = `p2a-bot-${suffix}`;
  const threadId = `p2a-thread-${suffix}`;
  let prisma: PrismaClient;
  let pool: ReturnType<typeof createDb>["pool"];
  const actor = (userId: string): Phase2aActor => ({ userId, spaceId, organizationId });

  beforeAll(async () => {
    const db = createDb(databaseUrl!, { encryptContent: false });
    prisma = db.prisma;
    pool = db.pool;
    await runAsSystem("phase 2a fixture", async () => {
      await prisma.user.createMany({
        data: [
          { id: userA, name: "Ada", email: `${userA}@example.test`, emailVerified: true },
          { id: userB, name: "Bea", email: `${userB}@example.test`, emailVerified: true },
        ],
      });
      await prisma.organization.create({
        data: { id: organizationId, name: "Office", slug: organizationId, createdAt: new Date() },
      });
      await prisma.space.create({ data: { id: spaceId, organizationId, name: "Office" } });
      await prisma.bot.create({
        data: { id: botId, spaceId, userId: userA, name: "Ada", color: "ink" },
      });
      await prisma.thread.create({ data: { id: threadId, spaceId, userId: userA, botId } });
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await runAsSystem("phase 2a cleanup", async () => {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    });
    await prisma.$disconnect();
    await pool?.end();
  });

  it("hides a personal context and a client record from the other person", async () => {
    const personal = await runAsTenant({ spaceId, userId: userA }, () =>
      createWorkContext(prisma, actor(userA), { kind: "personal", label: "Home" }),
    );
    const work = await runAsTenant({ spaceId, userId: userA }, () =>
      createWorkContext(prisma, actor(userA), { kind: "work", label: "Office" }),
    );
    const client = await runAsTenant({ spaceId, userId: userA }, () =>
      createWorkContext(prisma, actor(userA), {
        kind: "client",
        label: "Ada",
        parentId: work.id,
      }),
    );
    await runAsTenant({ spaceId, userId: userA }, () =>
      createWorkRecord(prisma, actor(userA), {
        contextId: client.id,
        kind: "matter",
        title: "Lease",
        body: "Draft only",
      }),
    );

    const seenByB = await runAsTenant({ spaceId, userId: userB }, () =>
      prisma.workContext.findMany({ where: { id: { in: [personal.id, work.id, client.id] } } }),
    );
    expect(seenByB).toEqual([]);
    await expect(
      runAsTenant({ spaceId, userId: userB }, () =>
        listWorkRecords(prisma, actor(userB), client.id),
      ),
    ).rejects.toThrow(Phase2aError);
    expect(
      await runAsTenant({ spaceId, userId: userB }, () => listWorkContexts(prisma, actor(userB))),
    ).toEqual([]);

    const link = await runAsTenant({ spaceId, userId: userA }, () =>
      createWorkLink(prisma, actor(userA), {
        contextId: client.id,
        targetKind: "thread",
        targetId: threadId,
      }),
    );
    expect(link.id).toBeTruthy();
    await expect(
      runAsTenant({ spaceId, userId: userA }, () =>
        createWorkLink(prisma, actor(userA), {
          contextId: work.id,
          targetKind: "thread",
          targetId: threadId,
        }),
      ),
    ).rejects.toThrow("phase2a_link_taken");
  });

  it("keeps an approved draft waiting and invalidates the approval on edit", async () => {
    const work = await runAsTenant({ spaceId, userId: userA }, () =>
      createWorkContext(prisma, actor(userA), { kind: "work", label: "Desk" }),
    );
    const draft = await runAsTenant({ spaceId, userId: userA }, () =>
      createOutboundDraft(prisma, actor(userA), {
        contextId: work.id,
        recipient: "ada@example.test",
        channel: "email",
        body: "Hola",
      }),
    );
    const approved = await runAsTenant({ spaceId, userId: userA }, async () => {
      await submitOutboundDraft(prisma, actor(userA), { id: draft.id });
      return approveOutboundDraft(prisma, actor(userA), {
        id: draft.id,
        delaySeconds: 30,
        now: new Date("2026-11-07T12:00:00.000Z"),
      });
    });
    expect(approved.status).toBe("approved");
    expect(approved.label).toBe("waiting");
    const edited = await runAsTenant({ spaceId, userId: userA }, () =>
      editOutboundDraft(prisma, actor(userA), {
        id: draft.id,
        recipient: "ada@example.test",
        channel: "email",
        body: "Hola de nuevo",
      }),
    );
    expect(edited.status).toBe("draft");
    expect(edited.label).toBe("draft");
  });
});
