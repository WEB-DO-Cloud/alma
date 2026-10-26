import { describe, expect, it } from "vitest";
import {
  DRAFT_CONFIRMATION,
  formatReviewClock,
  remainingReviewSeconds,
  reviewClockSatisfied,
  reviewGate,
} from "./alma-review";

const opened = "2026-10-26T14:00:00.000Z";
const openedMs = Date.parse(opened);

describe("review timer", () => {
  it("counts the full minimum before the draft has been opened", () => {
    expect(
      remainingReviewSeconds({ openedAt: null, requiredReviewMs: 60_000, nowMs: openedMs }),
    ).toBe(60);
    expect(
      reviewClockSatisfied({ openedAt: null, requiredReviewMs: 60_000, nowMs: openedMs }),
    ).toBe(false);
  });

  it("keeps approve locked until the server interval has elapsed", () => {
    const early = openedMs + 59_000;
    expect(
      remainingReviewSeconds({ openedAt: opened, requiredReviewMs: 60_000, nowMs: early }),
    ).toBe(1);
    expect(reviewClockSatisfied({ openedAt: opened, requiredReviewMs: 60_000, nowMs: early })).toBe(
      false,
    );
    const ready = openedMs + 60_000;
    expect(
      remainingReviewSeconds({ openedAt: opened, requiredReviewMs: 60_000, nowMs: ready }),
    ).toBe(0);
    expect(reviewClockSatisfied({ openedAt: opened, requiredReviewMs: 60_000, nowMs: ready })).toBe(
      true,
    );
  });

  it("formats the countdown", () => {
    expect(formatReviewClock(63)).toBe("1:03");
    expect(formatReviewClock(0)).toBe("0:00");
  });
});

describe("review gate", () => {
  const open = {
    canApprove: true,
    status: "in_review",
    confirmed: true,
    remainingSeconds: 0,
    lawyerId: "lawyer-1",
    pending: false,
  };

  it("requires the confirmation and a finished timer before approve", () => {
    expect(reviewGate(open)).toEqual({ approve: true, reject: true, block: null });
    expect(reviewGate({ ...open, confirmed: false })).toEqual({
      approve: false,
      reject: true,
      block: "confirmation",
    });
    expect(reviewGate({ ...open, remainingSeconds: 3 })).toEqual({
      approve: false,
      reject: true,
      block: "timer",
    });
  });

  it("hides approve from someone the server says cannot approve", () => {
    expect(reviewGate({ ...open, canApprove: false })).toEqual({
      approve: false,
      reject: false,
      block: "only-approver",
    });
    expect(reviewGate({ ...open, lawyerId: null })).toEqual({
      approve: false,
      reject: false,
      block: "no-lawyer",
    });
  });

  it("locks a finished draft and a request that is still saving", () => {
    expect(reviewGate({ ...open, status: "approved" }).approve).toBe(false);
    expect(reviewGate({ ...open, status: "rejected" }).reject).toBe(false);
    expect(reviewGate({ ...open, pending: true })).toEqual({
      approve: false,
      reject: false,
      block: "pending",
    });
  });

  it("keeps the professional confirmation in Spanish", () => {
    expect(DRAFT_CONFIRMATION).toBe(
      "He revisado este borrador y asumo la responsabilidad profesional de su contenido",
    );
  });
});
