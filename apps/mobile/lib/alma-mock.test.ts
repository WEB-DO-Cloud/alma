import { afterEach, describe, expect, it } from "vitest";
import {
  isMockMode,
  mockApproveDraft,
  mockGetDraft,
  mockListDrafts,
  mockModeFromEnv,
  mockOpenDraft,
  mockRejectDraft,
  resetAlmaMock,
  resetMockModeForTests,
  setMockMode,
} from "./alma-mock";

afterEach(() => {
  resetAlmaMock();
  resetMockModeForTests();
});

describe("mock mode", () => {
  it("reads the env flag and a runtime switch", async () => {
    expect(mockModeFromEnv({})).toBe(false);
    expect(mockModeFromEnv({ EXPO_PUBLIC_ALMA_MOCK: "1" })).toBe(true);
    expect(mockModeFromEnv({ EXPO_PUBLIC_ALMA_MOCK: "yes" })).toBe(true);
    expect(isMockMode()).toBe(false);
    await setMockMode(true);
    expect(isMockMode()).toBe(true);
    await setMockMode(false);
    expect(isMockMode()).toBe(false);
  });

  it("serves sample drafts marked as examples and refuses an early approve", () => {
    expect(mockListDrafts().map((row) => row.title)).toContain("Instancia de entrega");
    const opened = mockOpenDraft("draft-ejemplo", new Date("2026-10-26T14:00:00.000Z"));
    expect(opened.originalText).toContain("Datos de ejemplo");
    expect(opened.canApprove).toBe(true);
    expect(opened.diff.some((span) => span.type === "insert" && span.text.includes("3B"))).toBe(
      true,
    );
    expect(() =>
      mockApproveDraft(
        {
          draftId: opened.id,
          lawyerId: opened.linkedLawyerId!,
          editedText: opened.editedText,
          confirmation: true,
        },
        new Date("2026-10-26T14:00:01.000Z"),
      ),
    ).toThrow(/minimum review time/i);
  });

  it("approves only after the timer, and blocks a user who cannot approve", () => {
    const openedAt = new Date("2026-10-26T14:00:00.000Z");
    const opened = mockOpenDraft("draft-ejemplo", openedAt);
    const approved = mockApproveDraft(
      {
        draftId: opened.id,
        lawyerId: opened.linkedLawyerId!,
        editedText: opened.editedText,
        confirmation: true,
      },
      new Date(openedAt.getTime() + opened.requiredReviewMs),
    );
    expect(approved.status).toBe("approved");
    expect(approved.approverName).toBe("Lcda. Ejemplo");

    const locked = mockGetDraft("draft-lectura");
    expect(locked.canApprove).toBe(false);
    expect(() =>
      mockRejectDraft({
        draftId: locked.id,
        lawyerId: "lawyer-ejemplo",
        editedText: locked.editedText,
      }),
    ).toThrow();
  });
});
