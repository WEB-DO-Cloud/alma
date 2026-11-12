import { describe, expect, it } from "vitest";
import { readAlmaFlags } from "./alma-flags.js";

describe("ALMA phase 1 flags", () => {
  it("stays off unless the value is exactly true", () => {
    expect(readAlmaFlags({}).trialEnabled).toBe(false);
    expect(readAlmaFlags({}).onboardingV2).toBe(false);
    expect(readAlmaFlags({}).googleByoOauth).toBe(false);
    expect(readAlmaFlags({}).composioIntegrations).toBe(false);
    expect(readAlmaFlags({ ALMA_GOOGLE_BYO_OAUTH: "1" }).googleByoOauth).toBe(false);
    expect(readAlmaFlags({ ALMA_GOOGLE_BYO_OAUTH: "true" }).googleByoOauth).toBe(true);
    expect(readAlmaFlags({ ALMA_COMPOSIO_INTEGRATIONS: "yes" }).composioIntegrations).toBe(false);
    expect(readAlmaFlags({ ALMA_COMPOSIO_INTEGRATIONS: "true" }).composioIntegrations).toBe(true);
    expect(readAlmaFlags({ ALMA_TRIAL_ENABLED: "1" }).trialEnabled).toBe(false);
    expect(readAlmaFlags({ ALMA_TRIAL_ENABLED: "yes" }).trialEnabled).toBe(false);
    expect(readAlmaFlags({ ALMA_ONBOARDING_V2: "TRUE" }).onboardingV2).toBe(false);
    expect(readAlmaFlags({ ALMA_TRIAL_ENABLED: "true" }).trialEnabled).toBe(true);
    expect(readAlmaFlags({ ALMA_TRIAL_ENABLED: "true" }).trialDays).toBe(14);
    expect(readAlmaFlags({ ALMA_TRIAL_ENABLED: "true" }).trialMessageCap).toBe(50);
  });

  it("rejects an out-of-range cap only when the trial is on", () => {
    expect(readAlmaFlags({ ALMA_TRIAL_MESSAGE_CAP: "0" }).trialMessageCap).toBe(50);
    expect(() => readAlmaFlags({ ALMA_TRIAL_ENABLED: "true", ALMA_TRIAL_DAYS: "0" })).toThrow(
      "ALMA_TRIAL_DAYS",
    );
    expect(() =>
      readAlmaFlags({ ALMA_TRIAL_ENABLED: "true", ALMA_TRIAL_MESSAGE_CAP: "1001" }),
    ).toThrow("ALMA_TRIAL_MESSAGE_CAP");
    expect(
      readAlmaFlags({
        ALMA_TRIAL_ENABLED: "true",
        ALMA_TRIAL_DAYS: "7",
        ALMA_TRIAL_MESSAGE_CAP: "20",
      }),
    ).toMatchObject({ trialDays: 7, trialMessageCap: 20 });
  });
});
