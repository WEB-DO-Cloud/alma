import { reviewTimeSatisfied } from "@rakazo/core";

/** Shown as written. The lawyer's confirmation is not translated. */
export const DRAFT_CONFIRMATION =
  "He revisado este borrador y asumo la responsabilidad profesional de su contenido";

export interface ReviewClock {
  openedAt: string | null;
  requiredReviewMs: number;
  nowMs: number;
}

/** Seconds until the server-side minimum review time has elapsed. */
export function remainingReviewSeconds(clock: ReviewClock): number {
  const required = Math.max(0, clock.requiredReviewMs);
  if (!clock.openedAt) return Math.ceil(required / 1000);
  const opened = Date.parse(clock.openedAt);
  if (Number.isNaN(opened)) return Math.ceil(required / 1000);
  return Math.max(0, Math.ceil((opened + required - clock.nowMs) / 1000));
}

export function reviewClockSatisfied(clock: ReviewClock): boolean {
  if (!clock.openedAt) return false;
  const opened = new Date(clock.openedAt);
  if (Number.isNaN(opened.getTime())) return false;
  return reviewTimeSatisfied(opened, new Date(clock.nowMs), clock.requiredReviewMs);
}

export interface ReviewGateInput {
  /** Server flag: this signed-in user is a lawyer who may approve. */
  canApprove: boolean;
  status: string;
  confirmed: boolean;
  remainingSeconds: number;
  lawyerId: string | null;
  pending: boolean;
}

export type ReviewBlock =
  | "only-approver"
  | "finished"
  | "no-lawyer"
  | "confirmation"
  | "timer"
  | "pending";

export interface ReviewGate {
  approve: boolean;
  reject: boolean;
  block: ReviewBlock | null;
}

/**
 * What the review screen may offer. The server repeats these checks on approve;
 * a lawyer who cannot approve never sees an enabled approve action.
 */
export function reviewGate(input: ReviewGateInput): ReviewGate {
  const finished = input.status === "approved" || input.status === "rejected";
  if (!input.canApprove) return { approve: false, reject: false, block: "only-approver" };
  if (finished) return { approve: false, reject: false, block: "finished" };
  if (!input.lawyerId) return { approve: false, reject: false, block: "no-lawyer" };
  if (input.pending) return { approve: false, reject: false, block: "pending" };
  if (input.remainingSeconds > 0) return { approve: false, reject: true, block: "timer" };
  if (!input.confirmed) return { approve: false, reject: true, block: "confirmation" };
  return { approve: true, reject: true, block: null };
}

export function formatReviewClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
