import { describe, expect, it } from "vitest";
import { ALMA_PUSH_BODY, ALMA_PUSH_TITLE, sanitizePushPayload } from "./push-notice.js";

describe("sanitizePushPayload", () => {
  it("drops client and case text from every kind", () => {
    const secret = "Demanda de Pérez contra el expediente 2024-118";
    const notice = sanitizePushPayload({
      kind: "completion",
      title: secret,
      body: "El borrador dice que el apartamento 3B está listo",
    });
    expect(notice).toEqual({ title: ALMA_PUSH_TITLE, body: ALMA_PUSH_BODY });
    expect(JSON.stringify(notice)).not.toContain("Pérez");
    expect(JSON.stringify(notice)).not.toContain("3B");
    expect(JSON.stringify(notice)).not.toContain("2024");
  });

  it("uses the same content-free sentence when the sender omitted text", () => {
    expect(sanitizePushPayload({})).toEqual({
      title: ALMA_PUSH_TITLE,
      body: ALMA_PUSH_BODY,
    });
  });
});
