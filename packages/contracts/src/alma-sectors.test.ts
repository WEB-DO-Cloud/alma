import { describe, expect, it } from "vitest";
import {
  ALMA_PERSONAL_SECTOR,
  ALMA_WORK_SECTORS,
  almaInstructions,
  almaSector,
  almaText,
} from "./alma-sectors.js";

describe("sector catalog", () => {
  it("offers personal use and the eight launch sectors plus other", () => {
    expect(ALMA_WORK_SECTORS.map((sector) => sector.id)).toEqual([
      "abogados",
      "notaria",
      "arquitectura",
      "contabilidad",
      "clinica-dental",
      "clinica-medica",
      "inmobiliaria",
      "seguros",
      "otro",
    ]);
    for (const sector of [ALMA_PERSONAL_SECTOR, ...ALMA_WORK_SECTORS]) {
      expect(sector.tasks).toHaveLength(3);
      for (const language of ["en", "es"] as const) {
        expect(almaText(sector.label, language).length).toBeGreaterThan(0);
        expect(almaText(sector.botName, language).length).toBeGreaterThan(0);
        for (const task of sector.tasks) {
          expect(almaText(task.title, language).length).toBeGreaterThan(0);
          expect(almaText(task.prompt, language).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not call the assistant an AI lawyer", () => {
    const text = [
      almaInstructions("Asistente legal", "es"),
      almaInstructions("Legal assistant", "en"),
      ...ALMA_WORK_SECTORS.flatMap((sector) =>
        sector.tasks.flatMap((task) => [
          task.prompt.en,
          task.prompt.es,
          task.title.en,
          task.title.es,
        ]),
      ),
    ].join("\n");
    expect(text.toLowerCase()).not.toContain("abogado ia");
    expect(almaSector("abogados")?.id).toBe("abogados");
    expect(almaSector("personal")?.id).toBe("personal");
    expect(almaSector("fotografia")).toBeUndefined();
  });
});
