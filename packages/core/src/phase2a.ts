import { createHash } from "node:crypto";
import type { WorkContextKind, WorkContextRole } from "@rakazo/contracts";
import { connectorToolRequiresApproval } from "./action-approval.js";

/** Phase 2A switches. Off unless the value is exactly `true`. */
export type Phase2aConfig = {
  enabled: boolean;
  /** Used only when `enabled` is on. */
  dispatchDelaySeconds: number;
};

const DEFAULT_DISPATCH_DELAY_SECONDS = 30;

export function readPhase2aConfig(source: NodeJS.ProcessEnv = process.env): Phase2aConfig {
  const enabled = source.ALMA_PHASE2A === "true";
  return {
    enabled,
    dispatchDelaySeconds: enabled
      ? boundedInt(
          source.ALMA_PHASE2A_DISPATCH_DELAY_SECONDS,
          DEFAULT_DISPATCH_DELAY_SECONDS,
          0,
          300,
          "ALMA_PHASE2A_DISPATCH_DELAY_SECONDS",
        )
      : DEFAULT_DISPATCH_DELAY_SECONDS,
  };
}

function boundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be an integer`);
  const value = Number(trimmed);
  if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

export const PHASE2A_CODES = [
  "phase2a_disabled",
  "phase2a_role",
  "phase2a_personal",
  "phase2a_parent",
  "phase2a_refused",
  "phase2a_stale_approval",
  "phase2a_already_sent",
  "phase2a_in_flight",
  "phase2a_last_owner",
  "phase2a_not_member",
  "phase2a_link_taken",
  "phase2a_attachment",
  "phase2a_missing",
] as const;

export type Phase2aCode = (typeof PHASE2A_CODES)[number];

export class Phase2aError extends Error {
  readonly code: Phase2aCode;

  constructor(code: Phase2aCode) {
    super(code);
    this.name = "Phase2aError";
    this.code = code;
  }
}

export type ContextKind = WorkContextKind;
export type ContextRole = WorkContextRole;

export function assertContextParent(input: {
  kind: ContextKind;
  spaceId: string;
  parent: { kind: ContextKind; spaceId: string } | null;
}): void {
  if (input.kind !== "client") {
    if (input.parent) throw new Phase2aError("phase2a_parent");
    return;
  }
  if (!input.parent) return;
  if (input.parent.kind !== "work" || input.parent.spaceId !== input.spaceId) {
    throw new Phase2aError("phase2a_parent");
  }
}

export function assertGrant(input: {
  kind: ContextKind;
  actorRole: ContextRole;
  role: ContextRole;
}): void {
  if (input.actorRole !== "owner") throw new Phase2aError("phase2a_role");
  if (input.kind === "personal") throw new Phase2aError("phase2a_personal");
}

export function assertRevoke(input: {
  actorRole: ContextRole;
  targetRole: ContextRole;
  ownerCount: number;
}): void {
  if (input.actorRole !== "owner") throw new Phase2aError("phase2a_role");
  if (input.targetRole === "owner" && input.ownerCount <= 1) {
    throw new Phase2aError("phase2a_last_owner");
  }
}

const WRITERS = new Set<ContextRole>(["owner", "professional", "assistant"]);
const APPROVERS = new Set<ContextRole>(["owner", "professional"]);

export function assertCanDraft(role: ContextRole): void {
  if (!WRITERS.has(role)) throw new Phase2aError("phase2a_role");
}

export function assertCanApprove(input: {
  actorRole: ContextRole;
  actorUserId: string;
  creatorRole: ContextRole;
  creatorUserId: string;
}): void {
  if (!APPROVERS.has(input.actorRole)) throw new Phase2aError("phase2a_role");
  if (input.creatorRole === "assistant" && input.actorUserId === input.creatorUserId) {
    throw new Phase2aError("phase2a_role");
  }
}

export type DraftStatus =
  | "draft"
  | "pending"
  | "approved"
  | "cancelled"
  | "dispatching"
  | "sent"
  | "failed"
  | "unknown";

export type DeliveryLabel =
  | "draft"
  | "waiting"
  | "sending"
  | "sent"
  | "failed"
  | "unknown"
  | "cancelled";

export function deliveryLabel(
  status: DraftStatus,
  dispatchAfter: Date | null = null,
  now: Date = new Date(),
): DeliveryLabel {
  if (status === "approved") {
    // The delay can elapse with no sender in this slice. That is still waiting.
    void dispatchAfter;
    void now;
    return "waiting";
  }
  if (status === "pending") return "waiting";
  if (status === "dispatching") return "sending";
  return status;
}

export type DraftCommand = "edit" | "submit" | "approve" | "cancel";

export type ApprovalAction =
  | "created"
  | "edited"
  | "submitted"
  | "approved"
  | "invalidated"
  | "cancelled";

export function nextDraftState(input: {
  status: DraftStatus;
  command: DraftCommand;
  actorRole: ContextRole;
  actorUserId: string;
  creatorRole: ContextRole;
  creatorUserId: string;
  now: Date;
  delaySeconds: number;
}): {
  status: DraftStatus;
  clearApproval: boolean;
  action: ApprovalAction;
  dispatchAfter: Date | null;
} {
  const terminal =
    input.status === "sent" ||
    input.status === "failed" ||
    input.status === "unknown" ||
    input.status === "cancelled";
  if (input.status === "dispatching") throw new Phase2aError("phase2a_in_flight");
  if (terminal) throw new Phase2aError("phase2a_already_sent");
  if (input.command === "edit") {
    assertCanDraft(input.actorRole);
    const clearApproval = input.status !== "draft";
    return {
      status: "draft",
      clearApproval,
      action: clearApproval ? "invalidated" : "edited",
      dispatchAfter: null,
    };
  }
  if (input.command === "submit") {
    if (input.status !== "draft") throw new Phase2aError("phase2a_stale_approval");
    assertCanDraft(input.actorRole);
    return { status: "pending", clearApproval: true, action: "submitted", dispatchAfter: null };
  }
  if (input.command === "approve") {
    if (input.status !== "pending") throw new Phase2aError("phase2a_stale_approval");
    assertCanApprove(input);
    return {
      status: "approved",
      clearApproval: false,
      action: "approved",
      dispatchAfter: new Date(input.now.getTime() + input.delaySeconds * 1000),
    };
  }
  if (input.status !== "pending" && input.status !== "approved") {
    throw new Phase2aError("phase2a_stale_approval");
  }
  assertCanDraft(input.actorRole);
  return { status: "cancelled", clearApproval: false, action: "cancelled", dispatchAfter: null };
}

/** A later sender may claim an approved draft. This slice does not call it. */
export function claimDraft(input: {
  status: DraftStatus;
  dispatchAfter: Date | null;
  bodyHash: string;
  approvedBodyHash: string | null;
  now: Date;
}): "dispatching" {
  if (input.status !== "approved") throw new Phase2aError("phase2a_stale_approval");
  if (!input.dispatchAfter || input.dispatchAfter.getTime() > input.now.getTime()) {
    throw new Phase2aError("phase2a_in_flight");
  }
  if (input.approvedBodyHash !== input.bodyHash) throw new Phase2aError("phase2a_stale_approval");
  return "dispatching";
}

/** A later sender records the provider handoff. This slice does not call it. */
export function recordDispatchResult(input: {
  status: DraftStatus;
  result: "sent" | "failed" | "unknown";
}): "sent" | "failed" | "unknown" {
  if (input.status !== "dispatching") throw new Phase2aError("phase2a_stale_approval");
  return input.result;
}

export function draftBodyHash(payload: {
  recipient: string;
  channel: string;
  body: string;
  attachmentIds: readonly string[];
}): string {
  const canonical = JSON.stringify({
    recipient: payload.recipient,
    channel: payload.channel,
    body: payload.body,
    attachmentIds: [...payload.attachmentIds].sort(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function visibleRecordIds(
  records: ReadonlyArray<{ id: string; contextId: string }>,
  contextId: string,
): string[] {
  return records.filter((record) => record.contextId === contextId).map((record) => record.id);
}

export function resolveRecordTitles(
  records: ReadonlyArray<{ id: string; contextId: string; title: string }>,
  contextId: string,
  title: string,
): { status: "none" } | { status: "ambiguous"; ids: string[] } | { status: "one"; id: string } {
  const needle = title.trim().toLowerCase();
  const matches = records.filter(
    (record) => record.contextId === contextId && record.title.trim().toLowerCase() === needle,
  );
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) return { status: "ambiguous", ids: matches.map((record) => record.id) };
  return { status: "one", id: matches[0]!.id };
}

const CLINICAL_TOOLS = new Set(["prescribe", "diagnose"]);
const FILING_TOOLS = new Set(["file_return", "submit_filing"]);
const PRICE_TOOLS = new Set(["commit_price", "send_quote"]);
const PAYMENT_CONNECTORS = new Set(["stripe", "shopify", "paypal", "square"]);

export function externalSendHold(input: {
  enabled: boolean;
  viaConnector: boolean;
  connectorKind: string;
  tools: ReadonlyArray<{ name: string; readOnly?: boolean }>;
}): { code: "phase2a_refused" } | null {
  if (!input.enabled) return null;
  for (const tool of input.tools) {
    if (
      CLINICAL_TOOLS.has(tool.name) ||
      FILING_TOOLS.has(tool.name) ||
      PRICE_TOOLS.has(tool.name)
    ) {
      return { code: "phase2a_refused" };
    }
    if (tool.name === "paid_request") return { code: "phase2a_refused" };
  }
  const mutating =
    input.viaConnector &&
    input.tools.some((tool) => connectorToolRequiresApproval(tool.name, tool.readOnly));
  if (mutating && PAYMENT_CONNECTORS.has(input.connectorKind)) return { code: "phase2a_refused" };
  return null;
}

export function splitTiming(input: { modelMs: number; approvalWaitMs: number }): {
  modelMs: number;
  approvalWaitMs: number;
} {
  return { modelMs: input.modelMs, approvalWaitMs: input.approvalWaitMs };
}

const QUEUE_WRITERS = new Set<ContextRole>(["owner", "professional", "assistant"]);

/** Which queue controls a person may use. Readers can look, not change a draft. */
export function queueDraftActions(input: {
  role: ContextRole;
  status: DraftStatus;
  creatorRole: ContextRole;
  creatorUserId: string;
  actorUserId: string;
}): { compose: boolean; submit: boolean; approve: boolean; save: boolean; cancel: boolean } {
  const write = QUEUE_WRITERS.has(input.role);
  const approver = APPROVERS.has(input.role);
  const ownAssistantDraft =
    input.creatorRole === "assistant" && input.actorUserId === input.creatorUserId;
  const open =
    input.status === "draft" || input.status === "pending" || input.status === "approved";
  return {
    compose: write,
    submit: write && input.status === "draft",
    approve: approver && !ownAssistantDraft && input.status === "pending",
    save: write && open,
    cancel: write && (input.status === "pending" || input.status === "approved"),
  };
}
