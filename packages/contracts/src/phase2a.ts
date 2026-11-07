import * as z from "zod";
import { Id } from "./ids.js";

export const WORK_CONTEXT_KINDS = ["personal", "work", "client"] as const;
export const WORK_CONTEXT_ROLES = ["owner", "professional", "assistant", "reader"] as const;
export const WORK_RECORD_KINDS = ["contact", "matter", "note"] as const;
export const OUTBOUND_CHANNELS = ["whatsapp", "email", "other"] as const;
export const OUTBOUND_STATUSES = [
  "draft",
  "pending",
  "approved",
  "cancelled",
  "dispatching",
  "sent",
  "failed",
  "unknown",
] as const;
export const DELIVERY_LABELS = [
  "draft",
  "waiting",
  "sending",
  "sent",
  "failed",
  "unknown",
  "cancelled",
] as const;

export const WorkContextKindSchema = z.enum(WORK_CONTEXT_KINDS);
export const WorkContextRoleSchema = z.enum(WORK_CONTEXT_ROLES);
export type WorkContextKind = z.infer<typeof WorkContextKindSchema>;
export type WorkContextRole = z.infer<typeof WorkContextRoleSchema>;
export const WorkRecordKindSchema = z.enum(WORK_RECORD_KINDS);
export type WorkRecordKind = z.infer<typeof WorkRecordKindSchema>;
export const OutboundChannelSchema = z.enum(OUTBOUND_CHANNELS);
export const DeliveryLabelSchema = z.enum(DELIVERY_LABELS);

const label = z.string().trim().min(1).max(80);
const title = z.string().trim().min(1).max(160);
const recipient = z.string().trim().min(1).max(200);
const body = z.string().min(1).max(8000);
const attachmentIds = z.array(Id).max(8);

export const WorkContextSchema = z.object({
  id: Id,
  kind: WorkContextKindSchema,
  label,
  parentId: Id.nullable(),
  role: WorkContextRoleSchema,
});

export const WorkRecordSchema = z.object({
  id: Id,
  contextId: Id,
  kind: WorkRecordKindSchema,
  title,
  body: z.string().nullable(),
});

export const WorkRecordResolveSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("ambiguous"), ids: z.array(Id) }),
  z.object({ status: z.literal("one"), record: WorkRecordSchema }),
]);

export const OutboundDraftSchema = z.object({
  id: Id,
  contextId: Id,
  recipient,
  channel: OutboundChannelSchema,
  body,
  attachmentIds,
  status: z.enum(OUTBOUND_STATUSES),
  label: DeliveryLabelSchema,
  dispatchAfter: z.string().nullable(),
  createdByUserId: Id,
  creatorRole: WorkContextRoleSchema,
});

export type WorkContext = z.infer<typeof WorkContextSchema>;
export type OutboundDraft = z.infer<typeof OutboundDraftSchema>;

export const WorkContextCreateSchema = z.object({
  kind: WorkContextKindSchema,
  label,
  parentId: Id.optional(),
});

export const WorkContextGrantSchema = z.object({
  contextId: Id,
  userId: Id,
  role: WorkContextRoleSchema,
});

export const WorkRecordCreateSchema = z.object({
  contextId: Id,
  kind: WorkRecordKindSchema,
  title,
  body: z.string().max(8000).optional(),
});

export const WorkRecordResolveInputSchema = z.object({
  contextId: Id,
  title,
});

export const WorkLinkCreateSchema = z.object({
  contextId: Id,
  targetKind: z.enum(["thread", "artifact"]),
  targetId: Id,
});

export const OutboundDraftCreateSchema = z.object({
  contextId: Id,
  recipient,
  channel: OutboundChannelSchema,
  body,
  attachmentIds: attachmentIds.optional(),
});

export const OutboundDraftEditSchema = OutboundDraftCreateSchema.extend({ id: Id }).omit({
  contextId: true,
});
