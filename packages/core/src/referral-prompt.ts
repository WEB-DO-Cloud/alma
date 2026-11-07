/** Share prompt after a verified win. Off unless the value is exactly `true`. */

export type ReferralPromptConfig = { enabled: boolean };

export function readReferralPromptConfig(
  source: NodeJS.ProcessEnv = process.env,
): ReferralPromptConfig {
  return { enabled: source.ALMA_REFERRAL_PROMPT === "true" };
}

/** Exact `true` is rejected. This reader never returns enabled. */
export function readReferralRewardsConfig(source: NodeJS.ProcessEnv = process.env): {
  enabled: false;
} {
  if (source.ALMA_REFERRAL_REWARDS === "true") {
    throw new Error("referral rewards are not approved");
  }
  return { enabled: false };
}

export const DEFAULT_SHARE_TEXT = "I use ALMA for drafts I review on screen.";

/** All four must hold. An error result records nothing. */
export function referralPromptAllowed(input: {
  latestResult: "success" | "error";
  ownsOrganization: boolean;
  promptsInLast7Days: number;
  winInLast24Hours: boolean;
}): boolean {
  return (
    input.latestResult === "success" &&
    input.ownsOrganization &&
    input.promptsInLast7Days < 3 &&
    input.winInLast24Hours
  );
}

/** The only new reward code. It returns before any provider call. */
export function blockedReferralReward(): { granted: false } {
  return { granted: false };
}
