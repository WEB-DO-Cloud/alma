import { ORPCError } from "@orpc/server";
import type {
  Actor,
  DraftApprovalLogFilter,
  OrganizationSettings,
  ReviewDraftCreate,
} from "@rakazo/contracts";
import { collectTextLeaves } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import {
  approvedSourceText,
  approveReviewDraft,
  createReviewDraft,
  type DraftReviewDb,
  DraftReviewError,
  exportApprovedDraft,
  exportDraftApprovalLogCsv,
  getReviewDraft,
  isOrganizationAdmin,
  listDraftApprovalLog,
  listReviewDrafts,
  loadOrganizationSettings,
  openReviewDraft,
  organizationRoleForMember,
  rejectReviewDraft,
  saveReviewDraft,
  unapprovedDraftBlocksText,
} from "@rakazo/db";

function asDraftDb(prisma: PrismaClient): DraftReviewDb {
  return prisma as unknown as DraftReviewDb;
}

function fail(error: unknown): never {
  if (error instanceof DraftReviewError) {
    const code =
      error.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "TOO_EARLY" || error.code === "BAD_REQUEST"
            ? "BAD_REQUEST"
            : "CONFLICT";
    throw new ORPCError(code, { message: error.message });
  }
  throw error;
}

async function firm(prisma: PrismaClient, actor: Actor) {
  const membership = await organizationRoleForMember(prisma, actor);
  if (!membership) throw new ORPCError("FORBIDDEN");
  const loaded = await loadOrganizationSettings(prisma, membership.organizationId);
  return { membership, state: loaded.state };
}

function settingsFrom(state: Awaited<ReturnType<typeof firm>>["state"]): OrganizationSettings {
  return {
    legalName: state.legalName,
    tradeName: state.tradeName,
    rnc: state.rnc,
    addressLine: state.addressLine,
    cityProvince: state.cityProvince,
    phone: state.phone,
    email: state.email,
    website: state.website,
    bankName: state.bankName,
    bankAccount: state.bankAccount,
    invoiceFooter: state.invoiceFooter,
    accentColor: state.accentColor,
    minimumReviewSeconds: state.minimumReviewSeconds,
    logo: null,
    lawyers: state.lawyers
      .filter((lawyer) => lawyer.archivedAt === null)
      .map((lawyer) => ({
        id: lawyer.id,
        name: lawyer.name,
        cardNumber: lawyer.cardNumber,
        email: lawyer.email,
        mayApproveDrafts: lawyer.mayApproveDrafts,
      })),
  };
}

const context = (actor: Actor, firmContext: Awaited<ReturnType<typeof firm>>) => ({
  organizationId: firmContext.membership.organizationId,
  email: actor.email,
  lawyers: firmContext.state.lawyers,
  minimumReviewSeconds: firmContext.state.minimumReviewSeconds,
});

export async function listDraftsForActor(
  prisma: PrismaClient,
  actor: Actor,
  status?: "generated" | "in_review" | "approved" | "rejected",
) {
  const current = await firm(prisma, actor);
  return listReviewDrafts(asDraftDb(prisma), {
    organizationId: current.membership.organizationId,
    status,
  });
}

export async function getDraftForActor(prisma: PrismaClient, actor: Actor, draftId: string) {
  const current = await firm(prisma, actor);
  try {
    return await getReviewDraft(asDraftDb(prisma), { ...context(actor, current), draftId });
  } catch (error) {
    fail(error);
  }
}

export async function createDraftForActor(
  prisma: PrismaClient,
  actor: Actor,
  input: ReviewDraftCreate,
) {
  const current = await firm(prisma, actor);
  try {
    return await createReviewDraft(asDraftDb(prisma), {
      ...context(actor, current),
      spaceId: actor.spaceId,
      createdByUserId: actor.userId,
      ...input,
    });
  } catch (error) {
    fail(error);
  }
}

export async function openDraftForActor(prisma: PrismaClient, actor: Actor, draftId: string) {
  const current = await firm(prisma, actor);
  try {
    return await openReviewDraft(asDraftDb(prisma), {
      ...context(actor, current),
      draftId,
      userId: actor.userId,
    });
  } catch (error) {
    fail(error);
  }
}

export async function saveDraftForActor(
  prisma: PrismaClient,
  actor: Actor,
  input: { draftId: string; editedText: string },
) {
  const current = await firm(prisma, actor);
  try {
    return await saveReviewDraft(asDraftDb(prisma), { ...context(actor, current), ...input });
  } catch (error) {
    fail(error);
  }
}

export async function approveDraftForActor(
  prisma: PrismaClient,
  actor: Actor,
  input: { draftId: string; lawyerId: string; editedText: string; confirmation: true },
) {
  const current = await firm(prisma, actor);
  try {
    return await approveReviewDraft(asDraftDb(prisma), {
      ...context(actor, current),
      ...input,
      userId: actor.userId,
    });
  } catch (error) {
    fail(error);
  }
}

export async function rejectDraftForActor(
  prisma: PrismaClient,
  actor: Actor,
  input: { draftId: string; lawyerId: string; editedText: string },
) {
  const current = await firm(prisma, actor);
  try {
    return await rejectReviewDraft(asDraftDb(prisma), {
      ...context(actor, current),
      ...input,
      userId: actor.userId,
    });
  } catch (error) {
    fail(error);
  }
}

export async function exportDraftForActor(prisma: PrismaClient, actor: Actor, draftId: string) {
  const current = await firm(prisma, actor);
  try {
    return await exportApprovedDraft(asDraftDb(prisma), {
      organizationId: current.membership.organizationId,
      draftId,
      settings: settingsFrom(current.state),
    });
  } catch (error) {
    fail(error);
  }
}

export async function copySourceForActor(
  prisma: PrismaClient,
  actor: Actor,
  input: { messageId?: string; artifactId?: string },
) {
  const texts: string[] = [];
  if (input.messageId) {
    const message = await prisma.message.findFirst({
      where: { id: input.messageId, thread: { spaceId: actor.spaceId } },
      select: { blocks: true },
    });
    texts.push(...collectTextLeaves(message?.blocks ?? null));
  }
  const blocked = await unapprovedDraftBlocksText(prisma, {
    spaceId: actor.spaceId,
    texts,
    messageIds: input.messageId ? [input.messageId] : [],
    artifactIds: input.artifactId ? [input.artifactId] : [],
  });
  if (blocked) {
    throw new ORPCError("FORBIDDEN", {
      message: "This draft has not been approved by a named lawyer.",
    });
  }
  return { text: await approvedSourceText(prisma, { spaceId: actor.spaceId, ...input }) };
}

async function requireAdmin(prisma: PrismaClient, actor: Actor) {
  const current = await firm(prisma, actor);
  if (!isOrganizationAdmin(current.membership.role)) throw new ORPCError("FORBIDDEN");
  return current;
}

export async function listApprovalLogForActor(
  prisma: PrismaClient,
  actor: Actor,
  filter: DraftApprovalLogFilter,
) {
  const current = await requireAdmin(prisma, actor);
  return listDraftApprovalLog(asDraftDb(prisma), {
    organizationId: current.membership.organizationId,
    ...filter,
  });
}

export async function exportApprovalLogForActor(
  prisma: PrismaClient,
  actor: Actor,
  filter: DraftApprovalLogFilter,
) {
  const current = await requireAdmin(prisma, actor);
  return {
    csv: await exportDraftApprovalLogCsv(asDraftDb(prisma), {
      organizationId: current.membership.organizationId,
      ...filter,
    }),
  };
}
