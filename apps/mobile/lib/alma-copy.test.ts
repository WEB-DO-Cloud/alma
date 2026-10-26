import { describe, expect, it } from "vitest";
import { almaCatalog, almaText } from "./alma-copy";

const forbidden = [/abogado\s+ia/i, /ai lawyer/i, /asesor[ií]a jur[ií]dica/i, /legal advice/i];

describe("ALMA copy", () => {
  it("uses Spanish for es and English otherwise", () => {
    expect(almaText("drafts", "es")).toBe("Borradores para revisión");
    expect(almaText("drafts", "es-DO")).toBe("Borradores para revisión");
    expect(almaText("drafts", "en")).toBe("Drafts for review");
  });

  it("does not claim legal advice or an AI lawyer", () => {
    for (const locale of ["es", "en"] as const) {
      const text = Object.values(almaCatalog(locale)).join("\n");
      for (const pattern of forbidden) expect(text).not.toMatch(pattern);
    }
  });
});
