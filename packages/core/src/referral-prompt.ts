/** Share prompt after a verified win. Off unless the value is exactly `true`. */

export type ReferralPromptConfig = { enabled: boolean };

export function readReferralPromptConfig(
  source: NodeJS.ProcessEnv = process.env,
): ReferralPromptConfig {
  return { enabled: source.ALMA_REFERRAL_PROMPT === "true" };
}

/** Off unless exactly `true`. Exact `true` is allowed and does not throw. */
export function readReferralRewardsConfig(source: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
} {
  return { enabled: source.ALMA_REFERRAL_REWARDS === "true" };
}

export const REFERRAL_REWARD_CAP = 5;

const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
]);

export function samePrivateEmailDomain(left: readonly string[], right: readonly string[]): boolean {
  const domains = (emails: readonly string[]) =>
    emails
      .map((email) => email.split("@")[1]?.trim().toLowerCase())
      .filter((domain): domain is string => {
        if (!domain) return false;
        return !PUBLIC_MAIL_DOMAINS.has(domain);
      });
  const owned = new Set(domains(left));
  return domains(right).some((domain) => owned.has(domain));
}

/** One free month each, only when every abuse check passes. */
export function referralRewardDecision(input: {
  selfReferral: boolean;
  sameCard: boolean;
  samePrivateDomain: boolean;
  rewardsInWindow: number;
}): "grant" | "decline" {
  if (
    input.selfReferral ||
    input.sameCard ||
    input.samePrivateDomain ||
    input.rewardsInWindow >= REFERRAL_REWARD_CAP
  ) {
    return "decline";
  }
  return "grant";
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
