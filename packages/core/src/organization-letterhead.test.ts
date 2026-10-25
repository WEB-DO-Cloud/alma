import type { OrganizationSettings } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  assertNamedApprover,
  DraftApprovalError,
  organizationLetterhead,
  renderDraftDocumentHtml,
} from "./organization-letterhead.js";

const settings: OrganizationSettings = {
  legalName: "Núñez & Asociados S.R.L.",
  tradeName: "Núñez",
  rnc: "101123456",
  addressLine: "Calle 1",
  cityProvince: "Santo Domingo",
  phone: "809-555-0100",
  email: "firma@example.com",
  website: "https://firma.example",
  bankName: "Banco Popular",
  bankAccount: "123-456",
  invoiceFooter: "Pago a 15 días",
  accentColor: "#1F4B3A",
  minimumReviewSeconds: 60,
  logo: { id: "logo-1", mimeType: "image/png", dataUrl: "data:image/png;base64,aaaa" },
  lawyers: [
    {
      id: "lawyer-1",
      name: "María Núñez",
      cardNumber: "12345",
      email: "maria@firma.example",
      mayApproveDrafts: true,
    },
    {
      id: "lawyer-2",
      name: "Luis Pérez",
      cardNumber: "67890",
      email: "luis@firma.example",
      mayApproveDrafts: false,
    },
  ],
};

describe("organization letterhead", () => {
  it("prints the firm on the header and footer of a draft for review", () => {
    const letterhead = organizationLetterhead(settings);
    expect(letterhead.displayName).toBe("Núñez");
    expect(letterhead.rncFormatted).toBe("1-01-12345-6");
    expect(letterhead.headerText).toContain("Núñez & Asociados S.R.L.");
    expect(letterhead.headerText).toContain("RNC 1-01-12345-6");
    expect(letterhead.headerText).toContain("Calle 1");
    expect(letterhead.headerText).toContain("809-555-0100");
    expect(letterhead.footerText).toContain("Borrador para revisión");
    expect(letterhead.footerText).toContain("Banco Popular");
    expect(letterhead.approvingLawyers.map((lawyer) => lawyer.id)).toEqual(["lawyer-1"]);
    expect(letterhead.headerHtml).toContain("#1F4B3A");
    expect(letterhead.headerHtml).toContain("data:image/png;base64,aaaa");
    expect(letterhead.headerHtml).not.toContain("<script");
  });

  it("names the approving lawyer and refuses anyone else", () => {
    const letterhead = organizationLetterhead(settings);
    const html = renderDraftDocumentHtml({
      title: "Contrato",
      bodyHtml: "<p>Cláusula</p>",
      letterhead,
      reviewingLawyerId: "lawyer-1",
    });
    expect(html).toContain("Borrador para revisión");
    expect(html).toContain("María Núñez");
    expect(html).toContain("CARD 12345");
    expect(html.toLowerCase()).not.toContain("abogado ia");
    expect(html.toLowerCase()).not.toContain("ai lawyer");
    expect(() => assertNamedApprover(letterhead, "lawyer-2")).toThrow(DraftApprovalError);
    expect(() => assertNamedApprover(letterhead, "missing")).toThrow(DraftApprovalError);
  });

  it("adds the approval sentence to the footer once a named lawyer has approved", () => {
    const letterhead = organizationLetterhead(settings);
    const html = renderDraftDocumentHtml({
      title: "Contrato",
      bodyHtml: "<p>Cláusula</p>",
      letterhead,
      reviewingLawyerId: "lawyer-1",
      approvedAt: new Date("2026-10-26T15:00:00.000Z"),
    });
    expect(html).toContain("Núñez");
    expect(html).toContain(
      "Borrador preparado con asistencia de software y revisado y aprobado por Lic. María Núñez, CARD 12345, el 26 de octubre de 2026.",
    );
    expect(html.toLowerCase()).not.toContain("abogado ia");
  });

  it("escapes firm text that could break the document", () => {
    const letterhead = organizationLetterhead({
      ...settings,
      tradeName: "<img src=x onerror=alert(1)>",
      bankName: "",
      bankAccount: "",
      invoiceFooter: "",
      logo: null,
    });
    expect(letterhead.headerHtml).toContain("&lt;img");
    expect(letterhead.headerHtml).not.toContain("<img src=x");
    expect(letterhead.invoice).toBeNull();
  });
});
