import { describe, expect, it } from "vitest";
import { CREDENTIALS, forceCredentialVersions, PLAY_SERVICES } from "./with-credential-versions.js";

describe("forceCredentialVersions", () => {
  it("forces the stable Credential Manager artifacts once", () => {
    const gradle = forceCredentialVersions("plugins { }\n");
    expect(gradle).toContain(`force "${CREDENTIALS}"`);
    expect(gradle).toContain(`force "${PLAY_SERVICES}"`);
    expect(gradle).toContain("resolutionStrategy");
    expect(forceCredentialVersions(gradle)).toBe(gradle);
  });
});
