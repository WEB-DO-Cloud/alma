import { presentCatalogEntry, resolveModelId } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { listPiCatalog } from "./pi-models.js";

describe("ALMA catalog presentation", () => {
  it("shows alma ids and labels for every upstream deepseek model", () => {
    const upstream = listPiCatalog().filter((entry) => entry.provider === "deepseek");
    expect(upstream.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["deepseek-flash", "deepseek-v4-pro"]),
    );
    const presented = upstream.map(presentCatalogEntry);
    for (const entry of presented) {
      expect(entry.provider).toBe("deepseek");
      expect(entry.id.toLowerCase()).not.toContain("deepseek");
      expect(entry.label.toLowerCase()).not.toContain("deepseek");
      expect(entry.providerName.toLowerCase()).not.toContain("deepseek");
      expect(entry.billing.toLowerCase()).not.toContain("deepseek");
      expect(entry.id.startsWith("alma-")).toBe(true);
    }
    expect(presented.find((entry) => entry.id === "alma-flash")?.label).toBe("ALMA V4.1 Flash");
    for (const entry of upstream) {
      const pub = presentCatalogEntry(entry);
      expect(resolveModelId(entry.provider, pub.id)).toBe(entry.id);
    }
  });
});
