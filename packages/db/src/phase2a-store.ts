import type { WorkContextKind, WorkContextRole, WorkRecordKind } from "@rakazo/contracts";
import type { DraftStatus } from "@rakazo/core";
import {
  assertCanDraft,
  assertContextParent,
  assertGrant,
  assertRevoke,
  deliveryLabel,
  draftBodyHash,
  nextDraftState,
  Phase2aError,
  resolveRecordTitles,
} from "@rakazo/core";
import type { Prisma, PrismaClient } from "./client.js";
import { Prisma as PrismaNamespace } from "./client.js";
import { createRowId } from "./row-id.js";

export type Phase2aActor = {
  userId: string;
  spaceId: string;
  organizationId: string;
};

type Db = PrismaClient | Prisma.TransactionClient;

async function roleOn(
  prisma: Db,
  actor: Phase2aActor,
  contextId: string,
): Promise<{ role: WorkContextRole; kind: WorkContextKind }> {
  const row = await prisma.workContextRole.findFirst({
    where: { contextId, userId: actor.userId, spaceId: actor.spaceId },
  });
  if (!row) throw new Phase2aError("phase2a_missing");
  return { role: row.role as WorkContextRole, kind: row.kind as WorkContextKind };
}

export async function createWorkContext(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { kind: WorkContextKind; label: string; parentId?: string },
) {
  const parent = input.parentId
    ? await prisma.workContext.findFirst({
        where: { id: input.parentId, spaceId: actor.spaceId },
      })
    : null;
  if (input.parentId && !parent) throw new Phase2aError("phase2a_missing");
  assertContextParent({
    kind: input.kind,
    spaceId: actor.spaceId,
    parent: parent ? { kind: parent.kind as WorkContextKind, spaceId: parent.spaceId } : null,
  });
  const id = createRowId();
  await prisma.$transaction(async (tx) => {
    await tx.workContext.create({
      data: {
        id,
        organizationId: actor.organizationId,
        spaceId: actor.spaceId,
        ownerUserId: actor.userId,
        kind: input.kind,
        label: input.label,
        parentId: parent?.id ?? null,
      },
    });
    await tx.workContextRole.create({
      data: {
        contextId: id,
        userId: actor.userId,
        organizationId: actor.organizationId,
        spaceId: actor.spaceId,
        kind: input.kind,
        role: "owner",
        grantedByUserId: actor.userId,
      },
    });
  });
  return {
    id,
    kind: input.kind,
    label: input.label,
    parentId: parent?.id ?? null,
    role: "owner" as const,
  };
}

export async function listWorkContexts(prisma: PrismaClient, actor: Phase2aActor) {
  const contexts = await prisma.workContext.findMany({ orderBy: { createdAt: "asc" } });
  const roles = await prisma.workContextRole.findMany({
    where: { userId: actor.userId, spaceId: actor.spaceId },
  });
  const roleByContext = new Map(roles.map((row) => [row.contextId, row.role as WorkContextRole]));
  return contexts.flatMap((context) => {
    const role = roleByContext.get(context.id);
    if (!role) return [];
    return [
      {
        id: context.id,
        kind: context.kind as WorkContextKind,
        label: context.label,
        parentId: context.parentId,
        role,
      },
    ];
  });
}

export async function grantWorkRole(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { contextId: string; userId: string; role: WorkContextRole },
) {
  const mine = await roleOn(prisma, actor, input.contextId);
  assertGrant({ kind: mine.kind, actorRole: mine.role, role: input.role });
  const member = await prisma.spaceMember.findFirst({
    where: {
      spaceId: actor.spaceId,
      organizationId: actor.organizationId,
      userId: input.userId,
    },
  });
  if (!member) throw new Phase2aError("phase2a_not_member");
  await prisma.workContextRole.upsert({
    where: { contextId_userId: { contextId: input.contextId, userId: input.userId } },
    create: {
      contextId: input.contextId,
      userId: input.userId,
      organizationId: actor.organizationId,
      spaceId: actor.spaceId,
      kind: mine.kind,
      role: input.role,
      grantedByUserId: actor.userId,
    },
    update: { role: input.role, grantedByUserId: actor.userId },
  });
  return { ok: true as const };
}

export async function revokeWorkRole(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { contextId: string; userId: string },
) {
  const mine = await roleOn(prisma, actor, input.contextId);
  const target = await prisma.workContextRole.findFirst({
    where: { contextId: input.contextId, userId: input.userId },
  });
  if (!target) throw new Phase2aError("phase2a_missing");
  const owners = await prisma.workContextRole.count({
    where: { contextId: input.contextId, role: "owner" },
  });
  assertRevoke({
    actorRole: mine.role,
    targetRole: target.role as WorkContextRole,
    ownerCount: owners,
  });
  await prisma.workContextRole.delete({
    where: { contextId_userId: { contextId: input.contextId, userId: input.userId } },
  });
  return { ok: true as const };
}

export async function createWorkRecord(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { contextId: string; kind: WorkRecordKind; title: string; body?: string },
) {
  const mine = await roleOn(prisma, actor, input.contextId);
  assertCanDraft(mine.role);
  const id = createRowId();
  const row = await prisma.workRecord.create({
    data: {
      id,
      contextId: input.contextId,
      organizationId: actor.organizationId,
      spaceId: actor.spaceId,
      createdByUserId: actor.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
    },
  });
  return {
    id: row.id,
    contextId: row.contextId,
    kind: row.kind as WorkRecordKind,
    title: row.title,
    body: row.body,
  };
}

export async function listWorkRecords(
  prisma: PrismaClient,
  actor: Phase2aActor,
  contextId: string,
) {
  await roleOn(prisma, actor, contextId);
  const rows = await prisma.workRecord.findMany({
    where: { contextId, spaceId: actor.spaceId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    contextId: row.contextId,
    kind: row.kind as WorkRecordKind,
    title: row.title,
    body: row.body,
  }));
}

export async function resolveWorkRecord(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { contextId: string; title: string },
) {
  await roleOn(prisma, actor, input.contextId);
  const rows = await prisma.workRecord.findMany({
    where: { contextId: input.contextId, spaceId: actor.spaceId },
    select: { id: true, contextId: true, title: true },
  });
  const resolved = resolveRecordTitles(rows, input.contextId, input.title);
  if (resolved.status !== "one") return resolved;
  const record = await prisma.workRecord.findFirst({
    where: { id: resolved.id, contextId: input.contextId },
  });
  if (!record) return { status: "none" as const };
  return {
    status: "one" as const,
    record: {
      id: record.id,
      contextId: record.contextId,
      kind: record.kind as WorkRecordKind,
      title: record.title,
      body: record.body,
    },
  };
}

export async function createWorkLink(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { contextId: string; targetKind: "thread" | "artifact"; targetId: string },
) {
  const mine = await roleOn(prisma, actor, input.contextId);
  assertCanDraft(mine.role);
  if (input.targetKind === "thread") {
    const thread = await prisma.thread.findFirst({
      where: { id: input.targetId, spaceId: actor.spaceId },
    });
    if (!thread) throw new Phase2aError("phase2a_missing");
  } else {
    const artifact = await prisma.artifact.findFirst({
      where: { id: input.targetId, spaceId: actor.spaceId },
    });
    if (!artifact) throw new Phase2aError("phase2a_missing");
  }
  const existing = await prisma.workLink.findFirst({
    where: { targetKind: input.targetKind, targetId: input.targetId },
  });
  if (existing?.contextId === input.contextId) return { id: existing.id };
  try {
    const row = await prisma.workLink.create({
      data: {
        id: createRowId(),
        contextId: input.contextId,
        organizationId: actor.organizationId,
        spaceId: actor.spaceId,
        createdByUserId: actor.userId,
        targetKind: input.targetKind,
        targetId: input.targetId,
      },
    });
    return { id: row.id };
  } catch (error) {
    if (error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Phase2aError("phase2a_link_taken");
    }
    throw error;
  }
}

async function linkedAttachments(prisma: Db, contextId: string, attachmentIds: readonly string[]) {
  if (attachmentIds.length === 0) return;
  const links = await prisma.workLink.findMany({
    where: { contextId, targetKind: "artifact", targetId: { in: [...attachmentIds] } },
  });
  if (new Set(links.map((link) => link.targetId)).size !== new Set(attachmentIds).size) {
    throw new Phase2aError("phase2a_attachment");
  }
}

function presentDraft(row: {
  id: string;
  contextId: string;
  recipient: string;
  channel: string;
  body: string;
  attachmentIds: string[];
  status: string;
  dispatchAfter: Date | null;
}) {
  const status = row.status as DraftStatus;
  return {
    id: row.id,
    contextId: row.contextId,
    recipient: row.recipient,
    channel: row.channel as "whatsapp" | "email" | "other",
    body: row.body,
    attachmentIds: row.attachmentIds,
    status,
    label: deliveryLabel(status, row.dispatchAfter),
    dispatchAfter: row.dispatchAfter?.toISOString() ?? null,
  };
}

export async function listOutboundDrafts(
  prisma: PrismaClient,
  actor: Phase2aActor,
  contextId: string,
) {
  await roleOn(prisma, actor, contextId);
  const rows = await prisma.outboundDraft.findMany({
    where: { contextId, spaceId: actor.spaceId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(presentDraft);
}

export async function createOutboundDraft(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: {
    contextId: string;
    recipient: string;
    channel: "whatsapp" | "email" | "other";
    body: string;
    attachmentIds?: string[];
  },
) {
  const mine = await roleOn(prisma, actor, input.contextId);
  assertCanDraft(mine.role);
  const attachmentIds = input.attachmentIds ?? [];
  await linkedAttachments(prisma, input.contextId, attachmentIds);
  const bodyHash = draftBodyHash({ ...input, attachmentIds });
  const id = createRowId();
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.outboundDraft.create({
      data: {
        id,
        contextId: input.contextId,
        organizationId: actor.organizationId,
        spaceId: actor.spaceId,
        createdByUserId: actor.userId,
        creatorRole: mine.role,
        recipient: input.recipient,
        channel: input.channel,
        body: input.body,
        attachmentIds,
        bodyHash,
        actionClass: "message",
        status: "draft",
      },
    });
    await tx.workApprovalEvent.create({
      data: {
        id: createRowId(),
        draftId: id,
        contextId: input.contextId,
        organizationId: actor.organizationId,
        spaceId: actor.spaceId,
        actorUserId: actor.userId,
        action: "created",
        bodyHash,
      },
    });
    return created;
  });
  return presentDraft(row);
}

async function transitionDraft(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: {
    id: string;
    command: "edit" | "submit" | "approve" | "cancel";
    recipient?: string;
    channel?: "whatsapp" | "email" | "other";
    body?: string;
    attachmentIds?: string[];
    delaySeconds: number;
    now: Date;
  },
) {
  const current = await prisma.outboundDraft.findFirst({
    where: { id: input.id, spaceId: actor.spaceId },
  });
  if (!current) throw new Phase2aError("phase2a_missing");
  const mine = await roleOn(prisma, actor, current.contextId);
  const attachmentIds = input.attachmentIds ?? current.attachmentIds;
  if (input.command === "edit") await linkedAttachments(prisma, current.contextId, attachmentIds);
  const nextHash =
    input.command === "edit"
      ? draftBodyHash({
          recipient: input.recipient ?? current.recipient,
          channel: input.channel ?? current.channel,
          body: input.body ?? current.body,
          attachmentIds,
        })
      : current.bodyHash;
  const next = nextDraftState({
    status: current.status as DraftStatus,
    command: input.command,
    actorRole: mine.role,
    actorUserId: actor.userId,
    creatorRole: current.creatorRole as WorkContextRole,
    creatorUserId: current.createdByUserId,
    now: input.now,
    delaySeconds: input.delaySeconds,
  });
  const data: Prisma.OutboundDraftUncheckedUpdateManyInput = {
    status: next.status,
    bodyHash: nextHash,
  };
  if (input.command === "edit") {
    data.recipient = input.recipient ?? current.recipient;
    data.channel = input.channel ?? current.channel;
    data.body = input.body ?? current.body;
    data.attachmentIds = attachmentIds;
  }
  if (next.clearApproval || next.action === "invalidated") {
    data.approvedByUserId = null;
    data.approvedAt = null;
    data.approvedBodyHash = null;
    data.dispatchAfter = null;
  }
  if (next.action === "approved") {
    data.approvedByUserId = actor.userId;
    data.approvedAt = input.now;
    data.approvedBodyHash = current.bodyHash;
    data.dispatchAfter = next.dispatchAfter;
  }
  const updated = await prisma.outboundDraft.updateMany({
    where: { id: current.id, status: current.status, bodyHash: current.bodyHash },
    data,
  });
  if (updated.count !== 1) throw new Phase2aError("phase2a_stale_approval");
  await prisma.workApprovalEvent.create({
    data: {
      id: createRowId(),
      draftId: current.id,
      contextId: current.contextId,
      organizationId: actor.organizationId,
      spaceId: actor.spaceId,
      actorUserId: actor.userId,
      action: next.action,
      bodyHash: nextHash,
    },
  });
  const row = await prisma.outboundDraft.findFirst({ where: { id: current.id } });
  if (!row) throw new Phase2aError("phase2a_missing");
  return presentDraft(row);
}

export async function editOutboundDraft(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: {
    id: string;
    recipient: string;
    channel: "whatsapp" | "email" | "other";
    body: string;
    attachmentIds?: string[];
    now?: Date;
  },
) {
  return transitionDraft(prisma, actor, {
    ...input,
    command: "edit",
    delaySeconds: 0,
    now: input.now ?? new Date(),
  });
}

export async function submitOutboundDraft(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { id: string; now?: Date },
) {
  return transitionDraft(prisma, actor, {
    ...input,
    command: "submit",
    delaySeconds: 0,
    now: input.now ?? new Date(),
  });
}

export async function approveOutboundDraft(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { id: string; delaySeconds: number; now?: Date },
) {
  return transitionDraft(prisma, actor, {
    id: input.id,
    command: "approve",
    delaySeconds: input.delaySeconds,
    now: input.now ?? new Date(),
  });
}

export async function cancelOutboundDraft(
  prisma: PrismaClient,
  actor: Phase2aActor,
  input: { id: string; now?: Date },
) {
  return transitionDraft(prisma, actor, {
    ...input,
    command: "cancel",
    delaySeconds: 0,
    now: input.now ?? new Date(),
  });
}
