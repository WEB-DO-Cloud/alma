import { describe, expect, it } from "vitest";
import { approvedDraftFooterLine } from "./draft-footer.js";
import {
  collectTextLeaves,
  diffDraftText,
  draftApprovalLogCsv,
  draftTextHash,
  lawyerMayApproveForUser,
  payloadCarriesUnapprovedDraft,
  requiredReviewDurationMs,
  reviewTimeSatisfied,
  textCarriesDraft,
} from "./draft-review.js";

describe("draft review rules", () => {
  it("hashes the same text to the same value", async () => {
    const hash = await draftTextHash("Cláusula primera");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(await draftTextHash("Cláusula primera"));
    expect(hash).not.toBe(await draftTextHash("Cláusula segunda"));
  });

  it("adds review time as the draft gets longer", () => {
    expect(requiredReviewDurationMs(60, 10)).toBe(60_000);
    expect(requiredReviewDurationMs(60, 1_500)).toBe(60_000);
    expect(requiredReviewDurationMs(60, 1_501)).toBe(120_000);
    expect(requiredReviewDurationMs(10, 10)).toBe(30_000);
    const opened = new Date("2026-10-26T15:00:00.000Z");
    expect(reviewTimeSatisfied(null, opened, 60_000)).toBe(false);
    expect(reviewTimeSatisfied(opened, new Date(opened.getTime() + 59_999), 60_000)).toBe(false);
    expect(reviewTimeSatisfied(opened, new Date(opened.getTime() + 60_000), 60_000)).toBe(true);
  });

  it("marks insertions and deletions", () => {
    const diff = diffDraftText("paga la renta", "paga la renta mensual");
    expect(diff.some((span) => span.type === "insert" && span.text.includes("mensual"))).toBe(true);
    const removed = diffDraftText("paga la renta hoy", "paga la renta");
    expect(removed.some((span) => span.type === "delete" && span.text.includes("hoy"))).toBe(true);
  });

  it("names the approving lawyer on the footer", () => {
    const line = approvedDraftFooterLine({
      name: "María Núñez",
      cardNumber: "12345",
      approvedAt: new Date("2026-10-26T15:00:00.000Z"),
    });
    expect(line).toBe(
      "Borrador preparado con asistencia de software y revisado y aprobado por Lic. María Núñez, CARD 12345, el 26 de octubre de 2026.",
    );
    expect(line.toLowerCase()).not.toContain("abogado ia");
    expect(line.toLowerCase()).not.toContain("ai lawyer");
  });

  it("links the signed-in account by the lawyer email", () => {
    const lawyer = {
      id: "lawyer-1",
      email: "Maria@Firma.example",
      name: "María Núñez",
      cardNumber: "12345",
      mayApproveDrafts: true,
      archivedAt: null,
    };
    expect(lawyerMayApproveForUser(lawyer, { email: "maria@firma.example" })).toBe(true);
    expect(lawyerMayApproveForUser(lawyer, { email: "otra@firma.example" })).toBe(false);
    expect(
      lawyerMayApproveForUser({ ...lawyer, mayApproveDrafts: false }, { email: lawyer.email }),
    ).toBe(false);
    expect(
      lawyerMayApproveForUser(
        { ...lawyer, archivedAt: "2026-10-01T00:00:00.000Z" },
        { email: lawyer.email },
      ),
    ).toBe(false);
  });

  it("detects an unapproved draft in text, a message, or a file", () => {
    const drafts = [
      {
        id: "draft-1",
        status: "generated",
        originalText: "El arrendatario paga la renta.",
        editedText: "El arrendatario paga la renta.",
        sourceMessageId: "message-1",
        sourceArtifactId: "file-1",
      },
    ];
    expect(
      textCarriesDraft("Nota. El arrendatario paga la renta. Fin.", drafts[0]!.originalText),
    ).toBe(true);
    expect(
      payloadCarriesUnapprovedDraft(["hola"], drafts, { messageIds: ["message-1"] })?.draftId,
    ).toBe("draft-1");
    expect(
      payloadCarriesUnapprovedDraft(["hola"], drafts, { artifactIds: ["file-1"] })?.draftId,
    ).toBe("draft-1");
    expect(payloadCarriesUnapprovedDraft(["sin relación"], drafts)).toBeNull();
    expect(
      payloadCarriesUnapprovedDraft(
        ["El arrendatario paga la renta."],
        [{ ...drafts[0]!, status: "approved" }],
      ),
    ).toBeNull();
    expect(collectTextLeaves({ history: [{ text: "uno" }, { nested: "dos" }] })).toEqual([
      "uno",
      "dos",
    ]);
  });

  it("escapes the approval log csv", () => {
    const csv = draftApprovalLogCsv([
      {
        draftId: "draft-1",
        approverLawyerId: "lawyer-1",
        approverName: 'María "Núñez"',
        cardNumber: "12345",
        userId: "user-1",
        openedAt: "2026-10-26T15:00:00.000Z",
        approvedAt: "2026-10-26T15:01:10.000Z",
        reviewDurationMs: 70_000,
        model: "example-model",
        modelVersion: "2026-10-01",
        originalHash: "abc",
        finalHash: "def",
        diff: [{ type: "insert", text: "mensual" }],
      },
    ]);
    expect(csv).toContain('"María ""Núñez"""');
    expect(csv).toContain("mensual");
  });
});
