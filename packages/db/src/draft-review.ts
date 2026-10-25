import { randomUUID } from "node:crypto";
import type { OrganizationSettings } from "@rakazo/contracts";
import {
  type DraftDiffSpan,
  type DraftLawyerLink,
  type DraftStatus,
  diffDraftText,
  draftApprovalLogCsv,
  draftTextHash,
  lawyerMayApproveForUser,
  payloadCarriesUnapprovedDraft,
  renderApprovedDraftDocument,
  requiredReviewDurationMs,
  reviewTimeSatisfied,
  type UnapprovedDraftRef,
} from "@rakazo/core";

export class DraftReviewError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "TOO_EARLY" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "DraftReviewError";
  }
}

export interface ReviewDraftRow {
  id: string;
  organizationId: string;
  spaceId: string;
  createdByUserId: string;
  title: string;
  status: DraftStatus;
  originalText: string;
  editedText: string;
  originalHash: string;
  finalHash: string | null;
  model: string;
  modelVersion: string;
  sourceMessageId: string | null;
  sourceArtifactId: string | null;
  openedAt: Date | null;
  openedByUserId: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  approverLawyerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DraftApprovalLogRow {
  id: string;
  draftId: string;
  organizationId: string;
  action: "approved" | "rejected";
  approverLawyerId: string;
  approverName: string;
  cardNumber: string;
  userId: string;
  openedAt: Date;
  approvedAt: Date | null;
  reviewDurationMs: number;
  model: string;
  modelVersion: string;
  originalHash: string;
  finalHash: string;
  diff: DraftDiffSpan[];
  createdAt: Date;
}

export interface ReviewDraftView {
  id: string;
  title: string;
  status: DraftStatus;
  originalText: string;
  editedText: string;
  model: string;
  modelVersion: string;
  openedAt: string | null;
  requiredReviewMs: number;
  serverNow: string;
  canApprove: boolean;
  linkedLawyerId: string | null;
  approverName: string | null;
  cardNumber: string | null;
  approvedAt: string | null;
  diff: DraftDiffSpan[];
}

interface DraftQuery {
  where: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  select?: unknown;
}

export interface DraftReviewDb {
  reviewDraft: {
    findMany(args: DraftQuery): Promise<ReviewDraftRow[]>;
    findFirst(args: { where: Record<string, unknown> }): Promise<ReviewDraftRow | null>;
    create(args: { data: ReviewDraftRow }): Promise<ReviewDraftRow>;
    update(args: { where: { id: string }; data: Partial<ReviewDraftRow> }): Promise<ReviewDraftRow>;
  };
  draftApprovalLog: {
    create(args: {
      data: Omit<DraftApprovalLogRow, "diff"> & { diff: unknown };
    }): Promise<DraftApprovalLogRow>;
    findMany(args: DraftQuery): Promise<DraftApprovalLogRow[]>;
  };
  $transaction?<T>(fn: (tx: DraftReviewDb) => Promise<T>): Promise<T>;
}

const NOT_APPROVED = "This draft has not been approved by a named lawyer.";

function terminal(status: string): boolean {
  return status === "approved" || status === "rejected";
}

function linkedLawyers(lawyers: DraftLawyerLink[], email: string): DraftLawyerLink[] {
  return lawyers.filter((lawyer) => lawyerMayApproveForUser(lawyer, { email }));
}

function viewOf(
  row: ReviewDraftRow,
  input: {
    lawyers: DraftLawyerLink[];
    email: string;
    minimumReviewSeconds: number;
    now: Date;
    approver?: { name: string; cardNumber: string } | null;
  },
): ReviewDraftView {
  const linked = linkedLawyers(input.lawyers, input.email);
  const open = !terminal(row.status);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    originalText: row.originalText,
    editedText: row.editedText,
    model: row.model,
    modelVersion: row.modelVersion,
    openedAt: row.openedAt ? row.openedAt.toISOString() : null,
    requiredReviewMs: requiredReviewDurationMs(input.minimumReviewSeconds, row.originalText.length),
    serverNow: input.now.toISOString(),
    canApprove: open && linked.length > 0,
    linkedLawyerId: linked[0]?.id ?? null,
    approverName: input.approver?.name ?? null,
    cardNumber: input.approver?.cardNumber ?? null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    diff: diffDraftText(row.originalText, row.editedText),
  };
}

async function requireDraft(
  db: DraftReviewDb,
  organizationId: string,
  draftId: string,
): Promise<ReviewDraftRow> {
  const row = await db.reviewDraft.findFirst({ where: { id: draftId, organizationId } });
  if (!row) throw new DraftReviewError("NOT_FOUND", "That draft was not found.");
  return row;
}

function requireLawyer(
  lawyers: DraftLawyerLink[],
  email: string,
  lawyerId: string,
): DraftLawyerLink {
  const lawyer = linkedLawyers(lawyers, email).find((candidate) => candidate.id === lawyerId);
  if (!lawyer) {
    throw new DraftReviewError(
      "FORBIDDEN",
      "Only a signed-in lawyer who may approve drafts can do this.",
    );
  }
  return lawyer;
}

async function inTransaction<T>(
  db: DraftReviewDb,
  fn: (tx: DraftReviewDb) => Promise<T>,
): Promise<T> {
  if (db.$transaction) return db.$transaction(fn);
  return fn(db);
}

export async function createReviewDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    spaceId: string;
    createdByUserId: string;
    email: string;
    lawyers: DraftLawyerLink[];
    minimumReviewSeconds: number;
    title: string;
    originalText: string;
    model: string;
    modelVersion: string;
    sourceMessageId?: string;
    sourceArtifactId?: string;
    now?: Date;
    id?: string;
  },
): Promise<ReviewDraftView> {
  const now = input.now ?? new Date();
  const originalHash = await draftTextHash(input.originalText);
  const row = await db.reviewDraft.create({
    data: {
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      createdByUserId: input.createdByUserId,
      title: input.title,
      status: "generated",
      originalText: input.originalText,
      editedText: input.originalText,
      originalHash,
      finalHash: null,
      model: input.model,
      modelVersion: input.modelVersion,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceArtifactId: input.sourceArtifactId ?? null,
      openedAt: null,
      openedByUserId: null,
      approvedAt: null,
      rejectedAt: null,
      approverLawyerId: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return viewOf(row, { ...input, now, approver: null });
}

export async function listReviewDrafts(
  db: DraftReviewDb,
  input: { organizationId: string; status?: DraftStatus },
): Promise<
  Array<{
    id: string;
    title: string;
    status: DraftStatus;
    model: string;
    modelVersion: string;
    createdAt: string;
    approvedAt: string | null;
  }>
> {
  const rows = await db.reviewDraft.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    model: row.model,
    modelVersion: row.modelVersion,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
  }));
}

export async function getReviewDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    draftId: string;
    email: string;
    lawyers: DraftLawyerLink[];
    minimumReviewSeconds: number;
    now?: Date;
  },
): Promise<ReviewDraftView> {
  const now = input.now ?? new Date();
  const row = await requireDraft(db, input.organizationId, input.draftId);
  const approver = input.lawyers.find((lawyer) => lawyer.id === row.approverLawyerId) ?? null;
  return viewOf(row, { ...input, now, approver });
}

export async function openReviewDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    draftId: string;
    userId: string;
    email: string;
    lawyers: DraftLawyerLink[];
    minimumReviewSeconds: number;
    now?: Date;
  },
): Promise<ReviewDraftView> {
  const now = input.now ?? new Date();
  requireLawyer(input.lawyers, input.email, linkedLawyers(input.lawyers, input.email)[0]?.id ?? "");
  const current = await requireDraft(db, input.organizationId, input.draftId);
  if (!current.openedAt && !terminal(current.status)) {
    const row = await db.reviewDraft.update({
      where: { id: current.id },
      data: {
        status: "in_review",
        openedAt: now,
        openedByUserId: input.userId,
        updatedAt: now,
      },
    });
    return viewOf(row, { ...input, now, approver: null });
  }
  return viewOf(current, { ...input, now, approver: null });
}

export async function saveReviewDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    draftId: string;
    email: string;
    lawyers: DraftLawyerLink[];
    minimumReviewSeconds: number;
    editedText: string;
    now?: Date;
  },
): Promise<ReviewDraftView> {
  const now = input.now ?? new Date();
  if (linkedLawyers(input.lawyers, input.email).length === 0) {
    throw new DraftReviewError(
      "FORBIDDEN",
      "Only a signed-in lawyer who may approve drafts can do this.",
    );
  }
  const current = await requireDraft(db, input.organizationId, input.draftId);
  if (terminal(current.status)) {
    throw new DraftReviewError("CONFLICT", "This review is already finished.");
  }
  const row = await db.reviewDraft.update({
    where: { id: current.id },
    data: { editedText: input.editedText, updatedAt: now },
  });
  if (row.originalText !== current.originalText) {
    throw new DraftReviewError("CONFLICT", "The original agent draft cannot be changed.");
  }
  return viewOf(row, { ...input, now, approver: null });
}

export async function approveReviewDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    draftId: string;
    userId: string;
    email: string;
    lawyerId: string;
    confirmation: boolean;
    editedText: string;
    lawyers: DraftLawyerLink[];
    minimumReviewSeconds: number;
    now?: Date;
  },
): Promise<ReviewDraftView> {
  if (input.confirmation !== true) {
    throw new DraftReviewError(
      "BAD_REQUEST",
      "Confirm that you reviewed this draft and accept professional responsibility for it.",
    );
  }
  const lawyer = requireLawyer(input.lawyers, input.email, input.lawyerId);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const current = await requireDraft(tx, input.organizationId, input.draftId);
    if (current.status !== "in_review" || !current.openedAt) {
      throw new DraftReviewError("CONFLICT", "Open the draft before approving it.");
    }
    const requiredMs = requiredReviewDurationMs(
      input.minimumReviewSeconds,
      current.originalText.length,
    );
    if (!reviewTimeSatisfied(current.openedAt, now, requiredMs)) {
      throw new DraftReviewError("TOO_EARLY", "The minimum review time has not elapsed.");
    }
    const finalHash = await draftTextHash(input.editedText);
    const diff = diffDraftText(current.originalText, input.editedText);
    const row = await tx.reviewDraft.update({
      where: { id: current.id },
      data: {
        status: "approved",
        editedText: input.editedText,
        finalHash,
        approvedAt: now,
        approverLawyerId: lawyer.id,
        updatedAt: now,
      },
    });
    if (row.originalText !== current.originalText || row.originalHash !== current.originalHash) {
      throw new DraftReviewError("CONFLICT", "The original agent draft cannot be changed.");
    }
    await tx.draftApprovalLog.create({
      data: {
        id: randomUUID(),
        draftId: current.id,
        organizationId: current.organizationId,
        action: "approved",
        approverLawyerId: lawyer.id,
        approverName: lawyer.name,
        cardNumber: lawyer.cardNumber,
        userId: input.userId,
        openedAt: current.openedAt,
        approvedAt: now,
        reviewDurationMs: now.getTime() - current.openedAt.getTime(),
        model: current.model,
        modelVersion: current.modelVersion,
        originalHash: current.originalHash,
        finalHash,
        diff,
        createdAt: now,
      },
    });
    return viewOf(row, { ...input, now, approver: lawyer });
  });
}

export async function rejectReviewDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    draftId: string;
    userId: string;
    email: string;
    lawyerId: string;
    editedText: string;
    lawyers: DraftLawyerLink[];
    minimumReviewSeconds: number;
    now?: Date;
  },
): Promise<ReviewDraftView> {
  const lawyer = requireLawyer(input.lawyers, input.email, input.lawyerId);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const current = await requireDraft(tx, input.organizationId, input.draftId);
    if (terminal(current.status)) {
      throw new DraftReviewError("CONFLICT", "This review is already finished.");
    }
    const openedAt = current.openedAt ?? now;
    const finalHash = await draftTextHash(input.editedText);
    const diff = diffDraftText(current.originalText, input.editedText);
    const row = await tx.reviewDraft.update({
      where: { id: current.id },
      data: {
        status: "rejected",
        editedText: input.editedText,
        finalHash,
        rejectedAt: now,
        approverLawyerId: lawyer.id,
        openedAt,
        openedByUserId: current.openedByUserId ?? input.userId,
        updatedAt: now,
      },
    });
    await tx.draftApprovalLog.create({
      data: {
        id: randomUUID(),
        draftId: current.id,
        organizationId: current.organizationId,
        action: "rejected",
        approverLawyerId: lawyer.id,
        approverName: lawyer.name,
        cardNumber: lawyer.cardNumber,
        userId: input.userId,
        openedAt,
        approvedAt: null,
        reviewDurationMs: now.getTime() - openedAt.getTime(),
        model: current.model,
        modelVersion: current.modelVersion,
        originalHash: current.originalHash,
        finalHash,
        diff,
        createdAt: now,
      },
    });
    return viewOf(row, { ...input, now, approver: lawyer });
  });
}

export async function exportApprovedDraft(
  db: DraftReviewDb,
  input: {
    organizationId: string;
    draftId: string;
    settings: OrganizationSettings;
    logoDataUrl?: string | null;
  },
): Promise<{ filename: string; html: string; text: string }> {
  const row = await requireDraft(db, input.organizationId, input.draftId);
  if (row.status !== "approved" || !row.approvedAt || !row.approverLawyerId) {
    throw new DraftReviewError("FORBIDDEN", NOT_APPROVED);
  }
  const logs = await db.draftApprovalLog.findMany({
    where: { draftId: row.id, organizationId: input.organizationId, action: "approved" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const log = logs[0];
  if (!log) throw new DraftReviewError("FORBIDDEN", NOT_APPROVED);
  const lawyer = {
    id: log.approverLawyerId,
    name: log.approverName,
    cardNumber: log.cardNumber,
    email: "approver@example.com",
    mayApproveDrafts: true,
  };
  const settings: OrganizationSettings = {
    ...input.settings,
    lawyers: [lawyer, ...input.settings.lawyers.filter((candidate) => candidate.id !== lawyer.id)],
  };
  const rendered = renderApprovedDraftDocument({
    settings,
    logoDataUrl: input.logoDataUrl,
    title: row.title,
    bodyText: row.editedText,
    lawyerId: lawyer.id,
    approvedAt: log.approvedAt ?? row.approvedAt,
  });
  const filename = `${row.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "borrador"}.html`;
  return { filename, ...rendered };
}

export interface DraftApprovalLogFilter {
  lawyerId?: string;
  draftId?: string;
  action?: "approved" | "rejected";
  from?: string;
  to?: string;
}

export async function listDraftApprovalLog(
  db: DraftReviewDb,
  input: { organizationId: string } & DraftApprovalLogFilter,
): Promise<
  Array<{
    id: string;
    draftId: string;
    approverLawyerId: string;
    approverName: string;
    cardNumber: string;
    userId: string;
    openedAt: string;
    approvedAt: string | null;
    reviewDurationMs: number;
    model: string;
    modelVersion: string;
    originalHash: string;
    finalHash: string;
    diff: DraftDiffSpan[];
    action: "approved" | "rejected";
    createdAt: string;
  }>
> {
  const createdAt =
    input.from || input.to
      ? {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        }
      : undefined;
  const rows = await db.draftApprovalLog.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.lawyerId ? { approverLawyerId: input.lawyerId } : {}),
      ...(input.draftId ? { draftId: input.draftId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((row) => ({
    id: row.id,
    draftId: row.draftId,
    approverLawyerId: row.approverLawyerId,
    approverName: row.approverName,
    cardNumber: row.cardNumber,
    userId: row.userId,
    openedAt: row.openedAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    reviewDurationMs: row.reviewDurationMs,
    model: row.model,
    modelVersion: row.modelVersion,
    originalHash: row.originalHash,
    finalHash: row.finalHash,
    diff: row.diff,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function exportDraftApprovalLogCsv(
  db: DraftReviewDb,
  input: { organizationId: string } & DraftApprovalLogFilter,
): Promise<string> {
  const rows = await listDraftApprovalLog(db, input);
  return draftApprovalLogCsv(rows);
}

type LooseDb = {
  reviewDraft?: { findMany?: (args: DraftQuery) => Promise<UnapprovedDraftRef[]> };
  space?: {
    findUnique?: (args: {
      where: { id: string };
      select?: { organizationId: boolean };
    }) => Promise<{ organizationId: string } | null>;
  };
};

/** True when this payload includes an agent draft that a lawyer has not approved. */
export async function unapprovedDraftBlocksText(
  prisma: object,
  input: { spaceId: string; texts: string[]; messageIds?: string[]; artifactIds?: string[] },
): Promise<boolean> {
  const db = prisma as LooseDb;
  if (typeof db.reviewDraft?.findMany !== "function") return false;
  if (typeof db.space?.findUnique !== "function") return false;
  const space = await db.space.findUnique({
    where: { id: input.spaceId },
    select: { organizationId: true },
  });
  if (!space) return false;
  const drafts = await db.reviewDraft.findMany({
    where: {
      organizationId: space.organizationId,
      status: { in: ["generated", "in_review"] },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      originalText: true,
      editedText: true,
      sourceMessageId: true,
      sourceArtifactId: true,
    },
  });
  return (
    payloadCarriesUnapprovedDraft(input.texts, drafts, {
      messageIds: input.messageIds,
      artifactIds: input.artifactIds,
    }) !== null
  );
}

export async function approvedSourceText(
  prisma: object,
  input: { spaceId: string; messageId?: string; artifactId?: string },
): Promise<string | null> {
  const db = prisma as LooseDb;
  if (!input.messageId && !input.artifactId) return null;
  if (typeof db.reviewDraft?.findMany !== "function") return null;
  if (typeof db.space?.findUnique !== "function") return null;
  const space = await db.space.findUnique({
    where: { id: input.spaceId },
    select: { organizationId: true },
  });
  if (!space) return null;
  const drafts = await db.reviewDraft.findMany({
    where: { organizationId: space.organizationId, status: "approved" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const match = drafts.find(
    (draft) =>
      (input.messageId && draft.sourceMessageId === input.messageId) ||
      (input.artifactId && draft.sourceArtifactId === input.artifactId),
  );
  return match?.editedText ?? null;
}
