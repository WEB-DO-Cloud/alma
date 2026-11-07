import { describe, expect, it } from "vitest";
import {
  blockedReferralReward,
  DEFAULT_SHARE_TEXT,
  readReferralPromptConfig,
  readReferralRewardsConfig,
  referralPromptAllowed,
} from "./referral-prompt.js";

const open = {
  latestResult: "success" as const,
  ownsOrganization: true,
  promptsInLast7Days: 0,
  winInLast24Hours: true,
};

describe("referral prompt", () => {
  it("is on only for the exact string true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE"]) {
      expect(readReferralPromptConfig({ ALMA_REFERRAL_PROMPT: value }).enabled).toBe(false);
    }
    expect(readReferralPromptConfig({ ALMA_REFERRAL_PROMPT: "true" }).enabled).toBe(true);
  });

  it("rejects the rewards flag and never grants", () => {
    expect(readReferralRewardsConfig({}).enabled).toBe(false);
    expect(readReferralRewardsConfig({ ALMA_REFERRAL_REWARDS: "yes" }).enabled).toBe(false);
    expect(() => readReferralRewardsConfig({ ALMA_REFERRAL_REWARDS: "true" })).toThrow(
      "referral rewards are not approved",
    );
    expect(blockedReferralReward()).toEqual({ granted: false });
  });

  it("allows three successes and refuses an error or a fourth prompt", () => {
    expect(referralPromptAllowed(open)).toBe(true);
    expect(referralPromptAllowed({ ...open, promptsInLast7Days: 2 })).toBe(true);
    expect(referralPromptAllowed({ ...open, promptsInLast7Days: 3 })).toBe(false);
    expect(referralPromptAllowed({ ...open, latestResult: "error" })).toBe(false);
    expect(referralPromptAllowed({ ...open, ownsOrganization: false })).toBe(false);
    expect(referralPromptAllowed({ ...open, winInLast24Hours: false })).toBe(false);
  });

  it("does not say a draft will be sent", () => {
    expect(DEFAULT_SHARE_TEXT).toBe("I use ALMA for drafts I review on screen.");
    expect(DEFAULT_SHARE_TEXT.toLowerCase()).not.toContain("sent");
  });
});
