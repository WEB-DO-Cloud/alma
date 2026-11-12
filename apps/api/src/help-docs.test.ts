import { describe, expect, it } from "vitest";
import { helpIndexMarkdown, readHelpDoc } from "./help-docs.js";

const CLIENT_ID = "100-abc.apps.googleusercontent.com";

describe("google workspace help", () => {
  it("hides the article unless the flag is exactly true, and never leaves the token", () => {
    expect(readHelpDoc("google-workspace", {})).toBeNull();
    expect(readHelpDoc("google-workspace", { ALMA_GOOGLE_BYO_OAUTH: "yes" })).toBeNull();
    expect(
      readHelpDoc("google-workspace", {
        ALMA_GOOGLE_BYO_OAUTH: "true",
        ALMA_COMPOSIO_INTEGRATIONS: "true",
      }),
    ).toBeNull();
    const hidden = helpIndexMarkdown({});
    expect(hidden).not.toContain("google-workspace");

    const page = readHelpDoc("google-workspace", { ALMA_GOOGLE_BYO_OAUTH: "true" });
    expect(page?.markdown).toContain("The client ID is not set on this server.");
    expect(page?.markdown).not.toContain("{{ALMA_GOOGLE_OAUTH_CLIENT_ID}}");
    expect(page?.markdown).toContain("De confianza");

    const shown = readHelpDoc("google-workspace", {
      ALMA_GOOGLE_BYO_OAUTH: "true",
      ALMA_GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    });
    expect(shown?.markdown).toContain(CLIENT_ID);
    expect(shown?.markdown).not.toContain("{{ALMA_GOOGLE_OAUTH_CLIENT_ID}}");
    expect(
      readHelpDoc("google-workspace", {
        ALMA_GOOGLE_BYO_OAUTH: "true",
        ALMA_GOOGLE_OAUTH_CLIENT_ID: "not-a-client",
      })?.markdown,
    ).toContain("The client ID is not set on this server.");
  });
});
