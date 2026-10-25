import * as z from "zod";
import { Id } from "./ids.js";

export const DRAFT_TEXT_MAX = 200_000;

export const DraftStatusSchema = z.enum(["generated", "in_review", "approved", "rejected"]);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const DraftDiffSpanSchema = z.object({
  type: z.enum(["equal", "insert", "delete"]),
  text: z.string(),
});
export type DraftDiffSpan = z.infer<typeof DraftDiffSpanSchema>;

export const ReviewDraftSummarySchema = z.object({
  id: Id,
  title: z.string(),
  status: DraftStatusSchema,
  model: z.string(),
  modelVersion: z.string(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
});
export type ReviewDraftSummary = z.infer<typeof ReviewDraftSummarySchema>;

export const ReviewDraftSchema = z.object({
  id: Id,
  title: z.string(),
  status: DraftStatusSchema,
  originalText: z.string(),
  editedText: z.string(),
  model: z.string(),
  modelVersion: z.string(),
  openedAt: z.string().nullable(),
  requiredReviewMs: z.number().int(),
  serverNow: z.string(),
  canApprove: z.boolean(),
  linkedLawyerId: z.string().nullable(),
  approverName: z.string().nullable(),
  cardNumber: z.string().nullable(),
  approvedAt: z.string().nullable(),
  diff: z.array(DraftDiffSpanSchema),
});
export type ReviewDraft = z.infer<typeof ReviewDraftSchema>;

export const ReviewDraftCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  originalText: z.string().min(1).max(DRAFT_TEXT_MAX),
  model: z.string().trim().min(1).max(200),
  modelVersion: z.string().trim().min(1).max(120),
  sourceMessageId: Id.optional(),
  sourceArtifactId: Id.optional(),
});
export type ReviewDraftCreate = z.infer<typeof ReviewDraftCreateSchema>;

export const ReviewDraftSaveSchema = z.object({
  draftId: Id,
  editedText: z.string().max(DRAFT_TEXT_MAX),
});

export const ReviewDraftApproveSchema = z.object({
  draftId: Id,
  lawyerId: Id,
  editedText: z.string().max(DRAFT_TEXT_MAX),
  confirmation: z.literal(true),
});

export const ReviewDraftRejectSchema = z.object({
  draftId: Id,
  lawyerId: Id,
  editedText: z.string().max(DRAFT_TEXT_MAX),
});

export const ReviewDraftExportSchema = z.object({
  filename: z.string(),
  html: z.string(),
  text: z.string(),
});

export const DraftCopySourceSchema = z
  .object({
    messageId: Id.optional(),
    artifactId: Id.optional(),
  })
  .refine((input) => Boolean(input.messageId || input.artifactId), {
    message: "Name the message or file to copy.",
  });

export const DraftCopySourceResultSchema = z.object({
  /** The approved final text when this message or file is a draft. Null when it is not one. */
  text: z.string().nullable(),
});

export const DraftApprovalLogEntrySchema = z.object({
  id: Id,
  draftId: Id,
  approverLawyerId: Id,
  approverName: z.string(),
  cardNumber: z.string(),
  userId: Id,
  openedAt: z.string(),
  approvedAt: z.string().nullable(),
  reviewDurationMs: z.number().int(),
  model: z.string(),
  modelVersion: z.string(),
  originalHash: z.string(),
  finalHash: z.string(),
  diff: z.array(DraftDiffSpanSchema),
  action: z.enum(["approved", "rejected"]),
  createdAt: z.string(),
});
export type DraftApprovalLogEntry = z.infer<typeof DraftApprovalLogEntrySchema>;

export const DraftApprovalLogFilterSchema = z.object({
  lawyerId: Id.optional(),
  draftId: Id.optional(),
  action: z.enum(["approved", "rejected"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type DraftApprovalLogFilter = z.infer<typeof DraftApprovalLogFilterSchema>;
