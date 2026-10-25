import type { OrganizationSettings } from "@rakazo/contracts";
import { approvedDraftFooterLine } from "./draft-footer.js";
import { organizationLetterhead, renderDraftDocumentHtml } from "./organization-letterhead.js";

export const DEFAULT_MINIMUM_REVIEW_SECONDS = 60;
export const MIN_REVIEW_SECONDS = 30;
export const MAX_REVIEW_SECONDS = 30 * 60;
/** Each full block of this many characters adds another minimum-review interval. */
export const REVIEW_LENGTH_STEP_CHARS = 1_500;
/** Shorter than this, a draft blocks export only by id, not by a substring match. */
export const DRAFT_SNIPPET_MIN_CHARS = 16;

export const DRAFT_STATUSES = ["generated", "in_review", "approved", "rejected"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export interface DraftDiffSpan {
  type: "equal" | "insert" | "delete";
  text: string;
}

export interface DraftLawyerLink {
  id: string;
  email: string;
  name: string;
  cardNumber: string;
  mayApproveDrafts: boolean;
  archivedAt: string | null;
}

export function requiredReviewDurationMs(
  minimumReviewSeconds: number,
  draftLength: number,
): number {
  const seconds = Math.min(
    MAX_REVIEW_SECONDS,
    Math.max(
      MIN_REVIEW_SECONDS,
      Math.floor(minimumReviewSeconds) || DEFAULT_MINIMUM_REVIEW_SECONDS,
    ),
  );
  const steps = Math.max(1, Math.ceil(Math.max(0, draftLength) / REVIEW_LENGTH_STEP_CHARS));
  return seconds * steps * 1000;
}

/** True when the server clock shows the lawyer has had the draft open long enough. */
export function reviewTimeSatisfied(openedAt: Date | null, now: Date, requiredMs: number): boolean {
  if (!openedAt) return false;
  return now.getTime() - openedAt.getTime() >= requiredMs;
}

export function lawyerMayApproveForUser(lawyer: DraftLawyerLink, user: { email: string }): boolean {
  if (lawyer.archivedAt !== null || !lawyer.mayApproveDrafts) return false;
  return lawyer.email.trim().toLowerCase() === user.email.trim().toLowerCase();
}

export async function draftTextHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tokenize(value: string): string[] {
  return value.match(/\s+|[^\s]+/g) ?? [];
}

function mergeSpans(spans: DraftDiffSpan[]): DraftDiffSpan[] {
  const merged: DraftDiffSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const last = merged.at(-1);
    if (last && last.type === span.type) last.text += span.text;
    else merged.push({ type: span.type, text: span.text });
  }
  return merged;
}

function lcsDiff(before: string[], after: string[]): DraftDiffSpan[] {
  const n = before.length;
  const m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = before[i] === after[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const spans: DraftDiffSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      spans.push({ type: "equal", text: before[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      spans.push({ type: "delete", text: before[i]! });
      i += 1;
    } else {
      spans.push({ type: "insert", text: after[j]! });
      j += 1;
    }
  }
  while (i < n) spans.push({ type: "delete", text: before[i++]! });
  while (j < m) spans.push({ type: "insert", text: after[j++]! });
  return spans;
}

/** Word diff, falling back to lines when the draft is long. */
export function diffDraftText(before: string, after: string): DraftDiffSpan[] {
  const wordsBefore = tokenize(before);
  const wordsAfter = tokenize(after);
  if (wordsBefore.length * wordsAfter.length <= 800_000) {
    return mergeSpans(lcsDiff(wordsBefore, wordsAfter));
  }
  const linesBefore = before.split(/(\n)/);
  const linesAfter = after.split(/(\n)/);
  if (linesBefore.length * linesAfter.length <= 800_000) {
    return mergeSpans(lcsDiff(linesBefore, linesAfter));
  }
  const spans: DraftDiffSpan[] = [];
  if (before) spans.push({ type: "delete", text: before });
  if (after) spans.push({ type: "insert", text: after });
  return mergeSpans(spans);
}

export function textCarriesDraft(text: string, body: string): boolean {
  const needle = body.trim();
  if (!needle) return false;
  if (text === body || text === needle) return true;
  return needle.length >= DRAFT_SNIPPET_MIN_CHARS && text.includes(needle);
}

export interface UnapprovedDraftRef {
  id: string;
  status: string;
  originalText: string;
  editedText: string;
  sourceMessageId: string | null;
  sourceArtifactId: string | null;
}

/** The draft that makes this payload unsafe to send, copy, or download. */
export function payloadCarriesUnapprovedDraft(
  texts: string[],
  drafts: UnapprovedDraftRef[],
  refs: { messageIds?: string[]; artifactIds?: string[] } = {},
): { draftId: string } | null {
  const messageIds = new Set(refs.messageIds ?? []);
  const artifactIds = new Set(refs.artifactIds ?? []);
  for (const draft of drafts) {
    if (draft.status === "approved" || draft.status === "rejected") continue;
    if (draft.sourceMessageId && messageIds.has(draft.sourceMessageId))
      return { draftId: draft.id };
    if (draft.sourceArtifactId && artifactIds.has(draft.sourceArtifactId)) {
      return { draftId: draft.id };
    }
    for (const text of texts) {
      if (!text) continue;
      if (textCarriesDraft(text, draft.originalText) || textCarriesDraft(text, draft.editedText)) {
        return { draftId: draft.id };
      }
    }
  }
  return null;
}

export function collectTextLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) collectTextLeaves(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectTextLeaves(item, out);
  }
  return out;
}

export function draftApprovalLogCsv(
  rows: Array<{
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
  }>,
): string {
  const header = [
    "draftId",
    "approverLawyerId",
    "approverName",
    "cardNumber",
    "userId",
    "openedAt",
    "approvedAt",
    "reviewDurationMs",
    "model",
    "modelVersion",
    "originalHash",
    "finalHash",
    "diff",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.draftId,
        row.approverLawyerId,
        row.approverName,
        row.cardNumber,
        row.userId,
        row.openedAt,
        row.approvedAt ?? "",
        String(row.reviewDurationMs),
        row.model,
        row.modelVersion,
        row.originalHash,
        row.finalHash,
        JSON.stringify(row.diff),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bodyHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br/>")}</p>`)
    .join("");
}

/** Letterhead, body, and the approval footer. Only for a draft a lawyer has approved. */
export function renderApprovedDraftDocument(input: {
  settings: OrganizationSettings;
  logoDataUrl?: string | null;
  title: string;
  bodyText: string;
  lawyerId: string;
  approvedAt: Date;
}): { html: string; text: string } {
  const letterhead = organizationLetterhead(input.settings, { logoDataUrl: input.logoDataUrl });
  const lawyer = letterhead.approvingLawyers.find((candidate) => candidate.id === input.lawyerId);
  if (!lawyer) {
    throw new Error("Name a lawyer who may approve drafts before export.");
  }
  const footer = approvedDraftFooterLine({
    name: lawyer.name,
    cardNumber: lawyer.cardNumber,
    approvedAt: input.approvedAt,
  });
  const html = renderDraftDocumentHtml({
    title: input.title,
    bodyHtml: bodyHtml(input.bodyText),
    letterhead,
    reviewingLawyerId: lawyer.id,
    approvedAt: input.approvedAt,
  });
  const text = [letterhead.headerText, input.title, input.bodyText, footer, letterhead.footerText]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
  return { html, text };
}
