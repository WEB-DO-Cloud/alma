import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_TEXT,
  readReferralPromptConfig,
  readReferralRewardsConfig,
  referralPromptAllowed,
  referralRewardDecision,
  samePrivateEmailDomain,
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

  it("keeps rewards off unless the value is exactly true", () => {
    expect(readReferralRewardsConfig({}).enabled).toBe(false);
    expect(readReferralRewardsConfig({ ALMA_REFERRAL_REWARDS: "yes" }).enabled).toBe(false);
    expect(readReferralRewardsConfig({ ALMA_REFERRAL_REWARDS: "true" }).enabled).toBe(true);
  });

  it("declines self, shared card, shared private domain, and a full cap", () => {
    const clean = {
      selfReferral: false,
      sameCard: false,
      samePrivateDomain: false,
      rewardsInWindow: 0,
    };
    expect(referralRewardDecision(clean)).toBe("grant");
    expect(referralRewardDecision({ ...clean, selfReferral: true })).toBe("decline");
    expect(referralRewardDecision({ ...clean, sameCard: true })).toBe("decline");
    expect(referralRewardDecision({ ...clean, samePrivateDomain: true })).toBe("decline");
    expect(referralRewardDecision({ ...clean, rewardsInWindow: 5 })).toBe("decline");
    expect(samePrivateEmailDomain(["a@firm.test"], ["b@firm.test"])).toBe(true);
    expect(samePrivateEmailDomain(["a@gmail.com"], ["b@gmail.com"])).toBe(false);
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
